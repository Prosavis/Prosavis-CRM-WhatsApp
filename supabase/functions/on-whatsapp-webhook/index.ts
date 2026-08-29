import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { resolveOutboundContactName } from '../_shared/contactDisplayName.ts';
import { clientFromApiKey, getServiceClient } from '../_shared/supabase.ts';
import { hydratePersistedMessageMedia } from '../_shared/whatsappMediaHydrate.ts';
import {
  CLOUD_API_REVOKED_LABEL,
  cloudApiUnsupportedDisposition,
  getMessageContent,
} from '../_shared/whatsappMessageContent.ts';
import { recomputeWhatsAppConversationPreview } from '../_shared/recomputeConversationPreview.ts';
import { UNARCHIVE_CONVERSATION_PATCH } from '../_shared/whatsappOutbound.ts';
import { directoryPhoneKey } from '../_shared/directoryPhone.ts';
import { REACTIVATION_SEQUENCE } from '../_shared/reactivationCadence.ts';
import { applyColdFailureTag, removeColdFailureTags } from '../_shared/coldAppUserOutreach.ts';
import { conversationStableKey } from '../_shared/whatsappLines.ts';
import {
  persistCommercialOrphanStatus,
  processHistory,
  processSmbAppStateSync,
  processSmbMessageEchoes,
  shouldSkipMissingCommercialStatus,
} from '../_shared/whatsappCoexWebhook.ts';
import {
  formatWebhookError,
  lidCustomerKey,
  resolveInboundCustomer,
} from '../_shared/whatsappInboundIdentity.ts';
import {
  filterCommercialWebhookEvents,
  isReplayAllLinesRequest,
  isReplayUnprocessedRequest,
  replaySinceFromPayload,
} from '../_shared/whatsappWebhookReplay.ts';

const encoder = new TextEncoder();
type JsonRecord = Record<string, unknown>;

interface ProcessingResult {
  inboundMessages: number;
  statuses: number;
  skippedDuplicates: number;
  coexEchoes: number;
  coexHistory: number;
  coexContacts: number;
  errors: string[];
}

interface WebhookEventRow {
  id: string;
  processed: boolean;
  error_message: string | null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyMetaSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!appSecret) return true;
  if (!signature?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));

  return timingSafeEqual(`sha256=${toHex(digest)}`, signature);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(digest);
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

function isUniqueViolation(error: unknown): boolean {
  const record = asRecord(error);
  return getString(record.code) === '23505';
}

function getUnixDate(value: unknown): string {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  return new Date(timestamp * 1000).toISOString();
}

function getEventType(payload: JsonRecord): string {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  const changes = entry && typeof entry === 'object' && 'changes' in entry
    ? (entry as { changes?: unknown }).changes
    : null;
  const firstChange = Array.isArray(changes) ? changes[0] : null;

  if (firstChange && typeof firstChange === 'object' && 'field' in firstChange) {
    return String((firstChange as { field?: unknown }).field ?? 'unknown');
  }

  return 'unknown';
}

function getContactName(contacts: unknown[], senderPhone: string): string | null {
  for (const contact of contacts) {
    const contactRecord = asRecord(contact);
    if (getString(contactRecord.wa_id) !== senderPhone) continue;

    const profile = asRecord(contactRecord.profile);
    const profileName = getString(profile.name);
    if (profileName) return profileName;
  }

  return null;
}

