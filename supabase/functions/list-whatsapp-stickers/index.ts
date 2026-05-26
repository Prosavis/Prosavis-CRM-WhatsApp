import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { createStickerSignedUrl, formatError } from '../_shared/whatsappOutbound.ts';

function mapStickerRow(row: Record<string, unknown>, downloadUrl: string) {
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storage_path,
    downloadUrl,
    mimeType: 'image/webp',
    sizeBytes: row.size_bytes,
    isAnimated: row.is_animated === true,
    createdAt: row.created_at,
    createdByUid: row.created_by,
    archived: row.archived === true,
    favoriteByUids: row.favorite_by_uids ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const { data, error } = await supabase
      .from('whatsapp_stickers')
      .select('*')
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const stickers = await Promise.all(
      (data ?? []).map(async (row) => {
        let downloadUrl = typeof row.download_url === 'string' ? row.download_url : '';
        if (!downloadUrl && row.storage_path) {
          try {
            downloadUrl = await createStickerSignedUrl(supabase, String(row.storage_path), 3600);
          } catch {
            downloadUrl = '';
          }
        }
        return mapStickerRow(row, downloadUrl);
      }),
    );

    return jsonResponse({ stickers });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
