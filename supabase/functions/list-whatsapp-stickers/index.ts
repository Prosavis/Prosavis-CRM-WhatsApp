import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { createStickerSignedUrl, formatError } from '../_shared/whatsappOutbound.ts';

function mapFolderRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    createdByUid: row.created_by,
    updatedAt: row.updated_at,
  };
}

function mapStickerRow(row: Record<string, unknown>, downloadUrl: string) {
  return {
    id: row.id,
    name: row.name,
    storagePath: row.storage_path,
    downloadUrl,
    mimeType: 'image/webp',
    sizeBytes: row.size_bytes,
    isAnimated: row.is_animated === true,
    folderId: row.folder_id ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    createdByUid: row.created_by,
    archived: row.archived === true,
    favoriteByUids: row.favorite_by_uids ?? [],
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);

    const [{ data: folderRows, error: folderError }, { data: stickerRows, error: stickerError }] =
      await Promise.all([
        supabase
          .from('whatsapp_sticker_folders')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('whatsapp_stickers')
          .select('*')
          .eq('archived', false)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(300),
      ]);

    if (folderError) throw folderError;
    if (stickerError) throw stickerError;

    const stickers = await Promise.all(
      (stickerRows ?? []).map(async (row) => {
        let downloadUrl = '';
        if (row.storage_path) {
          try {
            downloadUrl = await createStickerSignedUrl(supabase, String(row.storage_path), 3600);
          } catch {
            downloadUrl = typeof row.download_url === 'string' ? row.download_url : '';
          }
        }
        return mapStickerRow(row, downloadUrl);
      }),
    );

    return jsonResponse({
      folders: (folderRows ?? []).map(mapFolderRow),
      stickers,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