async function remapLidConversationToPhone(params: {
  supabase: ReturnType<typeof getServiceClient>;
  userId: string;
  phone: string;
  phoneNumberId: string | null;
}): Promise<void> {
  const lidKey = conversationStableKey(lidCustomerKey(params.userId), params.phoneNumberId);
  const phoneKey = conversationStableKey(params.phone, params.phoneNumberId);
  if (!params.userId || !params.phone || lidKey === phoneKey) return;

  const { data: lidConv, error: lidReadError } = await params.supabase
    .from('whatsapp_conversations')
    .select(
      'stable_key, unread_count, contact_name, contact_name_locked, whatsapp_profile_name, contact_photo_url, last_message_text, last_message_at, last_message_direction, last_message_outbound_status, last_intent, assigned_to, is_archived, is_pinned, state, tag_ids, metadata, phone_number_id',
    )
    .eq('stable_key', lidKey)
    .maybeSingle();
  if (lidReadError) throw lidReadError;
  if (!lidConv) return;

  const { data: phoneConv, error: phoneReadError } = await params.supabase
    .from('whatsapp_conversations')
    .select('unread_count, last_message_at, last_message_text, last_message_direction, metadata')
    .eq('stable_key', phoneKey)
    .maybeSingle();
  if (phoneReadError) throw phoneReadError;

  const lidMeta = asRecord(lidConv.metadata);
  const nextMetadata = {
    ...asRecord(phoneConv?.metadata),
    ...lidMeta,
    lidUserId: params.userId,
    remappedFromLid: lidKey,
  };

  if (!phoneConv) {
    const { error: insertError } = await params.supabase.from('whatsapp_conversations').insert({
      stable_key: phoneKey,
      phone: params.phone,
      contact_phone: params.phone,
      state: lidConv.state ?? 'active',
      unread_count: lidConv.unread_count ?? 0,
      contact_name: lidConv.contact_name,
      contact_name_locked: lidConv.contact_name_locked,
      whatsapp_profile_name: lidConv.whatsapp_profile_name,
      contact_photo_url: lidConv.contact_photo_url,
      last_message_text: lidConv.last_message_text,
      last_message_at: lidConv.last_message_at,
      last_message_direction: lidConv.last_message_direction,
      last_message_outbound_status: lidConv.last_message_outbound_status,
      last_intent: lidConv.last_intent,
      assigned_to: lidConv.assigned_to,
      is_archived: lidConv.is_archived,
      is_pinned: lidConv.is_pinned,
      tag_ids: lidConv.tag_ids,
      metadata: nextMetadata,
      phone_number_id: params.phoneNumberId ?? lidConv.phone_number_id,
      ...UNARCHIVE_CONVERSATION_PATCH,
    });
    if (insertError) throw insertError;
  } else {
    const lidLast = lidConv.last_message_at
      ? new Date(String(lidConv.last_message_at)).getTime()
      : 0;
    const phoneLast = phoneConv.last_message_at
      ? new Date(String(phoneConv.last_message_at)).getTime()
      : 0;
    const mergeNewer = lidLast > phoneLast;
    const { error: mergeError } = await params.supabase
      .from('whatsapp_conversations')
      .update({
        phone: params.phone,
        contact_phone: params.phone,
        unread_count: Number(phoneConv.unread_count ?? 0) + Number(lidConv.unread_count ?? 0),
        metadata: nextMetadata,
        ...(mergeNewer
          ? {
            last_message_text: lidConv.last_message_text,
            last_message_at: lidConv.last_message_at,
            last_message_direction: lidConv.last_message_direction,
          }
          : {}),
      })
      .eq('stable_key', phoneKey);
    if (mergeError) throw mergeError;
  }

  const { error: moveMessagesError } = await params.supabase
    .from('whatsapp_message_log')
    .update({
      conversation_stable_key: phoneKey,
      recipient_phone: params.phone,
    })
    .eq('conversation_stable_key', lidKey);
  if (moveMessagesError) throw moveMessagesError;

  await params.supabase
    .from('whatsapp_media_assets')
    .update({ conversation_stable_key: phoneKey })
    .eq('conversation_stable_key', lidKey);

  const { error: deleteLidError } = await params.supabase
    .from('whatsapp_conversations')
    .delete()
    .eq('stable_key', lidKey);
  if (deleteLidError) throw deleteLidError;
}

