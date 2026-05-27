import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildRecipientPayload,
  getBlocklistKey,
  getStableKeyFromRecipient,
  normalizePhone,
  resolveRecipient,
} from './whatsappIdentity.ts';
import {
  createWhatsAppMediaSignedUrl,
  OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
} from './whatsappMediaStorage.ts';

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export const WHATSAPP_API_VERSION = 'v21.0';
export const WHATSAPP_API_TIMEOUT_MS = 20000;
export const STATIC_STICKER_MAX_BYTES = 100 * 1024;
export const ANIMATED_STICKER_MAX_BYTES = 500 * 1024;
export const MAX_BATCH_ATTACHMENTS = 10;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const BATCH_ALLOWED_MEDIA: MediaType[] = ['image', 'audio', 'video', 'document'];

export interface GraphCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export interface MetaSendResult {
  status: 'sent' | 'failed';
  waMessageId: string | null;
  payload: Record<string, unknown>;
  logMessageBody: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
  errorMessage?: string;
}

export interface SendMediaOutboundParams {
  to: string;
  mediaType: MediaType;
  mediaUrl: string;
  caption?: string;
  filename?: string;
  replyToWaMessageId?: string;
  batchId?: string;
  batchIndex?: number;
  clientAttachmentId?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  isAnimatedSticker?: boolean;
  phoneNumberId?: string;
  agentUid: string;
}

export interface SendMediaOutboundResult {
  success: boolean;
  waMessageId?: string;
  messageId?: string;
  createdAt?: string;
  error?: string;
}

export function formatError(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value) => typeof value === 'string' && value.length > 0);
    if (parts.length) return parts.join(' — ');
  }
  return String(error);
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  );
}

export function normalizeWaMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function metaErrorMessage(payload: Record<string, unknown>): string | undefined {
  const metaResponse = payload.metaResponse as { error?: { message?: string; code?: number } } | undefined;
  return metaResponse?.error?.message;
}

export function metaErrorCode(payload: Record<string, unknown>): number | undefined {
  const metaResponse = payload.metaResponse as { error?: { code?: number } } | undefined;
  return metaResponse?.error?.code;
}

export function getGraphCredentials(phoneNumberIdOverride?: string): GraphCredentials {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() ?? '';
  const phoneNumberId = (
    phoneNumberIdOverride?.trim() ||
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim() ||
    ''
  );
  if (!accessToken || !phoneNumberId) {
    throw new Error('Credenciales WhatsApp incompletas (WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID).');
  }
  return { accessToken, phoneNumberId };
}

export function assertMetaSendEnabled(): void {
  const enabled = Deno.env.get('ENABLE_META_SEND')?.trim().toLowerCase() === 'true';
  if (!enabled) {
    throw new Error('Envio Meta desactivado. Configure ENABLE_META_SEND=true y secrets validos.');
  }
}

export async function isRecipientBlocked(
  supabase: SupabaseClient,
  to: string,
): Promise<boolean> {
  const key = getBlocklistKey(to);
  const { data } = await supabase
    .from('whatsapp_blocklist')
    .select('phone')
    .or(`phone.eq.${key},stable_key.eq.${key},bsuid.eq.${key}`)
    .maybeSingle();
  return Boolean(data);
}

function validateSticker(params: {
  caption?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  isAnimatedSticker?: boolean;
}): string | null {
  if (params.caption || params.filename) {
    return 'Los stickers no admiten caption ni filename';
  }
  if (params.mimeType && params.mimeType !== 'image/webp') {
    return 'Los stickers deben ser image/webp';
  }
  if (typeof params.sizeBytes === 'number') {
    const maxBytes = params.isAnimatedSticker ? ANIMATED_STICKER_MAX_BYTES : STATIC_STICKER_MAX_BYTES;
    if (params.sizeBytes > maxBytes) {
      return params.isAnimatedSticker
        ? 'El sticker animado supera 500 KB'
        : 'El sticker estático supera 100 KB';
    }
  }
  return null;
}

