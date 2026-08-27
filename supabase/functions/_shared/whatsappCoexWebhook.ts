import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { conversationStableKey, isCommercialPhoneNumberId } from './whatsappLines.ts';

type JsonRecord = Record<string, unknown>;

export interface CoexProcessResult {
  echoes: number;
  historyMessages: number;
  contacts: number;
  skipped: number;
  errors: string[];
}

export const COMMERCIAL_ORPHAN_STATUS_STUB =
  'Enviado desde WhatsApp Business / Facebook';

export function isCommercialOrphanStatusStub(body: string | null | undefined): boolean {
  return (body ?? '').trim() === COMMERCIAL_ORPHAN_STATUS_STUB;
}

export function shouldPersistCommercialOrphanStatus(params: {
  phoneNumberId?: string | null;
  recipientId?: string | null;
  waMessageId?: string | null;
}): boolean {
  return Boolean(
    isCommercialPhoneNumberId(params.phoneNumberId) &&
      (params.recipientId ?? '').trim() &&
      (params.waMessageId ?? '').trim(),
  );
}

export function shouldUpgradeCoexStub(
  existingBody: string | null | undefined,
  incomingBody: string | null | undefined,
): boolean {
  const incoming = (incomingBody ?? '').trim();
  if (!incoming || isCommercialOrphanStatusStub(incoming)) return false;
  const existing = (existingBody ?? '').trim();
  return !existing || isCommercialOrphanStatusStub(existing);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getUnixDate(value: unknown): string {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  return new Date(timestamp * 1000).toISOString();
}

function messageBody(message: JsonRecord): string | null {
  const type = getString(message.type) || 'text';
  if (type === 'text') return getString(asRecord(message.text).body) || null;
  const caption = getString(asRecord(message[type]).caption);
  return caption || `[${type}]`;
}

export function shouldIgnoreBotCoexField(
  field: string,
  phoneNumberId: string | null,
): boolean {
  if (field !== 'smb_message_echoes' && field !== 'history' && field !== 'smb_app_state_sync') {
    return false;
  }
  return !isCommercialPhoneNumberId(phoneNumberId);
}

export function parseCoexCustomerPhone(
  message: JsonRecord,
  businessPhoneNumberId: string,
  threadCustomerPhone?: string,
): {
  customerPhone: string;
  direction: 'inbound' | 'outbound';
} | null {
  const from = getString(message.from);
  const to = getString(message.to);
  const threadCustomer = (threadCustomerPhone ?? '').trim();
  const historyContext = asRecord(message.history_context);
  const fromMe =
    typeof message.from_me === 'boolean'
      ? message.from_me
      : typeof historyContext.from_me === 'boolean'
        ? historyContext.from_me
        : undefined;

  if (threadCustomer) {
    if (fromMe === true) return { customerPhone: threadCustomer, direction: 'outbound' };
    if (fromMe === false) return { customerPhone: threadCustomer, direction: 'inbound' };
    if (from && from === threadCustomer) {
      return { customerPhone: threadCustomer, direction: 'inbound' };
    }
    if ((to && to === threadCustomer) || (from && from !== threadCustomer)) {
      return { customerPhone: threadCustomer, direction: 'outbound' };
    }
    return { customerPhone: threadCustomer, direction: 'inbound' };
  }

  if (!from && !to) return null;
  // Echoes from the Business App are outbound: from=business, to=customer.
  if (to && from && to !== from) {
    return { customerPhone: to, direction: 'outbound' };
  }
  if (to) return { customerPhone: to, direction: 'outbound' };
  if (from) return { customerPhone: from, direction: 'inbound' };
  void businessPhoneNumberId;
  return null;
}

export async function persistCoexMessage(params: {
  supabase: SupabaseClient;
  message: JsonRecord;
  phoneNumberId: string;
  threadCustomerPhone?: string;
  defaultDirection?: 'inbound' | 'outbound';
  incrementUnread?: boolean;
}): Promise<'inserted' | 'updated' | 'duplicate' | 'skipped'> {
  const parsed = parseCoexCustomerPhone(
    params.message,
    params.phoneNumberId,
    params.threadCustomerPhone,
  );
  if (!parsed) return 'skipped';
  const waMessageId = getString(params.message.id);
  if (!waMessageId) return 'skipped';

  const { data: existing, error: existingError } = await params.supabase
    .from('whatsapp_message_log')
    .select('id, message_body, conversation_stable_key')
    .eq('wa_message_id', waMessageId)
    .maybeSingle();
  if (existingError) throw existingError;

  const direction = params.defaultDirection ?? parsed.direction;
  const stableKey = conversationStableKey(parsed.customerPhone, params.phoneNumberId);
  const body = messageBody(params.message);
  const createdAt = getUnixDate(params.message.timestamp);

  if (existing) {
    if (!shouldUpgradeCoexStub(existing.message_body as string | null, body)) {
      return 'duplicate';
    }
    const { error: upgradeError } = await params.supabase
      .from('whatsapp_message_log')
      .update({
        message_body: body,
        raw_payload: params.message,
        sender_type: direction === 'outbound' ? 'app' : 'user',
        direction,
      })
      .eq('id', existing.id);
    if (upgradeError) throw upgradeError;

    const conversationKey = String(existing.conversation_stable_key || stableKey);
    const { data: existingConv } = await params.supabase
      .from('whatsapp_conversations')
      .select('last_message_text')
      .eq('stable_key', conversationKey)
      .maybeSingle();
    if (
      !existingConv ||
      shouldUpgradeCoexStub(existingConv.last_message_text as string | null, body)
    ) {
      await params.supabase.from('whatsapp_conversations').update({
        last_message_text: body,
        last_message_at: createdAt,
        last_message_direction: direction,
      }).eq('stable_key', conversationKey);
    }
    return 'updated';
  }

  const { data: existingConv } = await params.supabase
    .from('whatsapp_conversations')
    .select('unread_count')
    .eq('stable_key', stableKey)
    .maybeSingle();

  const conversationPatch: Record<string, unknown> = {
    stable_key: stableKey,
    phone: parsed.customerPhone,
    contact_phone: parsed.customerPhone,
    state: 'active',
    last_message_text: body,
    last_message_at: createdAt,
    last_message_direction: direction,
    phone_number_id: params.phoneNumberId,
  };
  if (params.incrementUnread === true && direction === 'inbound') {
    conversationPatch.unread_count = Number(existingConv?.unread_count ?? 0) + 1;
  }

  await params.supabase.from('whatsapp_conversations').upsert(
    conversationPatch,
    { onConflict: 'stable_key' },
  );

  const { error: insertError } = await params.supabase.from('whatsapp_message_log').insert({
    conversation_stable_key: stableKey,
    recipient_phone: parsed.customerPhone,
    direction,
    sender_type: direction === 'outbound' ? 'app' : 'user',
    message_body: body,
    status: direction === 'outbound' ? 'sent' : 'received',
    wa_message_id: waMessageId,
    phone_number_id: params.phoneNumberId,
    hidden_from_panel: false,
    raw_payload: params.message,
    created_at: createdAt,
  });
  if (insertError && String((insertError as { code?: string }).code) === '23505') {
    return 'duplicate';
  }
  if (insertError) throw insertError;
  return 'inserted';
}

export async function persistCommercialOrphanStatus(params: {
  supabase: SupabaseClient;
  status: JsonRecord;
  phoneNumberId: string | null;
}): Promise<{
  id: string;
  conversation_stable_key: string;
  raw_payload: unknown;
  recipient_phone: string;
} | null> {
  const waMessageId = getString(params.status.id);
  const recipientId = getString(params.status.recipient_id);
  if (
    !shouldPersistCommercialOrphanStatus({
      phoneNumberId: params.phoneNumberId,
      recipientId,
      waMessageId,
    })
  ) {
    return null;
  }

  const phoneNumberId = (params.phoneNumberId ?? '').trim();
  const stableKey = conversationStableKey(recipientId, phoneNumberId);
  const createdAt = getUnixDate(params.status.timestamp);
  const deliveryStatus = getString(params.status.status) || 'sent';

  const { data: existingConv } = await params.supabase
    .from('whatsapp_conversations')
    .select('last_message_at')
    .eq('stable_key', stableKey)
    .maybeSingle();
  const existingLast = existingConv?.last_message_at
    ? new Date(String(existingConv.last_message_at)).getTime()
    : 0;
  const statusTime = new Date(createdAt).getTime();
  const shouldPreview = !existingLast || existingLast <= statusTime;

  await params.supabase.from('whatsapp_conversations').upsert(
    {
      stable_key: stableKey,
      phone: recipientId,
      contact_phone: recipientId,
      state: 'active',
      phone_number_id: phoneNumberId,
      ...(shouldPreview
        ? {
          last_message_text: COMMERCIAL_ORPHAN_STATUS_STUB,
          last_message_at: createdAt,
          last_message_direction: 'outbound',
          last_message_outbound_status: deliveryStatus,
        }
        : {}),
    },
    { onConflict: 'stable_key' },
  );

  const { data: inserted, error: insertError } = await params.supabase
    .from('whatsapp_message_log')
    .insert({
      conversation_stable_key: stableKey,
      recipient_phone: recipientId,
      direction: 'outbound',
      sender_type: 'app',
      message_body: COMMERCIAL_ORPHAN_STATUS_STUB,
      status: deliveryStatus,
      wa_message_id: waMessageId,
      phone_number_id: phoneNumberId,
      hidden_from_panel: false,
      raw_payload: { orphanStatus: params.status },
      created_at: createdAt,
    })
    .select('id, conversation_stable_key, raw_payload, recipient_phone')
    .single();

  if (insertError && String((insertError as { code?: string }).code) === '23505') {
    const { data: existing } = await params.supabase
      .from('whatsapp_message_log')
      .select('id, conversation_stable_key, raw_payload, recipient_phone')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();
    return existing ?? null;
  }
  if (insertError) throw insertError;
  return inserted;
}

export async function processSmbMessageEchoes(params: {
  supabase: SupabaseClient;
  value: JsonRecord;
}): Promise<Pick<CoexProcessResult, 'echoes' | 'skipped' | 'errors'>> {
  const phoneNumberId = getString(asRecord(params.value.metadata).phone_number_id);
  const result = { echoes: 0, skipped: 0, errors: [] as string[] };
  if (shouldIgnoreBotCoexField('smb_message_echoes', phoneNumberId)) {
    result.skipped += 1;
    return result;
  }
  for (const raw of asArray(params.value.message_echoes)) {
    try {
      const status = await persistCoexMessage({
        supabase: params.supabase,
        message: asRecord(raw),
        phoneNumberId,
        defaultDirection: 'outbound',
      });
      if (status === 'inserted' || status === 'updated') result.echoes += 1;
      else result.skipped += 1;
    } catch (error) {
      result.errors.push(`echo: ${String(error)}`);
    }
  }
  return result;
}

export async function processHistory(params: {
  supabase: SupabaseClient;
  value: JsonRecord;
}): Promise<Pick<CoexProcessResult, 'historyMessages' | 'skipped' | 'errors'>> {
  const phoneNumberId = getString(asRecord(params.value.metadata).phone_number_id);
  const result = { historyMessages: 0, skipped: 0, errors: [] as string[] };
  if (shouldIgnoreBotCoexField('history', phoneNumberId)) {
    result.skipped += 1;
    return result;
  }
  for (const chunk of asArray(params.value.history)) {
    for (const thread of asArray(asRecord(chunk).threads)) {
      const threadRecord = asRecord(thread);
      const threadCustomer = getString(threadRecord.id);
      for (const raw of asArray(threadRecord.messages)) {
        try {
          const message = asRecord(raw);
          const status = await persistCoexMessage({
            supabase: params.supabase,
            message,
            phoneNumberId,
            threadCustomerPhone: threadCustomer || undefined,
          });
          if (status === 'inserted') result.historyMessages += 1;
          else result.skipped += 1;
        } catch (error) {
          result.errors.push(`history: ${String(error)}`);
        }
      }
    }
  }
  return result;
}

export async function processSmbAppStateSync(params: {
  supabase: SupabaseClient;
  value: JsonRecord;
}): Promise<Pick<CoexProcessResult, 'contacts' | 'skipped' | 'errors'>> {
  const phoneNumberId = getString(asRecord(params.value.metadata).phone_number_id);
  const result = { contacts: 0, skipped: 0, errors: [] as string[] };
  if (shouldIgnoreBotCoexField('smb_app_state_sync', phoneNumberId)) {
    result.skipped += 1;
    return result;
  }
  for (const raw of asArray(params.value.state_sync)) {
    try {
      const item = asRecord(raw);
      if (getString(item.type) !== 'contact') {
        result.skipped += 1;
        continue;
      }
      if (getString(item.action) === 'remove') {
        result.skipped += 1;
        continue;
      }
      const contact = asRecord(item.contact);
      const phone = getString(contact.phone_number);
      if (!phone) {
        result.skipped += 1;
        continue;
      }
      const { data: existing } = await params.supabase
        .from('crm_directory')
        .select('id, full_name, display_name')
        .or(`phone.eq.${phone},phone.eq.+${phone.replace(/\D/g, '')}`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        result.skipped += 1;
        continue;
      }
      const name = getString(contact.full_name) || getString(contact.first_name) || phone;
      const { error } = await params.supabase.rpc('upsert_directory_entry', {
        p_entry: {
          phone,
          full_name: name,
          display_name: name,
          source: 'WHATSAPP',
          channels: ['WHATSAPP'],
        },
        p_overwrite_classification: false,
        p_replace_tags: false,
      });
      if (error) throw error;
      result.contacts += 1;
    } catch (error) {
      result.errors.push(`state_sync: ${String(error)}`);
    }
  }
  return result;
}