async function processInboundMessage(params: {
  supabase: ReturnType<typeof getServiceClient>;
  message: JsonRecord;
  value: JsonRecord;
  contacts: unknown[];
}): Promise<'inserted' | 'duplicate' | 'skipped' | 'updated'> {
  const identity = resolveInboundCustomer(params.message, params.contacts);
  const waMessageId = getString(params.message.id);
  if (!identity || !waMessageId) {
    throw new Error('Mensaje entrante sin from o id.');
  }

  const { data: existingMessage, error: existingError } = await params.supabase
    .from('whatsapp_message_log')
    .select('id')
    .eq('wa_message_id', waMessageId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingMessage) return 'duplicate';

  const metadata = asRecord(params.value.metadata);
  const phoneNumberId = getString(metadata.phone_number_id) || null;
  const isLid = identity.kind === 'lid';
  const customerKey = identity.customerKey;

  if (identity.kind === 'phone' && identity.userId) {
    await remapLidConversationToPhone({
      supabase: params.supabase,
      userId: identity.userId,
      phone: customerKey,
      phoneNumberId,
    });
  }

  const stableKey = conversationStableKey(customerKey, phoneNumberId);
  const unsupported = cloudApiUnsupportedDisposition(params.message);
  if (unsupported?.kind === 'revoke' && unsupported.originalMessageId) {
    const createdAtForRevoke = getUnixDate(params.message.timestamp);
    const { data: original, error: originalError } = await params.supabase
      .from('whatsapp_message_log')
      .select('id')
      .eq('wa_message_id', unsupported.originalMessageId)
      .maybeSingle();
    if (originalError) throw originalError;
    if (original?.id) {
      const { error: revokeError } = await params.supabase
        .from('whatsapp_message_log')
        .update({
          hidden_from_panel: false,
          message_body: CLOUD_API_REVOKED_LABEL,
          revoked_at: createdAtForRevoke,
          revoked_reason: 'cloud_api',
        })
        .eq('id', original.id);
      if (revokeError) throw revokeError;
      await recomputeWhatsAppConversationPreview(params.supabase, stableKey);
      return 'updated';
    }
  }
  const contactName = identity.profileName ?? getContactName(params.contacts, customerKey);
  const content = getMessageContent(params.message);
  const createdAt = getUnixDate(params.message.timestamp);

  const { data: existingConversation, error: conversationReadError } = await params.supabase
    .from('whatsapp_conversations')
    .select('unread_count, contact_name, contact_name_locked, metadata')
    .eq('stable_key', stableKey)
    .maybeSingle();

  if (conversationReadError) throw conversationReadError;

  const unreadCount = Number(existingConversation?.unread_count ?? 0) + 1;
  const lastMessageText = content.messageBody ?? `[${getString(params.message.type) || 'mensaje'}]`;

  // Nombre CRM (`contact_name`):
  // - Si está locked (p. ej. Auxiliares), NUNCA lo pisa el push name de Meta.
  // - Si ya hay un nombre usable, se queda. WhatsApp solo rellena vacío / número.
  // `whatsapp_profile_name` sí refleja el push name de Meta (incluso emoji) para diagnóstico.
  const isNameLocked = existingConversation?.contact_name_locked === true;
  const nextMetadata: JsonRecord = { ...asRecord(existingConversation?.metadata) };
  if (identity.userId) nextMetadata.lidUserId = identity.userId;
  if (identity.username) nextMetadata.username = identity.username;

  const conversationPatch: Record<string, unknown> = {
    stable_key: stableKey,
    state: 'active',
    last_message_text: lastMessageText,
    last_message_at: createdAt,
    last_message_direction: 'inbound',
    last_message_outbound_status: null,
    unread_count: unreadCount,
    phone_number_id: phoneNumberId,
    metadata: nextMetadata,
    ...UNARCHIVE_CONVERSATION_PATCH,
  };

  if (!isLid) {
    conversationPatch.phone = customerKey;
    conversationPatch.contact_phone = customerKey;
  }

  if (contactName !== null) {
    conversationPatch.whatsapp_profile_name = contactName;
    const nextContactName = resolveOutboundContactName({
      incomingName: contactName,
      existingContactName: existingConversation?.contact_name as string | null | undefined,
      contactNameLocked: isNameLocked,
    });
    if (nextContactName) {
      conversationPatch.contact_name = nextContactName;
    }
  }

  const { error: conversationError } = await params.supabase
    .from('whatsapp_conversations')
    .upsert(conversationPatch, { onConflict: 'stable_key' });

  if (conversationError) throw conversationError;

  const { data: insertedMessage, error: insertError } = await params.supabase
    .from('whatsapp_message_log')
    .insert({
      conversation_stable_key: stableKey,
      recipient_phone: customerKey,
      direction: 'inbound',
      sender_type: 'user',
      message_body: content.messageBody,
      media_type: content.mediaType,
      media_id: content.mediaId,
      media_url: null,
      storage_url: null,
      storage_path: null,
      caption: content.caption,
      status: 'received',
      wa_message_id: waMessageId,
      filename: content.filename,
      mime_type: content.mimeType,
      phone_number_id: phoneNumberId,
      location: content.location,
      contacts: content.contacts,
      reaction_to: content.reactionTo,
      reaction_removed: content.reactionRemoved,
      is_voice_note: content.isVoiceNote,
      raw_payload: params.message,
      created_at: createdAt,
    })
    .select('id')
    .single();

  if (insertError && isUniqueViolation(insertError)) return 'duplicate';
  if (insertError) throw insertError;

  await hydratePersistedMessageMedia({
    supabase: params.supabase,
    messageLogId: insertedMessage?.id ?? null,
    stableKey,
    mediaId: content.mediaId,
    mediaType: content.mediaType,
    mimeType: content.mimeType,
  });

  // Actualiza directorio: last_response_at + opt-out por "PARAR".
  // LID threads have no phone; the directory trigger already no-ops without one.
  if (!isLid) {
    await syncDirectoryOnInbound({
      supabase: params.supabase,
      senderPhone: customerKey,
      messageBody: content.messageBody,
      createdAt,
    });
  }

  return 'inserted';
}