export async function sendToMeta(params: {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  messageBody?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  caption?: string;
  filename?: string;
  replyToWaMessageId?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  reactionToWaMessageId?: string;
  reactionEmoji?: string;
  requirePhone?: boolean;
}): Promise<MetaSendResult> {
  const recipient = resolveRecipient(params.to);
  const recipientPayload = buildRecipientPayload(recipient, {
    requirePhone: params.requirePhone,
  });

  let requestBody: Record<string, unknown>;

  if (params.reactionToWaMessageId !== undefined && params.reactionEmoji !== undefined) {
    requestBody = {
      messaging_product: 'whatsapp',
      ...recipientPayload,
      type: 'reaction',
      reaction: {
        message_id: params.reactionToWaMessageId,
        emoji: params.reactionEmoji,
      },
    };
  } else if (params.templateName) {
    requestBody = {
      messaging_product: 'whatsapp',
      ...recipientPayload,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.templateLanguage ?? 'es_CO' },
        ...(params.templateComponents?.length
          ? { components: params.templateComponents }
          : {}),
      },
    };
  } else if (params.mediaUrl && params.mediaType) {
    const mediaPayload: Record<string, unknown> = { link: params.mediaUrl };
    if (
      params.caption &&
      (params.mediaType === 'image' ||
        params.mediaType === 'video' ||
        params.mediaType === 'document')
    ) {
      mediaPayload.caption = params.caption;
    }
    if (params.mediaType === 'document' && params.filename) {
      mediaPayload.filename = params.filename;
    }
    requestBody = {
      messaging_product: 'whatsapp',
      ...recipientPayload,
      type: params.mediaType,
      [params.mediaType]: mediaPayload,
    };
  } else {
    requestBody = {
      messaging_product: 'whatsapp',
      ...recipientPayload,
      type: 'text',
      text: {
        preview_url: false,
        body: params.messageBody ?? '',
      },
    };
  }

  if (params.replyToWaMessageId) {
    requestBody.context = { message_id: params.replyToWaMessageId };
  }

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(WHATSAPP_API_TIMEOUT_MS),
    },
  );

  const payload = await response.json().catch(() => ({}));
  const waMessageId = normalizeWaMessageId(
    Array.isArray(payload.messages) && payload.messages[0]?.id
      ? String(payload.messages[0].id)
      : null,
  );

  const logMessageBody = params.templateName
    ? (params.messageBody ?? `[Plantilla] ${params.templateName}`)
    : params.mediaUrl && params.mediaType
      ? params.caption || `[${params.mediaType}]`
      : params.reactionEmoji !== undefined
        ? params.reactionEmoji
        : (params.messageBody ?? '');

  return {
    status: response.ok && waMessageId ? 'sent' : 'failed',
    waMessageId,
    logMessageBody,
    mediaType: params.mediaType,
    mediaUrl: params.mediaUrl,
    caption: params.caption,
    filename: params.filename,
    errorMessage: metaErrorMessage({ metaResponse: payload }),
    payload: {
      metaStatus: response.status,
      metaOk: response.ok,
      metaResponse: payload,
    },
  };
}

export async function ensureConversation(
  supabase: SupabaseClient,
  stableKey: string,
  recipientPhone: string,
  phoneNumberId: string,
) {
  const { error } = await supabase.from('whatsapp_conversations').upsert(
    {
      stable_key: stableKey,
      phone: stableKey,
      contact_phone: recipientPhone,
      phone_number_id: phoneNumberId || null,
      state: 'active',
    },
    { onConflict: 'stable_key' },
  );
  if (error) throw error;
}

