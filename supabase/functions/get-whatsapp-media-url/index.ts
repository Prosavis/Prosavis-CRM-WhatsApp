import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  createWhatsAppMediaSignedUrl,
  DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  resolveWhatsAppMediaById,
} from '../_shared/whatsappMediaStorage.ts';

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
          { error: error instanceof Error ? error.message : String(error) },
          502,
        );
      }
    }

    let resolvedBucketId = bucketId;
    let resolvedStoragePath = storagePath;

    if (mediaAssetId) {
      const { data: asset, error: assetError } = await supabase
        .from('whatsapp_media_assets')
        .select('bucket_id,storage_path,mime_type,size_bytes')
        .eq('id', mediaAssetId)
        .single();
      if (assetError) throw assetError;
      resolvedBucketId = asset.bucket_id;
      resolvedStoragePath = asset.storage_path;
    }

    if (!resolvedStoragePath) {
      return jsonResponse({ error: 'mediaId, mediaAssetId o storagePath es requerido.' }, 400);
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
      mimeType: mimeTypeHint ?? 'application/octet-stream',
      fileSize: 0,
      expiresIn,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[get-whatsapp-media-url] unexpected error', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});
