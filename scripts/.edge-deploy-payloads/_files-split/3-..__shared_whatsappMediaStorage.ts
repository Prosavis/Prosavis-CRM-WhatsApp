import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
export const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 15 * 60;
export const OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS = 7200;

export interface WhatsAppMediaBlob {
  bytes: Uint8Array;
  mimeType: string;
}

export interface PersistedWhatsAppMedia {
  storagePath: string;
  signedUrl: string;
  mimeType: string;
  fileSize: number;
}

export interface ExistingWhatsAppMediaAsset {
  bucketId: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  messageLogId: string | null;
}

export function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('gif')) return 'gif';
  return 'bin';
}

export function buildStoragePath(
  stableKey: string,
  mediaId: string,
  mimeType: string,
): string {
  const ext = extensionFromMimeType(mimeType);
  return `${stableKey}/${mediaId}.${ext}`;
}

export function getWhatsAppAccessToken(): string | null {
  return Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() ?? null;
}

export async function downloadWhatsAppMediaFromMeta(
  mediaId: string,
  accessToken?: string,
): Promise<WhatsAppMediaBlob> {
  const token = accessToken ?? getWhatsAppAccessToken();
  if (!token) {
    throw new Error('WHATSAPP_ACCESS_TOKEN no configurado.');
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaJson = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) {
    const message =
      (metaJson as { error?: { message?: string } })?.error?.message ??
      `Meta media metadata failed (${metaRes.status})`;
    throw new Error(message);
  }

  const downloadUrl = String((metaJson as { url?: string }).url ?? '').trim();
  if (!downloadUrl) {
    throw new Error('URL de descarga Meta no disponible.');
  }

  const mimeType =
    String((metaJson as { mime_type?: string }).mime_type ?? '').trim() ||
    'application/octet-stream';

  const binaryRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!binaryRes.ok) {
    throw new Error(`No se pudo descargar media de Meta (${binaryRes.status}).`);
  }

  const bytes = new Uint8Array(await binaryRes.arrayBuffer());
  return {
    bytes,
    mimeType: binaryRes.headers.get('content-type')?.split(';')[0]?.trim() || mimeType,
  };
}

export async function createWhatsAppMediaSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  bucketId = WHATSAPP_MEDIA_BUCKET,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucketId)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('No se pudo firmar URL de Storage.');
  }
  return data.signedUrl;
}

export async function persistToWhatsAppBucket(
  supabase: SupabaseClient,
  bytes: Uint8Array,
  storagePath: string,
  mimeType: string,
  expiresIn = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
): Promise<PersistedWhatsAppMedia> {
  const { error: uploadError } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, bytes, { upsert: true, contentType: mimeType });
  if (uploadError) {
    throw uploadError;
  }

  const signedUrl = await createWhatsAppMediaSignedUrl(
    supabase,
    storagePath,
    expiresIn,
  );

  return {
    storagePath,
    signedUrl,
    mimeType,
    fileSize: bytes.byteLength,
  };
}

