import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveOutboundContactName } from './contactDisplayName.ts';
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
import {
  buildOutboundMediaPayload,
  defaultMimeForMediaType,
  type MediaType,
} from './whatsappOutboundMedia.ts';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
  customerPhoneFromStableKey,
  resolveWhatsAppLine,
} from './whatsappLines.ts';
import { queuePersistedAudioTranscription } from './whatsappMediaHydrate.ts';

export type { MediaType };
export { buildOutboundMediaPayload, defaultMimeForMediaType };

export const WHATSAPP_API_VERSION = 'v21.0';
export const WHATSAPP_API_TIMEOUT_MS = 20000;
/** Upload a Graph puede superar 20s con PDFs/videos medianos. */
export const WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS = 60000;
export const STATIC_STICKER_MAX_BYTES = 100 * 1024;
export const ANIMATED_STICKER_MAX_BYTES = 500 * 1024;
export const MAX_BATCH_ATTACHMENTS = 10;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const BATCH_ALLOWED_MEDIA: MediaType[] = ['image', 'audio', 'video', 'document'];

/** Limpia archivado al reactivar una conversación por mensaje o reacción. */
export const UNARCHIVE_CONVERSATION_PATCH = {
  is_archived: false,
  archived_at: null,
} as const;

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
  clientRequestId?: string;
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

export function outboundCustomerPhone(to: string): string {
  const customer = customerPhoneFromStableKey(to);
  const recipient = resolveRecipient(customer);
  return recipient.phone ? normalizePhone(recipient.phone) : getStableKeyFromRecipient(customer);
}

export function outboundConversationKey(to: string, phoneNumberId?: string): string {
  return conversationStableKey(outboundCustomerPhone(to), phoneNumberId);
}

