import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import {
  buildStoragePath,
  downloadWhatsAppMediaFromMeta,
  getWhatsAppAccessToken,
  OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
  persistToWhatsAppBucket,
} from '../_shared/whatsappMediaStorage.ts';
import { UNARCHIVE_CONVERSATION_PATCH } from '../_shared/whatsappOutbound.ts';

const encoder = new TextEncoder();
type JsonRecord = Record<string, unknown>;

interface ProcessingResult {
  inboundMessages: number;
  statuses: number;
  skippedDuplicates: number;
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

function getMessageContent(message: JsonRecord): {
  messageBody: string | null;
  mediaType: string | null;
  mediaId: string | null;
  caption: string | null;
  mimeType: string | null;
  filename: string | null;
  location: JsonRecord | null;
  contacts: unknown[] | null;
  reactionTo: string | null;
  reactionRemoved: boolean;
  isVoiceNote: boolean;
} {
  const type = getString(message.type) || 'unknown';

  if (type === 'text') {
    const text = asRecord(message.text);
    return {
      messageBody: getString(text.body) || null,
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts: null,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'location') {
    const location = asRecord(message.location);
    return {
      messageBody: getString(location.name) || getString(location.address) || '[ubicación]',
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location,
      contacts: null,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'contacts') {
    const contacts = asArray(message.contacts);
    return {
      messageBody: '[contacto]',
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'reaction') {
    const reaction = asRecord(message.reaction);
    const emoji = getString(reaction.emoji);
    return {
      messageBody: emoji,
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts: null,
      reactionTo: getString(reaction.message_id) || null,
      reactionRemoved: emoji === '',
      isVoiceNote: false,
    };
  }

  const supportedMediaTypes = new Set(['image', 'audio', 'video', 'document', 'sticker']);
  if (!supportedMediaTypes.has(type)) {
    return {
      messageBody: `[${type}]`,
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts: null,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  const media = asRecord(message[type]);
  const caption = getString(media.caption) || null;
  const filename = getString(media.filename) || null;

  return {
    messageBody: caption || filename || `[${type}]`,
    mediaType: type,
    mediaId: getString(media.id) || null,
    caption,
    mimeType: getString(media.mime_type) || null,
    filename,
    location: null,
    contacts: null,
    reactionTo: null,
    reactionRemoved: false,
    isVoiceNote: type === 'audio' && media.voice === true,
  };
}

async function persistInboundMedia(params: {
  supabase: ReturnType<typeof getServiceClient>;
  mediaId: string;
  mimeType: string | null;
  stableKey: string;
}): Promise<{ storagePath: string | null; storageUrl: string | null }> {
  if (!getWhatsAppAccessToken()) {
    console.error('[on-whatsapp-webhook] persistInboundMedia: WHATSAPP_ACCESS_TOKEN ausente', {
      mediaId: params.mediaId,
    });
    return { storagePath: null, storageUrl: null };
  }

  try {
    const { bytes, mimeType } = await downloadWhatsAppMediaFromMeta(params.mediaId);
    const resolvedMimeType = mimeType || params.mimeType || 'application/octet-stream';
    const storagePath = buildStoragePath(params.stableKey, params.mediaId, resolvedMimeType);
    const persisted = await persistToWhatsAppBucket(
      params.supabase,
      bytes,
      storagePath,
      resolvedMimeType,
      OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
    );
    return {
      storagePath: persisted.storagePath,
      storageUrl: persisted.signedUrl,
    };
  } catch (error) {
    console.error('[on-whatsapp-webhook] persistInboundMedia failed', {
      mediaId: params.mediaId,
      stableKey: params.stableKey,
      error: String(error),
    });
    return { storagePath: null, storageUrl: null };
  }
}

async function processInboundMessage(params: {
  supabase: ReturnType<typeof getServiceClient>;
  message: JsonRecord;
  value: JsonRecord;
  contacts: unknown[];
}): Promise<'inserted' | 'duplicate'> {
  const senderPhone = getString(params.message.from);
  const waMessageId = getString(params.message.id);
  if (!senderPhone || !waMessageId) {
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
  const contactName = getContactName(params.contacts, senderPhone);
  const content = getMessageContent(params.message);
  const createdAt = getUnixDate(params.message.timestamp);

  let storagePath: string | null = null;
  let storageUrl: string | null = null;
  if (content.mediaId) {
    const persisted = await persistInboundMedia({
      supabase: params.supabase,
      mediaId: content.mediaId,
      mimeType: content.mimeType,
      stableKey: senderPhone,
    });
    storagePath = persisted.storagePath;
    storageUrl = persisted.storageUrl;
  }

  const { data: existingConversation, error: conversationReadError } = await params.supabase
    .from('whatsapp_conversations')
    .select('unread_count')
    .eq('stable_key', senderPhone)
    .maybeSingle();

  if (conversationReadError) throw conversationReadError;

  const unreadCount = Number(existingConversation?.unread_count ?? 0) + 1;
  const lastMessageText = content.messageBody ?? `[${getString(params.message.type) || 'mensaje'}]`;

  const { error: conversationError } = await params.supabase
    .from('whatsapp_conversations')
    .upsert(
      {
        stable_key: senderPhone,
        phone: senderPhone,
        state: 'active',
        contact_name: contactName,
        contact_phone: senderPhone,
        whatsapp_profile_name: contactName,
        last_message_text: lastMessageText,
        last_message_at: createdAt,
        last_message_direction: 'inbound',
        last_message_outbound_status: null,
        unread_count: unreadCount,
        phone_number_id: phoneNumberId,
        ...UNARCHIVE_CONVERSATION_PATCH,
      },
      { onConflict: 'stable_key' },
    );

  if (conversationError) throw conversationError;

  const { data: insertedMessage, error: insertError } = await params.supabase
    .from('whatsapp_message_log')
    .insert({
      conversation_stable_key: senderPhone,
      recipient_phone: senderPhone,
      direction: 'inbound',
      sender_type: 'user',
      message_body: content.messageBody,
      media_type: content.mediaType,
      media_id: content.mediaId,
      media_url: storageUrl,
      storage_url: storageUrl,
      storage_path: storagePath,
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

  if (content.mediaId && storagePath && insertedMessage?.id) {
    await params.supabase.from('whatsapp_media_assets').insert({
      message_log_id: insertedMessage.id,
      conversation_stable_key: senderPhone,
      bucket_id: 'whatsapp-media',
      storage_path: storagePath,
      media_id: content.mediaId,
      mime_type: content.mimeType,
      size_bytes: null,
    });
  }

  return 'inserted';
}

async function processStatus(params: {
  supabase: ReturnType<typeof getServiceClient>;
  status: JsonRecord;
}): Promise<'updated' | 'missing'> {
  const waMessageId = getString(params.status.id);
  const status = getString(params.status.status);
  if (!waMessageId || !status) {
    throw new Error('Status sin id o status.');
  }

  const { data: existingMessage, error: existingError } = await params.supabase
    .from('whatsapp_message_log')
    .select('id,conversation_stable_key,raw_payload')
    .eq('wa_message_id', waMessageId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existingMessage) return 'missing';

  const rawPayload = {
    ...asRecord(existingMessage.raw_payload),
    latestStatus: params.status,
  };

  const { error: updateMessageError } = await params.supabase
    .from('whatsapp_message_log')
    .update({ status, raw_payload: rawPayload })
    .eq('id', existingMessage.id);

  if (updateMessageError) throw updateMessageError;

  if (existingMessage.conversation_stable_key) {
    const { error: updateConversationError } = await params.supabase
      .from('whatsapp_conversations')
      .update({ last_message_outbound_status: status })
      .eq('stable_key', existingMessage.conversation_stable_key);

    if (updateConversationError) throw updateConversationError;
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
    errors: [],
  };

  for (const entry of asArray(payload.entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const contacts = asArray(value.contacts);

      for (const rawMessage of asArray(value.messages)) {
        try {
          const processed = await processInboundMessage({
            supabase,
            message: asRecord(rawMessage),
            value,
            contacts,
          });

          if (processed === 'duplicate') result.skippedDuplicates += 1;
          else result.inboundMessages += 1;
        } catch (error) {
          result.errors.push(`message: ${String(error)}`);
        }
      }

      for (const rawStatus of asArray(value.statuses)) {
        try {
          const processed = await processStatus({
            supabase,
            status: asRecord(rawStatus),
          });

          if (processed === 'missing') {
            result.errors.push(`status: no existe mensaje ${getString(asRecord(rawStatus).id)}`);
          } else {
            result.statuses += 1;
          }
        } catch (error) {
          result.errors.push(`status: ${String(error)}`);
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
      parseError = `JSON invalido: ${String(error)}`;
      payload = { rawBody };
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
    return jsonResponse({ error: String(error) }, 500);
  }
});