export async function findExistingMediaAsset(
  supabase: SupabaseClient,
  mediaId: string,
): Promise<ExistingWhatsAppMediaAsset | null> {
  const { data: asset } = await supabase
    .from('whatsapp_media_assets')
    .select('bucket_id,storage_path,mime_type,size_bytes,message_log_id')
    .eq('media_id', mediaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (asset?.storage_path) {
    return {
      bucketId: String(asset.bucket_id ?? WHATSAPP_MEDIA_BUCKET),
      storagePath: String(asset.storage_path),
      mimeType: asset.mime_type ? String(asset.mime_type) : null,
      sizeBytes: typeof asset.size_bytes === 'number' ? asset.size_bytes : null,
      messageLogId: asset.message_log_id ? String(asset.message_log_id) : null,
    };
  }

  const { data: logRow } = await supabase
    .from('whatsapp_message_log')
    .select('id,storage_path,mime_type,size_bytes')
    .eq('media_id', mediaId)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (logRow?.storage_path) {
    return {
      bucketId: WHATSAPP_MEDIA_BUCKET,
      storagePath: String(logRow.storage_path),
      mimeType: logRow.mime_type ? String(logRow.mime_type) : null,
      sizeBytes: typeof logRow.size_bytes === 'number' ? logRow.size_bytes : null,
      messageLogId: logRow.id ? String(logRow.id) : null,
    };
  }

  return null;
}

export async function backfillInboundMediaRecords(params: {
  supabase: SupabaseClient;
  mediaId: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  signedUrl: string;
}): Promise<void> {
  const { data: messages, error: messagesError } = await params.supabase
    .from('whatsapp_message_log')
    .select('id,storage_path')
    .eq('media_id', params.mediaId);

  if (messagesError) {
    console.error('[whatsappMediaStorage] backfill message lookup failed', {
      mediaId: params.mediaId,
      error: messagesError,
    });
    return;
  }

  for (const message of messages ?? []) {
    if (message.storage_path) continue;
    const { error: updateError } = await params.supabase
      .from('whatsapp_message_log')
      .update({
        storage_path: params.storagePath,
        storage_url: params.signedUrl,
        media_url: params.signedUrl,
        mime_type: params.mimeType,
        size_bytes: params.fileSize,
      })
      .eq('id', message.id);
    if (updateError) {
      console.error('[whatsappMediaStorage] backfill message update failed', {
        mediaId: params.mediaId,
        messageLogId: message.id,
        error: updateError,
      });
    }
  }

  const { data: existingAsset } = await params.supabase
    .from('whatsapp_media_assets')
    .select('id')
    .eq('media_id', params.mediaId)
    .limit(1)
    .maybeSingle();

  if (existingAsset?.id) return;

  const messageLogId =
    (messages ?? []).find((row) => row.id)?.id ??
    (await params.supabase
      .from('whatsapp_message_log')
      .select('id,conversation_stable_key')
      .eq('media_id', params.mediaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()).data?.id;

  const conversationStableKey = messageLogId
    ? (
        await params.supabase
          .from('whatsapp_message_log')
          .select('conversation_stable_key')
          .eq('id', messageLogId)
          .maybeSingle()
      ).data?.conversation_stable_key
    : null;

  if (!conversationStableKey) return;

  const { error: insertError } = await params.supabase.from('whatsapp_media_assets').insert({
    message_log_id: messageLogId,
    conversation_stable_key: conversationStableKey,
    bucket_id: WHATSAPP_MEDIA_BUCKET,
    storage_path: params.storagePath,
    media_id: params.mediaId,
    mime_type: params.mimeType,
    size_bytes: params.fileSize,
  });

  if (insertError) {
    console.error('[whatsappMediaStorage] backfill media asset insert failed', {
      mediaId: params.mediaId,
      error: insertError,
    });
  }
}

export async function resolveWhatsAppMediaById(params: {
  supabase: SupabaseClient;
  mediaId: string;
  stableKeyHint?: string;
  mimeTypeHint?: string | null;
  expiresIn?: number;
}): Promise<PersistedWhatsAppMedia> {
  const existing = await findExistingMediaAsset(params.supabase, params.mediaId);
  if (existing) {
    const signedUrl = await createWhatsAppMediaSignedUrl(
      params.supabase,
      existing.storagePath,
      params.expiresIn ?? DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
      existing.bucketId,
    );
    return {
      storagePath: existing.storagePath,
      signedUrl,
      mimeType: existing.mimeType ?? params.mimeTypeHint ?? 'application/octet-stream',
      fileSize: existing.sizeBytes ?? 0,
    };
  }

  const { bytes, mimeType } = await downloadWhatsAppMediaFromMeta(params.mediaId);
  const storagePath = buildStoragePath(
    params.stableKeyHint?.trim() || 'unknown',
    params.mediaId,
    mimeType || params.mimeTypeHint || 'application/octet-stream',
  );

  const persisted = await persistToWhatsAppBucket(
    params.supabase,
    bytes,
    storagePath,
    mimeType,
    params.expiresIn ?? DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  );

  await backfillInboundMediaRecords({
    supabase: params.supabase,
    mediaId: params.mediaId,
    storagePath: persisted.storagePath,
    mimeType: persisted.mimeType,
    fileSize: persisted.fileSize,
    signedUrl: persisted.signedUrl,
  });

  return persisted;
}
