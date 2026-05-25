import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const mediaId = String(body.mediaId ?? '').trim();
    const mediaAssetId = String(body.mediaAssetId ?? '').trim();
    const storagePath = String(body.storagePath ?? '').trim();
    const bucketId = String(body.bucketId ?? 'whatsapp-media').trim();
    const expiresIn = Number(body.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS);

    if (mediaId) {
      const metaToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
      if (!metaToken) {
        return jsonResponse({ error: 'WHATSAPP_ACCESS_TOKEN no configurado.' }, 500);
      }
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${metaToken}` },
      });
      const metaJson = await metaRes.json();
      if (!metaRes.ok) {
        return jsonResponse({ error: metaJson?.error?.message ?? 'Error Meta media' }, 502);
      }
      const url = String(metaJson.url ?? '');
      if (!url) return jsonResponse({ error: 'URL de media no disponible.' }, 404);
      const blobRes = await fetch(url, { headers: { Authorization: `Bearer ${metaToken}` } });
      if (!blobRes.ok) {
        return jsonResponse({ error: 'No se pudo descargar media de Meta.' }, 502);
      }
      const blob = await blobRes.blob();
      return jsonResponse({
        signedUrl: url,
        mimeType: blob.type || 'application/octet-stream',
        fileSize: blob.size,
      });
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

    if (!resolvedStoragePath) {
      return jsonResponse({ error: 'mediaId, mediaAssetId o storagePath es requerido.' }, 400);
    }

    const { data, error } = await supabase.storage
      .from(resolvedBucketId)
      .createSignedUrl(resolvedStoragePath, expiresIn);
    if (error) throw error;

    return jsonResponse({
      signedUrl: data.signedUrl,
      mimeType: 'application/octet-stream',
      fileSize: 0,
      expiresIn,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