export function getGraphCredentials(phoneNumberIdOverride?: string): GraphCredentials {
  const line = resolveWhatsAppLine(phoneNumberIdOverride);
  const accessToken = (
    line === 'commercial'
      ? (Deno.env.get('WHATSAPP_COMMERCIAL_ACCESS_TOKEN')?.trim()
        || Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim()
        || '')
      : (Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() ?? '')
  );
  const phoneNumberId = (
    phoneNumberIdOverride?.trim()
    || (line === 'commercial'
      ? (Deno.env.get('WHATSAPP_COMMERCIAL_PHONE_NUMBER_ID')?.trim() || COMMERCIAL_PHONE_NUMBER_ID)
      : (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim() || BOT_PHONE_NUMBER_ID))
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

export async function uploadMediaBinaryToMeta(params: {
  phoneNumberId: string;
  accessToken: string;
  file: Blob;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', params.mimeType);
  form.append('file', params.file, params.filename);

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${params.phoneNumberId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form,
      signal: AbortSignal.timeout(WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(payload.id ?? '').trim();
  if (!response.ok || !id) {
    const message =
      metaErrorMessage({ metaResponse: payload }) ??
      `Meta media upload failed (${response.status})`;
    throw new Error(message);
  }
  return id;
}

async function resolveOutboundMediaForMeta(
  supabase: SupabaseClient,
  params: {
    mediaType: MediaType;
    mediaUrl: string;
    storagePath?: string;
    mimeType?: string;
    filename?: string;
    phoneNumberId: string;
    accessToken: string;
  },
): Promise<{ mediaId?: string; mediaUrlForLog: string }> {
  let mediaUrlForLog = params.mediaUrl;
  const storagePath = params.storagePath?.trim();

  if (storagePath) {
    mediaUrlForLog =
      params.mediaType === 'sticker'
        ? await createStickerSignedUrl(
            supabase,
            storagePath,
            OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
          )
        : await createWhatsAppMediaSignedUrl(
            supabase,
            storagePath,
            OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
          );

    const bucket = params.mediaType === 'sticker' ? 'whatsapp-stickers' : 'whatsapp-media';
    const objectPath =
      params.mediaType === 'sticker' ? stickerStorageObjectPath(storagePath) : storagePath;
    const { data: blob, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !blob) {
      throw error ?? new Error('No se pudo leer el archivo desde Storage.');
    }

    const mimeType =
      params.mimeType?.trim() ||
      blob.type?.trim() ||
      defaultMimeForMediaType(params.mediaType);
    const filename =
      params.filename?.trim() ||
      objectPath.split('/').pop() ||
      `file.${mimeType.split('/')[1] || 'bin'}`;

    const mediaId = await uploadMediaBinaryToMeta({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
      file: blob,
      mimeType,
      filename,
    });
    return { mediaId, mediaUrlForLog };
  }

  // Sin storagePath: si hay HTTPS, subimos el binario a Meta (evita weblink).
  if (params.mediaUrl.startsWith('https://')) {
    const fileRes = await fetch(params.mediaUrl, {
      signal: AbortSignal.timeout(WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS),
    });
    if (!fileRes.ok) {
      throw new Error(`No se pudo descargar media para subir a Meta (${fileRes.status}).`);
    }
    const bytes = await fileRes.arrayBuffer();
    const mimeType =
      params.mimeType?.trim() ||
      fileRes.headers.get('content-type')?.split(';')[0]?.trim() ||
      defaultMimeForMediaType(params.mediaType);
    const filename =
      params.filename?.trim() ||
      `file.${mimeType.split('/')[1] || 'bin'}`;
    const mediaId = await uploadMediaBinaryToMeta({
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
      file: new Blob([bytes], { type: mimeType }),
      mimeType,
      filename,
    });
    return { mediaId, mediaUrlForLog };
  }

  // Último recurso (p.ej. URL no https): link — Meta suele fallar con Storage signed URLs.
  return { mediaUrlForLog };
}

export async function sendToMeta(params: {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  messageBody?: string;
  mediaUrl?: string;
  mediaId?: string;
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
  } else if (params.mediaType && (params.mediaId || params.mediaUrl)) {
    const mediaPayload = buildOutboundMediaPayload({
      mediaType: params.mediaType,
      mediaId: params.mediaId,
      mediaUrl: params.mediaUrl,
      caption: params.caption,
      filename: params.filename,
    });
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
    : params.mediaType && (params.mediaId || params.mediaUrl)
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

export function buildTemplateDisplayBody(
  templateName: string,
  components?: Array<Record<string, unknown>>,
): string {
  if (!components?.length) return `[Plantilla] ${templateName}`;
  const chunks: string[] = [];
  for (const component of components) {
    const parameters = Array.isArray(component.parameters) ? component.parameters : [];
    const texts = parameters
      .map((p) =>
        p && typeof p === 'object' && (p as { type?: string }).type === 'text'
          ? String((p as { text?: string }).text ?? '').trim()
          : '',
      )
      .filter(Boolean);
    if (texts.length) chunks.push(texts.join(' '));
  }
  return chunks.length ? `[Plantilla ${templateName}] ${chunks.join('\n')}` : `[Plantilla] ${templateName}`;
}

export async function ensureConversation(
  supabase: SupabaseClient,
  stableKey: string,
  recipientPhone: string,
  phoneNumberId: string,
  contactName?: string | null,
) {
  const { data: existing, error: readError } = await supabase
    .from('whatsapp_conversations')
    .select('contact_name, contact_name_locked')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (readError) throw readError;

  const row: Record<string, unknown> = {
    stable_key: stableKey,
    phone: recipientPhone,
    contact_phone: recipientPhone,
    phone_number_id: phoneNumberId || null,
    state: 'active',
    ...UNARCHIVE_CONVERSATION_PATCH,
  };

  const nameToSet = resolveOutboundContactName({
    incomingName: contactName,
    existingContactName: existing?.contact_name as string | null | undefined,
    contactNameLocked: existing?.contact_name_locked as boolean | null | undefined,
  });
  if (nameToSet) {
    row.contact_name = nameToSet;
  }

  const { error } = await supabase.from('whatsapp_conversations').upsert(row, {
    onConflict: 'stable_key',
  });
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
      ...UNARCHIVE_CONVERSATION_PATCH,
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

  const recipientPhone = outboundCustomerPhone(params.to);
  const stableKey = outboundConversationKey(recipientPhone, graph.phoneNumberId);
  const recipient = resolveRecipient(recipientPhone);

  await ensureConversation(supabase, stableKey, recipientPhone, graph.phoneNumberId);

  // Meta no puede descargar signed URLs de Supabase de forma fiable (131053 / HTTP 500).
  // Subimos el binario a Graph `/media` y enviamos por `id`.
  let mediaUrlForLog = params.mediaUrl;
  let mediaId: string | undefined;
  try {
    const resolved = await resolveOutboundMediaForMeta(supabase, {
      mediaType: params.mediaType,
      mediaUrl: params.mediaUrl,
      storagePath: params.storagePath,
      mimeType: params.mimeType,
      filename: params.filename,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
    });
    mediaUrlForLog = resolved.mediaUrlForLog;
    mediaId = resolved.mediaId;
  } catch (error) {
    return { success: false, error: formatError(error) };
  }

  const metaResult = await sendToMeta({
    to: recipientPhone,
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    ...(mediaId ? { mediaId } : { mediaUrl: mediaUrlForLog }),
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
    media_url: mediaUrlForLog,
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
    media_id: mediaId ?? null,
    storage_path: params.storagePath ?? null,
    mime_type: params.mimeType ?? null,
    size_bytes: typeof params.sizeBytes === 'number' ? params.sizeBytes : null,
    is_animated_sticker: params.isAnimatedSticker === true,
    client_request_id: params.clientRequestId ?? null,
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

  if (params.mediaType === 'audio' && persisted.messageId) {
    await queuePersistedAudioTranscription(supabase, persisted.messageId);
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
    contactName?: string | null;
    clientRequestId?: string;
  },
): Promise<SendMediaOutboundResult> {
  assertMetaSendEnabled();
  const graph = getGraphCredentials(params.phoneNumberId);

  if (await isRecipientBlocked(supabase, params.to)) {
    return { success: false, error: 'recipient_blocked' };
  }

  const recipientPhone = outboundCustomerPhone(params.to);
  const stableKey = outboundConversationKey(recipientPhone, graph.phoneNumberId);
  const recipient = resolveRecipient(recipientPhone);

  await ensureConversation(
    supabase,
    stableKey,
    recipientPhone,
    graph.phoneNumberId,
    params.contactName,
  );

  const metaResult = await sendToMeta({
    to: recipientPhone,
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
    client_request_id: params.clientRequestId ?? null,
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
