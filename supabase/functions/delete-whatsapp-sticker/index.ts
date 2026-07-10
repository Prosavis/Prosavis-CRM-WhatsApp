import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError, stickerStorageObjectPath } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const stickerId = String(body.stickerId ?? '').trim();
    if (!stickerId) return jsonResponse({ error: 'Se requiere stickerId.' }, 400);

    const { data: sticker, error: readError } = await supabase
      .from('whatsapp_stickers')
      .select('id,storage_path')
      .eq('id', stickerId)
      .maybeSingle();
    if (readError) throw readError;
    if (!sticker) return jsonResponse({ error: 'Sticker no encontrado.' }, 404);

    const objectPath = stickerStorageObjectPath(String(sticker.storage_path || ''));
    if (objectPath) {
      const { error: storageError } = await supabase.storage
        .from('whatsapp-stickers')
        .remove([objectPath]);
      if (storageError) {
        console.error('delete-whatsapp-sticker storage remove failed', storageError);
      }
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_stickers')
      .delete()
      .eq('id', stickerId);
    if (deleteError) throw deleteError;

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
