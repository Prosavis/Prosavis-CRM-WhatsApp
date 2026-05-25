import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const mediaAssetId = String(body.mediaAssetId ?? '').trim();
    const storagePath = String(body.storagePath ?? '').trim();
    const bucketId = String(body.bucketId ?? 'whatsapp-media').trim();
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

    const { data, error } = await supabase.storage
      .from(resolvedBucketId)
      .createSignedUrl(resolvedStoragePath, expiresIn);

    if (error) throw error;

    return jsonResponse({
      signedUrl: data.signedUrl,
      expiresIn,
      bucketId: resolvedBucketId,
      storagePath: resolvedStoragePath,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