export async function persistOutboundLog(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  agentUid: string,
): Promise<{ messageId?: string; createdAt?: string }> {
  const baseRow = { ...row, agent_uid: agentUid };

  const attemptInsert = async (payload: Record<string, unknown>) =>
    supabase
      .from('whatsapp_message_log')
      .insert(payload)
      .select('id, created_at')
      .single();

  let { data: message, error: insertError } = await attemptInsert(baseRow);

  if (insertError && isForeignKeyViolation(insertError)) {
    ({ data: message, error: insertError } = await attemptInsert({ ...row, agent_uid: null }));
  }

  if (insertError) {
    const waMessageId = normalizeWaMessageId(row.wa_message_id as string | null | undefined);
    if (isUniqueViolation(insertError) && waMessageId) {
      const { data: existing } = await supabase
        .from('whatsapp_message_log')
        .select('id, created_at')
        .eq('wa_message_id', waMessageId)
        .maybeSingle();
      if (existing) {
        return { messageId: existing.id, createdAt: existing.created_at };
      }
    }
    throw insertError;
  }

  return {
    messageId: message?.id,
    createdAt: message?.created_at,
  };
}

export async function updateConversationPreview(
  supabase: SupabaseClient,
  stableKey: string,
  messageText: string,
  status: 'sent' | 'failed',
  createdAt: string,
) {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_text: messageText,
      last_message_at: createdAt,
      last_message_direction: 'outbound',
      last_message_outbound_status: status,
      unread_count: 0,
    })
    .eq('stable_key', stableKey);

  if (error) console.error('updateConversationPreview failed', error);
}

export async function sendWhatsAppMediaOutbound(
  supabase: SupabaseClient,
  params: SendMediaOutboundParams,
): Promise<SendMediaOutboundResult> {
  assertMetaSendEnabled();
  const graph = getGraphCredentials(params.phoneNumberId);

  if (params.mediaType === 'sticker') {
    const stickerError = validateSticker(params);
    if (stickerError) return { success: false, error: stickerError };
  }

  if (await isRecipientBlocked(supabase, params.to)) {
    return { success: false, error: 'recipient_blocked' };
  }

  const stableKey = getStableKeyFromRecipient(params.to);
  const recipient = resolveRecipient(params.to);
  const recipientPhone = recipient.phone ? normalizePhone(recipient.phone) : stableKey;

  await ensureConversation(supabase, stableKey, recipientPhone, graph.phoneNumberId);

  let mediaUrlForMeta = params.mediaUrl;
  if (params.storagePath?.trim()) {
    mediaUrlForMeta = await createWhatsAppMediaSignedUrl(
      supabase,
      params.storagePath.trim(),
      OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
    );
  }

  const metaResult = await sendToMeta({
    to: params.to,
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    mediaUrl: mediaUrlForMeta,
    mediaType: params.mediaType,
    caption: params.caption,
    filename: params.filename,
    replyToWaMessageId: params.replyToWaMessageId,
  });

  const insertRow: Record<string, unknown> = {
    conversation_stable_key: stableKey,
    recipient_phone: recipientPhone,
    recipient_bsuid: recipient.bsuid ?? null,
    direction: 'outbound',
    sender_type: 'agent',
    message_body: metaResult.logMessageBody,
    media_type: params.mediaType,
    media_url: mediaUrlForMeta,
    caption: params.caption ?? null,
    filename: params.filename ?? null,
    status: metaResult.status,
    wa_message_id: metaResult.waMessageId,
    reply_to_wa_message_id: params.replyToWaMessageId ?? null,
    campaign_type: 'OTHER',
    phone_number_id: graph.phoneNumberId,
    error_message: metaResult.errorMessage ?? null,
    raw_payload: metaResult.payload,
    batch_id: params.batchId ?? null,
    batch_index: typeof params.batchIndex === 'number' ? params.batchIndex : null,
    client_attachment_id: params.clientAttachmentId ?? null,
    storage_path: params.storagePath ?? null,
    mime_type: params.mimeType ?? null,
    size_bytes: typeof params.sizeBytes === 'number' ? params.sizeBytes : null,
    is_animated_sticker: params.isAnimatedSticker === true,
  };

  const persisted = await persistOutboundLog(supabase, insertRow, params.agentUid);
  const createdAt = persisted.createdAt ?? new Date().toISOString();

  await updateConversationPreview(
    supabase,
    stableKey,
    metaResult.logMessageBody,
    metaResult.status,
    createdAt,
  );

  if (metaResult.status === 'failed') {
    return {
      success: false,
      messageId: persisted.messageId,
      error: metaResult.errorMessage ?? 'Error al enviar con Meta.',
    };
  }

  return {
    success: true,
    waMessageId: metaResult.waMessageId ?? undefined,
    messageId: persisted.messageId,
    createdAt,
  };
}

