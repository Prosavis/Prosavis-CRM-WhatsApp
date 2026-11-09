import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  directoryConversationIdColumn,
  remapDirectoryLidToPhone,
  type DirectoryLidRemapClient,
} from './directoryLidRemap.ts';
import { directoryPhoneKey } from './directoryPhone.ts';
import { normalizePhone } from './whatsappIdentity.ts';
import { lidCustomerKey } from './whatsappInboundIdentity.ts';
import {
  conversationStableKey,
  customerPhoneFromStableKey,
  isLidCustomerKey,
  isLidStableKey,
  isWhatsappLidIdentity,
  LID_CUSTOMER_PREFIX,
} from './whatsappLines.ts';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

const UNARCHIVE_CONVERSATION_PATCH = {
  is_archived: false,
  archived_at: null,
} as const;

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

/** Mueve filas sueltas al chat del teléfono. Si la destino ya tiene la fila única, se queda con esa. */
async function moveStableKey(
  supabase: SupabaseClient,
  table: string,
  column: string,
  fromKey: string,
  toKey: string,
): Promise<void> {
  const { error } = await supabase.from(table).update({ [column]: toKey }).eq(column, fromKey);
  if (!error) return;
  if (errorCode(error) !== '23505') throw error;
  const { error: deleteError } = await supabase.from(table).delete().eq(column, fromKey);
  if (deleteError) throw deleteError;
}

export interface LidClaimResult {
  stableKey: string;
  directoryId: string | null;
}

/**
 * Mueve un hilo `lid:` al teléfono marcable: ficha, mensajes y media.
 * Si el chat del teléfono ya existe, se conserva y absorbe el historial del LID.
 */
export async function claimLidConversationPhone(params: {
  supabase: SupabaseClient;
  userId: string;
  phone: string;
  phoneNumberId: string | null;
}): Promise<LidClaimResult> {
  const phone = normalizePhone(params.phone);
  const lidKey = conversationStableKey(lidCustomerKey(params.userId), params.phoneNumberId);
  const phoneKey = conversationStableKey(phone, params.phoneNumberId);
  if (!params.userId.trim() || !phone || lidKey === phoneKey) {
    return { stableKey: phoneKey, directoryId: null };
  }

  const directoryId = await remapDirectoryLidToPhone({
    supabase: params.supabase as unknown as DirectoryLidRemapClient,
    lidKey,
    phoneKey,
    phone,
    phoneNumberId: params.phoneNumberId,
  });

  const { data: lidConv, error: lidReadError } = await params.supabase
    .from('whatsapp_conversations')
    .select(
      'stable_key, unread_count, contact_name, contact_name_locked, whatsapp_profile_name, contact_photo_url, last_message_text, last_message_at, last_message_direction, last_message_outbound_status, last_intent, assigned_to, is_archived, is_pinned, state, tag_ids, metadata, phone_number_id',
    )
    .eq('stable_key', lidKey)
    .maybeSingle();
  if (lidReadError) throw lidReadError;
  if (!lidConv) return { stableKey: phoneKey, directoryId };

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
      phone,
      contact_phone: phone,
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
        phone,
        contact_phone: phone,
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
      recipient_phone: phone,
    })
    .eq('conversation_stable_key', lidKey);
  if (moveMessagesError) throw moveMessagesError;

  const { error: moveMediaError } = await params.supabase
    .from('whatsapp_media_assets')
    .update({ conversation_stable_key: phoneKey })
    .eq('conversation_stable_key', lidKey);
  if (moveMediaError) throw moveMediaError;

  await moveStableKey(params.supabase, 'ctwa_voice_nudges', 'conversation_stable_key', lidKey, phoneKey);
  await moveStableKey(params.supabase, 'whatsapp_conversation_ai_memory', 'stable_key', lidKey, phoneKey);
  await moveStableKey(params.supabase, 'whatsapp_message_log_archive', 'conversation_stable_key', lidKey, phoneKey);
  await moveStableKey(params.supabase, 'whatsapp_review_intent_judgments', 'conversation_stable_key', lidKey, phoneKey);
  await moveStableKey(params.supabase, 'whatsapp_ai_suggestion_log', 'stable_key', lidKey, phoneKey);

  const { error: deleteLidError } = await params.supabase
    .from('whatsapp_conversations')
    .delete()
    .eq('stable_key', lidKey);
  if (deleteLidError) throw deleteLidError;

  return { stableKey: phoneKey, directoryId };
}

/**
 * Antes de abrir un chat por celular: si la ficha de ese phone_key sigue
 * ligada a un hilo lid: de la misma línea, lo absorbe. No mira el nombre.
 */
export async function absorbDirectoryLidLinkedToPhone(params: {
  supabase: SupabaseClient;
  stableKey: string;
  phoneNumberId: string | null;
}): Promise<void> {
  const customer = customerPhoneFromStableKey(params.stableKey);
  if (!customer || isLidCustomerKey(customer) || isWhatsappLidIdentity(customer)) return;

  const digits = directoryPhoneKey(customer);
  if (!digits) return;

  const column = directoryConversationIdColumn(params.phoneNumberId);
  const { data, error } = await params.supabase
    .from('crm_directory')
    .select(`id, ${column}`)
    .eq('phone_key', digits)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const linked = String((data as JsonRecord)[column] ?? '').trim();
  if (!isLidStableKey(linked)) return;

  const userId = customerPhoneFromStableKey(linked).slice(LID_CUSTOMER_PREFIX.length).trim();
  if (!userId) return;

  await claimLidConversationPhone({
    supabase: params.supabase,
    userId,
    phone: normalizePhone(customer),
    phoneNumberId: params.phoneNumberId,
  });
}
