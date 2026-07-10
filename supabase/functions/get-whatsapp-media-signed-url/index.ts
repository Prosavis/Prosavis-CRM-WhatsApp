import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { stickerStorageObjectPath } from '../_shared/whatsappOutbound.ts';

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;
const STICKERS_BUCKET = 'whatsapp-stickers';
const MEDIA_BUCKET = 'whatsapp-media';

function resolveStorageLocation(
  storagePath: string,
  bucketId: string,
): { bucketId: string; objectPath: string } {
  const trimmed = storagePath.trim();
  const looksLikeSticker =
    bucketId === STICKERS_BUCKET ||
    trimmed.startsWith(`${STICKERS_BUCKET}/`);

  if (looksLikeSticker) {
    return {
      bucketId: STICKERS_BUCKET,
      objectPath: stickerStorageObjectPath(trimmed),
    };
  }

  return {
    bucketId: bucketId || MEDIA_BUCKET,
    objectPath: trimmed,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const mediaAssetId = String(body.mediaAssetId ?? '').trim();
    const storagePath = String(body.storagePath ?? '').trim();
    const bucketId = String(body.bucketId ?? MEDIA_BUCKET).trim() || MEDIA_BUCKET;
    const expiresIn = Number(body.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS);

    if (!mediaAssetId && !storagePath) {
      return jsonResponse({ error: 'mediaAssetId o storagePath es requerido.' }, 400);
    }

    let resolvedBucketId = bucketId;
    let resolvedStoragePath = storagePath;

    if (mediaAssetId) {
      const { data: asset, error: assetError } = await supabase
        .from('whatsapp_media_assets')
        .select('bucket_id,storage_path')
        .eq('id', mediaAssetId)
        .single();

      if (assetError) throw assetError;
      resolvedBucketId = asset.bucket_id;
      resolvedStoragePath = asset.storage_path;
    }

    const location = resolveStorageLocation(resolvedStoragePath, resolvedBucketId);

    const { data, error } = await supabase.storage
      .from(location.bucketId)
      .createSignedUrl(location.objectPath, expiresIn);

    if (error) throw error;

    return jsonResponse({
      signedUrl: data.signedUrl,
      expiresIn,
      bucketId: location.bucketId,
      storagePath: location.objectPath,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