function isStopKeyword(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'parar' ||
    normalized === 'stop' ||
    normalized === 'cancelar' ||
    normalized === 'baja' ||
    normalized === 'unsubscribe'
  );
}

async function syncDirectoryOnInbound(params: {
  supabase: ReturnType<typeof getServiceClient>;
  senderPhone: string;
  messageBody: string | null;
  createdAt: string;
}): Promise<void> {
  try {
    const phoneKey = directoryPhoneKey(params.senderPhone);
    const digits = params.senderPhone.replace(/\D/g, '');
    let query = params.supabase
      .from('crm_directory')
      .select('id,active_sequence,opt_out')
      .limit(1);

    if (phoneKey) {
      query = query.or(`phone_key.eq.${phoneKey},phone.eq.${params.senderPhone},phone.eq.${digits}`);
    } else {
      query = query.or(`phone.eq.${params.senderPhone},phone.eq.${digits}`);
    }

    const { data: entry, error } = await query.maybeSingle();
    if (error || !entry) return;

    const patch: Record<string, unknown> = {
      last_response_at: params.createdAt,
      last_response_text: params.messageBody?.slice(0, 500) ?? null,
    };

    if (isStopKeyword(params.messageBody)) {
      patch.opt_out = true;
      patch.status = 'opt_out';
      if (entry.active_sequence === REACTIVATION_SEQUENCE) {
        patch.active_sequence = 'NINGUNA';
        patch.sequence_step = 0;
      }
      console.log('[on-whatsapp-webhook] opt-out por keyword PARAR/STOP', {
        directoryId: entry.id,
      });
    }

    await params.supabase.from('crm_directory').update(patch).eq('id', entry.id);
  } catch (err) {
    console.error('[on-whatsapp-webhook] syncDirectoryOnInbound failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getStatusErrorMessage(status: JsonRecord): string | null {
  const errors = asArray(status.errors);
  const first = asRecord(errors[0]);
  const title = getString(first.title) || getString(first.message);
  const errorData = asRecord(first.error_data);
  const details = getString(errorData.details);
  const message = [title, details].filter(Boolean).join(' — ');
  return message || null;
}

async function processStatus(params: {
  supabase: ReturnType<typeof getServiceClient>;
  status: JsonRecord;
  phoneNumberId: string | null;
}): Promise<'updated' | 'missing' | 'skipped'> {
  const waMessageId = getString(params.status.id);
  const status = getString(params.status.status);
  if (!waMessageId || !status) {
    throw new Error('Status sin id o status.');
  }

  const { data: foundMessage, error: existingError } = await params.supabase
    .from('whatsapp_message_log')
    .select('id,conversation_stable_key,raw_payload,recipient_phone')
    .eq('wa_message_id', waMessageId)
    .maybeSingle();

  if (existingError) throw existingError;
  let existingMessage = foundMessage;
  if (!existingMessage) {
    existingMessage = await persistCommercialOrphanStatus({
      supabase: params.supabase,
      status: params.status,
      phoneNumberId: params.phoneNumberId,
    });
  }
  if (!existingMessage) {
    if (
      shouldSkipMissingCommercialStatus({
        phoneNumberId: params.phoneNumberId,
        recipientId: getString(params.status.recipient_id),
      })
    ) {
      return 'skipped';
    }
    return 'missing';
  }

  const isFailure = status === 'failed';
  const isSuccessStatus = status === 'sent' || status === 'delivered' || status === 'read';
  const errorMessage = isFailure ? getStatusErrorMessage(params.status) : null;
  const phone = String(existingMessage.recipient_phone ?? '').trim();

  const rawPayload = {
    ...asRecord(existingMessage.raw_payload),
    latestStatus: params.status,
  };

  const messageUpdate: JsonRecord = { status, raw_payload: rawPayload };
  if (isFailure && errorMessage) messageUpdate.error_message = errorMessage;
  // Si Meta recupera la entrega (o el failed llegó fuera de orden), no dejar
  // error_message/tags de fallo pegados en un mensaje que sí llegó.
  if (isSuccessStatus) messageUpdate.error_message = null;

  const { error: updateMessageError } = await params.supabase
    .from('whatsapp_message_log')
    .update(messageUpdate)
    .eq('id', existingMessage.id);

  if (updateMessageError) throw updateMessageError;

  if (existingMessage.conversation_stable_key) {
    const { error: updateConversationError } = await params.supabase
      .from('whatsapp_conversations')
      .update({ last_message_outbound_status: status })
      .eq('stable_key', existingMessage.conversation_stable_key);

    if (updateConversationError) throw updateConversationError;
  }

  // Reconciliar envíos masivos: un fallo de entrega async debe marcar al
  // destinatario como 'failed' y recalcular los conteos del job (de lo contrario
  // el envío reportaría como "enviado" un mensaje que nunca llegó).
  if (isFailure) {
    const { error: reconcileError } = await params.supabase.rpc('reconcile_broadcast_on_status', {
      p_wa_message_id: waMessageId,
      p_status: status,
      p_error: errorMessage,
    });
    if (reconcileError) throw reconcileError;

    // Misma clasificación Negativos que cold outreach (undeliverable Meta /
    // failed to be sent) para métricas y exclusión de reintentos.
    if (phone) {
      try {
        await applyColdFailureTag(params.supabase, {
          phone,
          errorMessage,
        });
      } catch (tagErr) {
        console.warn('[on-whatsapp-webhook] applyColdFailureTag failed', {
          phone,
          error: tagErr instanceof Error ? tagErr.message : String(tagErr),
        });
      }
    }
  } else if (isSuccessStatus && phone) {
    try {
      await removeColdFailureTags(params.supabase, { phone });
    } catch (tagErr) {
      console.warn('[on-whatsapp-webhook] removeColdFailureTags failed', {
        phone,
        error: tagErr instanceof Error ? tagErr.message : String(tagErr),
      });
    }
  }

  return 'updated';
}

async function processPayload(
  supabase: ReturnType<typeof getServiceClient>,
  payload: JsonRecord,
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    inboundMessages: 0,
    statuses: 0,
    skippedDuplicates: 0,
    coexEchoes: 0,
    coexHistory: 0,
    coexContacts: 0,
    errors: [],
  };

  for (const entry of asArray(payload.entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const changeRecord = asRecord(change);
      const field = getString(changeRecord.field) || 'messages';
      const value = asRecord(changeRecord.value);
      const contacts = asArray(value.contacts);

      if (field === 'smb_message_echoes') {
        const coex = await processSmbMessageEchoes({ supabase, value });
        result.coexEchoes += coex.echoes;
        result.skippedDuplicates += coex.skipped;
        result.errors.push(...coex.errors);
        continue;
      }
      if (field === 'history') {
        const coex = await processHistory({ supabase, value });
        result.coexHistory += coex.historyMessages;
        result.skippedDuplicates += coex.skipped;
        result.errors.push(...coex.errors);
        continue;
      }
      if (field === 'smb_app_state_sync') {
        const coex = await processSmbAppStateSync({ supabase, value });
        result.coexContacts += coex.contacts;
        result.skippedDuplicates += coex.skipped;
        result.errors.push(...coex.errors);
        continue;
      }

      for (const rawMessage of asArray(value.messages)) {
        try {
          const processed = await processInboundMessage({
            supabase,
            message: asRecord(rawMessage),
            value,
            contacts,
          });

          if (processed === 'duplicate' || processed === 'skipped') result.skippedDuplicates += 1;
          else if (processed === 'inserted') result.inboundMessages += 1;
        } catch (error) {
          result.errors.push(`message: ${formatWebhookError(error)}`);
        }
      }

      const phoneNumberId = getString(asRecord(value.metadata).phone_number_id) || null;

      for (const rawStatus of asArray(value.statuses)) {
        try {
          const processed = await processStatus({
            supabase,
            status: asRecord(rawStatus),
            phoneNumberId,
          });

          if (processed === 'missing') {
            result.errors.push(`status: no existe mensaje ${getString(asRecord(rawStatus).id)}`);
          } else if (processed === 'updated') {
            result.statuses += 1;
          }
        } catch (error) {
          result.errors.push(`status: ${formatWebhookError(error)}`);
        }
      }
    }
  }

  return result;
}

async function createOrGetWebhookEvent(params: {
  supabase: ReturnType<typeof getServiceClient>;
  payload: JsonRecord;
  payloadHash: string;
  signature: string | null;
  verified: boolean;
  processingMode: 'active' | 'shadow';
  errorMessage: string | null;
}): Promise<{ event: WebhookEventRow; created: boolean }> {
  const { data, error } = await params.supabase
    .from('whatsapp_webhook_events')
    .insert({
      event_type: getEventType(params.payload),
      payload: params.payload,
      payload_sha256: params.payloadHash,
      signature: params.signature,
      verified: params.verified,
      processing_mode: params.processingMode,
      processed: false,
      error_message: params.errorMessage,
    })
    .select('id,processed,error_message')
    .single();

  if (!error && data) return { event: data, created: true };
  if (error && !isUniqueViolation(error)) throw error;

  const { data: existingEvent, error: existingError } = await params.supabase
    .from('whatsapp_webhook_events')
    .select('id,processed,error_message')
    .eq('payload_sha256', params.payloadHash)
    .single();

  if (existingError) throw existingError;
  return { event: existingEvent, created: false };
}

function decodeJwtPayload(token: string): JsonRecord | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return asRecord(JSON.parse(atob(normalized + pad)));
  } catch {
    return null;
  }
}