export async function sendTextOutbound(
  supabase: SupabaseClient,
  params: {
    to: string;
    text: string;
    phoneNumberId?: string;
    replyToWaMessageId?: string;
    agentUid: string;
    campaignType?: string;
    templateName?: string;
  },
): Promise<SendMediaOutboundResult> {
  assertMetaSendEnabled();
  const graph = getGraphCredentials(params.phoneNumberId);

  if (await isRecipientBlocked(supabase, params.to)) {
    return { success: false, error: 'recipient_blocked' };
  }

  const stableKey = getStableKeyFromRecipient(params.to);
  const recipient = resolveRecipient(params.to);
  const recipientPhone = recipient.phone ? normalizePhone(recipient.phone) : stableKey;

  await ensureConversation(supabase, stableKey, recipientPhone, graph.phoneNumberId);

  const metaResult = await sendToMeta({
    to: params.to,
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    messageBody: params.text,
    replyToWaMessageId: params.replyToWaMessageId,
  });

  const insertRow: Record<string, unknown> = {
    conversation_stable_key: stableKey,
    recipient_phone: recipientPhone,
    recipient_bsuid: recipient.bsuid ?? null,
    direction: 'outbound',
    sender_type: 'agent',
    message_body: params.text,
    status: metaResult.status,
    wa_message_id: metaResult.waMessageId,
    reply_to_wa_message_id: params.replyToWaMessageId ?? null,
    campaign_type: params.campaignType ?? 'OTHER',
    template_name: params.templateName ?? null,
    phone_number_id: graph.phoneNumberId,
    error_message: metaResult.errorMessage ?? null,
    raw_payload: metaResult.payload,
  };

  const persisted = await persistOutboundLog(supabase, insertRow, params.agentUid);
  const createdAt = persisted.createdAt ?? new Date().toISOString();
  await updateConversationPreview(supabase, stableKey, params.text, metaResult.status, createdAt);

  if (metaResult.status === 'failed') {
    return {
      success: false,
      messageId: persisted.messageId,
      error: metaResult.errorMessage ?? 'Error al enviar con Meta.',
    };
  }

  return {
    success: true,
    waMessageId: metaResult.waMessageId ?? undefined,
    messageId: persisted.messageId,
  };
}

export function stickerStorageObjectPath(storagePath: string): string {
  const trimmed = storagePath.trim();
  return trimmed.startsWith('whatsapp-stickers/') ? trimmed.slice('whatsapp-stickers/'.length) : trimmed;
}

export async function createStickerSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const objectPath = stickerStorageObjectPath(storagePath);
  const { data, error } = await supabase.storage
    .from('whatsapp-stickers')
    .createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error('No se pudo firmar URL del sticker.');
  return data.signedUrl;
}

export async function blockOnMeta(
  phoneNumberId: string,
  accessToken: string,
  users: string[],
): Promise<{ attempted: boolean; success: boolean; errorCode?: string }> {
  if (!users.length) return { attempted: false, success: false };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/block_users`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          block_users: users.map((user) => ({ user })),
        }),
      },
    );
    if (response.ok) return { attempted: true, success: true };
    return { attempted: true, success: false, errorCode: String(response.status) };
  } catch {
    return { attempted: true, success: false, errorCode: 'fetch_error' };
  }
}
