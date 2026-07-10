import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  createWhatsAppMediaSignedUrl,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  resolveWhatsAppMediaById,
  WhatsAppMediaError,
} from '../_shared/whatsappMediaStorage.ts';

function statusCodeFromError(error: unknown): number {
  if (error instanceof WhatsAppMediaError) return error.statusCode;
  if (error instanceof Error && 'statusCode' in error) {
    return (error as Error & { statusCode: number }).statusCode;
  }
  if (error instanceof Response) return error.status;
  return 502;
}

function errorPayload(error: unknown): { error: string; code?: string } {
  if (error instanceof WhatsAppMediaError) {
    return { error: error.message, code: error.code };
  }
  return { error: error instanceof Error ? error.message : String(error) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? '').trim();
    const mediaAssetId = String(body.mediaAssetId ?? '').trim();
    const storagePath = String(body.storagePath ?? '').trim();
    const stableKeyHint = String(body.stableKeyHint ?? body.conversationStableKey ?? '').trim();
    const mimeTypeHint = body.mimeType ? String(body.mimeType).trim() : null;
    const bucketId = String(body.bucketId ?? 'whatsapp-media').trim();
    const expiresIn = Number(body.expiresIn ?? DEFAULT_SIGNED_URL_EXPIRES_SECONDS);

    if (mediaId) {
      try {
        const persisted = await resolveWhatsAppMediaById({
          supabase,
          mediaId,
          stableKeyHint: stableKeyHint || undefined,
          mimeTypeHint,
          expiresIn,
        });
        return jsonResponse({
          signedUrl: persisted.signedUrl,
          storagePath: persisted.storagePath,
          mimeType: persisted.mimeType,
          fileSize: persisted.fileSize,
          expiresIn,
        });
      } catch (error) {
        console.error('[get-whatsapp-media-url] resolve by mediaId failed', {
          mediaId,
          error: String(error),
        });
        return jsonResponse(
          errorPayload(error),
          statusCodeFromError(error),
        );
      }
    }

    let resolvedBucketId = bucketId;
    let resolvedStoragePath = storagePath;
    let resolvedMimeType = mimeTypeHint;
    let resolvedSize = 0;

    if (mediaAssetId) {
      const { data: asset, error: assetError } = await supabase
        .from('whatsapp_media_assets')
        .select('bucket_id,storage_path,mime_type,size_bytes,media_id')
        .eq('id', mediaAssetId)
        .single();
      if (assetError) throw assetError;
      resolvedBucketId = asset.bucket_id;
      resolvedStoragePath = asset.storage_path;
      if (asset.mime_type) resolvedMimeType = asset.mime_type;
      if (asset.size_bytes) resolvedSize = asset.size_bytes;

      if (asset.media_id) {
        try {
          const persisted = await resolveWhatsAppMediaById({
            supabase,
            mediaId: asset.media_id,
            stableKeyHint: stableKeyHint || undefined,
            mimeTypeHint: resolvedMimeType,
            expiresIn,
          });
          return jsonResponse({
            signedUrl: persisted.signedUrl,
            storagePath: persisted.storagePath,
            mimeType: persisted.mimeType,
            fileSize: persisted.fileSize,
            expiresIn,
          });
        } catch {
          // Fall through to direct signed URL attempt below
        }
      }
    }

    if (!resolvedStoragePath) {
      return jsonResponse({ error: 'mediaId, mediaAssetId o storagePath es requerido.' }, 400);
    }

    // Stickers outbound guardan storage_path con prefijo whatsapp-stickers/
    // pero el objeto vive en ese bucket sin el prefijo.
    if (
      resolvedBucketId === 'whatsapp-stickers' ||
      resolvedStoragePath.startsWith('whatsapp-stickers/')
    ) {
      resolvedBucketId = 'whatsapp-stickers';
      resolvedStoragePath = resolvedStoragePath.startsWith('whatsapp-stickers/')
        ? resolvedStoragePath.slice('whatsapp-stickers/'.length)
        : resolvedStoragePath;
    }

    const signedUrl = await createWhatsAppMediaSignedUrl(
      supabase,
      resolvedStoragePath,
      expiresIn,
      resolvedBucketId,
    );

    return jsonResponse({
      signedUrl,
      storagePath: resolvedStoragePath,
      mimeType: resolvedMimeType ?? 'application/octet-stream',
      fileSize: resolvedSize,
      expiresIn,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[get-whatsapp-media-url] unexpected error', error);
    return jsonResponse(errorPayload(error), statusCodeFromError(error));
  }
});
