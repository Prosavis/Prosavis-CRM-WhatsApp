import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
export const WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES = 104_857_600;
export const STORAGE_RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const STORAGE_TUS_CHUNK_BYTES = 6 * 1024 * 1024;
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
  sha256: string;
}

export interface ExistingWhatsAppMediaAsset {
  bucketId: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  messageLogId: string | null;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

export class WhatsAppMediaError extends Error {
  statusCode: number;
  code:
    | 'meta_unavailable'
    | 'meta_auth'
    | 'meta_download'
    | 'storage'
    | 'storage_oversized'
    | 'config';

  constructor(
    message: string,
    options: {
      statusCode: number;
      code: WhatsAppMediaError['code'];
    },
  ) {
    super(message);
    this.name = 'WhatsAppMediaError';
    this.statusCode = options.statusCode;
    this.code = options.code;
  }
}

function classifyMetaHttpStatus(status: number): { statusCode: number; code: WhatsAppMediaError['code'] } {
  if (status === 401 || status === 403) {
    return { statusCode: 502, code: 'meta_auth' };
  }
  if (status === 404 || status === 410) {
    return { statusCode: 410, code: 'meta_unavailable' };
  }
  return { statusCode: 502, code: 'meta_download' };
}

export async function downloadWhatsAppMediaFromMeta(
  mediaId: string,
  accessToken?: string,
): Promise<WhatsAppMediaBlob> {
  const token = accessToken ?? getWhatsAppAccessToken();
  if (!token) {
    throw new WhatsAppMediaError('WHATSAPP_ACCESS_TOKEN no configurado.', {
      statusCode: 503,
      code: 'config',
    });
  }

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaJson = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) {
    const message =
      (metaJson as { error?: { message?: string } })?.error?.message ??
      `Meta media metadata failed (${metaRes.status})`;
    const classified = classifyMetaHttpStatus(metaRes.status);
    throw new WhatsAppMediaError(message, classified);
  }

  const downloadUrl = String((metaJson as { url?: string }).url ?? '').trim();
  if (!downloadUrl) {
    throw new WhatsAppMediaError('URL de descarga Meta no disponible.', {
      statusCode: 502,
      code: 'meta_download',
    });
  }

  const mimeType =
    String((metaJson as { mime_type?: string }).mime_type ?? '').trim() ||
    'application/octet-stream';
  const fileSize = Number((metaJson as { file_size?: number }).file_size ?? 0);
  if (fileSize > WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES) {
    throw new WhatsAppMediaError(
      `El archivo pesa ${Math.round(fileSize / 1048576)} MB; el máximo permitido es 100 MB.`,
      { statusCode: 413, code: 'storage_oversized' },
    );
  }

  const binaryRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!binaryRes.ok) {
    const classified = classifyMetaHttpStatus(binaryRes.status);
    throw new WhatsAppMediaError(
      `No se pudo descargar media de Meta (${binaryRes.status}).`,
      classified,
    );
  }

  const bytes = new Uint8Array(await binaryRes.arrayBuffer());
  if (bytes.byteLength > WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES) {
    throw new WhatsAppMediaError(
      `El archivo pesa ${Math.round(bytes.byteLength / 1048576)} MB; el máximo permitido es 100 MB.`,
      { statusCode: 413, code: 'storage_oversized' },
    );
  }
  return {
    bytes,
    mimeType: binaryRes.headers.get('content-type')?.split(';')[0]?.trim() || mimeType,
  };
}

function encodeTusMetadataValue(value: string): string {
  return btoa(value);
}

function buildTusUploadMetadata(storagePath: string, mimeType: string): string {
  return [
    `bucketName ${encodeTusMetadataValue(WHATSAPP_MEDIA_BUCKET)}`,
    `objectName ${encodeTusMetadataValue(storagePath)}`,
    `contentType ${encodeTusMetadataValue(mimeType)}`,
  ].join(',');
}

function getStorageCredentials(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new WhatsAppMediaError('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.', {
      statusCode: 503,
      code: 'config',
    });
  }
  return { supabaseUrl, serviceRoleKey };
}

function isStorageOversizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode =
    typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
  return (
    statusCode === 413 ||
    /EntityTooLarge/i.test(message) ||
    /exceeded the maximum allowed size/i.test(message) ||
    /payload too large/i.test(message)
  );
}