async function authorizeServiceRoleReplay(req: Request): Promise<boolean> {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return false;
  if (expected && token.length === expected.length && timingSafeEqual(token, expected)) {
    return true;
  }
  if (getString(decodeJwtPayload(token)?.role) !== 'service_role') return false;
  try {
    const probe = clientFromApiKey(token);
    const { error } = await probe.from('whatsapp_webhook_events').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function replayUnprocessedCommercialEvents(
  supabase: ReturnType<typeof getServiceClient>,
  since: string,
  allLines = false,
): Promise<{
  since: string;
  scanned: number;
  replayed: number;
  results: Array<{
    id: string;
    processed: boolean;
    inboundMessages: number;
    statuses: number;
    errors: string[];
  }>;
}> {
  const { data: events, error } = await supabase
    .from('whatsapp_webhook_events')
    .select('id, payload, processed, error_message, received_at')
    .eq('processed', false)
    .gte('received_at', since)
    .order('received_at', { ascending: true })
    .limit(500);

  if (error) throw error;
  const commercialEvents = allLines
    ? (events ?? [])
    : filterCommercialWebhookEvents(events ?? []);
  const results: Array<{
    id: string;
    processed: boolean;
    inboundMessages: number;
    statuses: number;
    errors: string[];
  }> = [];

  for (const event of commercialEvents) {
    const processingResult = await processPayload(supabase, asRecord(event.payload));
    const processed = processingResult.errors.length === 0;
    const errorMessage = processed ? null : processingResult.errors.join(' | ');
    const { error: updateError } = await supabase
      .from('whatsapp_webhook_events')
      .update({ processed, error_message: errorMessage })
      .eq('id', event.id);
    if (updateError) throw updateError;
    results.push({
      id: event.id,
      processed,
      inboundMessages: processingResult.inboundMessages,
      statuses: processingResult.statuses,
      errors: processingResult.errors,
    });
  }

  return {
    since,
    scanned: (events ?? []).length,
    replayed: results.length,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
      return new Response(challenge, { headers: corsHeaders });
    }

    return jsonResponse({ error: 'Token de verificacion invalido.' }, 403);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const verified = await verifyMetaSignature(rawBody, signature);
    const processingMode = Deno.env.get('WHATSAPP_WEBHOOK_MODE') === 'active' ? 'active' : 'shadow';
    const supabase = getServiceClient();
    const payloadHash = await sha256Hex(rawBody);
    let payload: JsonRecord = {};
    let parseError: string | null = null;

    try {
      payload = asRecord(JSON.parse(rawBody || '{}'));
    } catch (error) {
      parseError = `JSON invalido: ${formatWebhookError(error)}`;
      payload = { rawBody };
    }

    if (!parseError && isReplayUnprocessedRequest(payload)) {
      if (!await authorizeServiceRoleReplay(req)) {
        return jsonResponse({ error: 'No autorizado.' }, 401);
      }
      const replay = await replayUnprocessedCommercialEvents(
        supabase,
        replaySinceFromPayload(payload),
        isReplayAllLinesRequest(payload),
      );
      return jsonResponse({ ok: true, replay });
    }

    const initialErrorMessage = parseError ?? (verified ? null : 'Firma Meta invalida.');
    const { event, created } = await createOrGetWebhookEvent({
      supabase,
      payload,
      payloadHash,
      signature,
      verified,
      processingMode,
      errorMessage: initialErrorMessage,
    });

    if (!verified) return jsonResponse({ error: 'Firma Meta invalida.' }, 401);
    if (parseError) return jsonResponse({ error: parseError }, 400);
    if (!created && event.processed) {
      return jsonResponse({ ok: true, duplicate: true, mode: processingMode });
    }
    if (processingMode !== 'active') return jsonResponse({ ok: true, mode: processingMode });

    const processingResult = await processPayload(supabase, payload);
    const processed = processingResult.errors.length === 0;
    const errorMessage = processed ? null : processingResult.errors.join(' | ');

    const { error: updateEventError } = await supabase
      .from('whatsapp_webhook_events')
      .update({
        processed,
        error_message: errorMessage,
      })
      .eq('id', event.id);

    if (updateEventError) throw updateEventError;

    return jsonResponse({
      ok: processed,
      mode: processingMode,
      result: processingResult,
    }, processed ? 200 : 207);
  } catch (error) {
    return jsonResponse({ error: formatWebhookError(error) }, 500);
  }
});