export function classifyStorageUploadError(
  error: unknown,
  fileSizeBytes?: number,
): WhatsAppMediaError {
  if (error instanceof WhatsAppMediaError) return error;

  const sizeMb =
    typeof fileSizeBytes === 'number' && fileSizeBytes > 0
      ? Math.round(fileSizeBytes / 1048576)
      : null;

  if (isStorageOversizedError(error)) {
    const sizeHint = sizeMb ? ` (${sizeMb} MB)` : '';
    return new WhatsAppMediaError(
      `El archivo es demasiado grande para guardarse${sizeHint}. El máximo permitido es 100 MB (límite global y del bucket whatsapp-media).`,
      { statusCode: 413, code: 'storage_oversized' },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new WhatsAppMediaError(
    `No se pudo guardar el archivo en Storage: ${message}`,
    { statusCode: 502, code: 'storage' },
  );
}

async function tusUploadToWhatsAppBucket(
  bytes: Uint8Array,
  storagePath: string,
  mimeType: string,
): Promise<void> {
  const { supabaseUrl, serviceRoleKey } = getStorageCredentials();
  const endpoint = `${supabaseUrl}/storage/v1/upload/resumable`;
  const authHeaders = {
    Authorization: `Bearer ${serviceRoleKey}`,
    'Tus-Resumable': '1.0.0',
    'x-upsert': 'true',
  };

  const createRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Upload-Length': String(bytes.byteLength),
      'Upload-Metadata': buildTusUploadMetadata(storagePath, mimeType),
    },
  });

  if (!createRes.ok) {
    throw new Error(`TUS create failed (${createRes.status}): ${await createRes.text()}`);
  }

  const uploadUrl = createRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('TUS create response missing Location header.');
  }

  let offset = 0;
  while (offset < bytes.byteLength) {
    const chunkEnd = Math.min(offset + STORAGE_TUS_CHUNK_BYTES, bytes.byteLength);
    const chunk = bytes.subarray(offset, chunkEnd);
    const patchRes = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: chunk,
    });

    if (!patchRes.ok) {
      throw new Error(`TUS patch failed (${patchRes.status}): ${await patchRes.text()}`);
    }

    const nextOffset = patchRes.headers.get('Upload-Offset');
    offset = nextOffset ? Number(nextOffset) : chunkEnd;
  }
}

export async function uploadToWhatsAppBucket(
  supabase: SupabaseClient,
  bytes: Uint8Array,
  storagePath: string,
  mimeType: string,
): Promise<void> {
  if (bytes.byteLength > WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES) {
    throw new WhatsAppMediaError(
      `El archivo pesa ${Math.round(bytes.byteLength / 1048576)} MB; el máximo permitido es 100 MB.`,
      { statusCode: 413, code: 'storage_oversized' },
    );
  }

  try {
    if (bytes.byteLength <= STORAGE_RESUMABLE_THRESHOLD_BYTES) {
      const { error: uploadError } = await supabase.storage
        .from(WHATSAPP_MEDIA_BUCKET)
        .upload(storagePath, bytes, { upsert: true, contentType: mimeType });
      if (uploadError) throw uploadError;
      return;
    }

    await tusUploadToWhatsAppBucket(bytes, storagePath, mimeType);
  } catch (error) {
    throw classifyStorageUploadError(error, bytes.byteLength);
  }
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
  await uploadToWhatsAppBucket(supabase, bytes, storagePath, mimeType);

  const [signedUrl, sha256] = await Promise.all([
    createWhatsAppMediaSignedUrl(supabase, storagePath, expiresIn),
    computeSha256Hex(bytes),
  ]);

  return {
    storagePath,
    signedUrl,
    mimeType,
    fileSize: bytes.byteLength,
    sha256,
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
  sha256?: string;
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
    sha256: params.sha256 ?? null,
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
    try {
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
        sha256: '',
      };
    } catch {
      console.warn('[resolveWhatsAppMediaById] signed URL failed for', {
        mediaId: params.mediaId,
        storagePath: existing.storagePath,
      });
    }
  }

  let bytes: Uint8Array;
  let mimeType: string;
  try {
    ({ bytes, mimeType } = await downloadWhatsAppMediaFromMeta(params.mediaId));
  } catch (error) {
    console.error('[resolveWhatsAppMediaById] Meta download failed', {
      mediaId: params.mediaId,
      error: String(error),
    });
    if (error instanceof WhatsAppMediaError) throw error;
    throw new WhatsAppMediaError(
      error instanceof Error ? error.message : String(error),
      { statusCode: 502, code: 'meta_download' },
    );
  }

  const storagePath = buildStoragePath(
    params.stableKeyHint?.trim() || 'unknown',
    params.mediaId,
    mimeType || params.mimeTypeHint || 'application/octet-stream',
  );

  try {
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
      sha256: persisted.sha256,
      signedUrl: persisted.signedUrl,
    });

    return persisted;
  } catch (storageError) {
    console.error('[resolveWhatsAppMediaById] Storage persist failed', {
      mediaId: params.mediaId,
      storagePath,
      error: String(storageError),
    });
    if (storageError instanceof WhatsAppMediaError) throw storageError;
    throw classifyStorageUploadError(storageError, bytes.byteLength);
  }
}
