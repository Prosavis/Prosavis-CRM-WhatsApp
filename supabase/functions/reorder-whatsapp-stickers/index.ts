import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

/**
 * Reordena stickers dentro de una carpeta (o sin carpeta).
 * Body: { folderId: string | null, orderedIds: string[] }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const folderId =
      typeof body.folderId === 'string' && body.folderId.trim()
        ? body.folderId.trim()
        : null;
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (!orderedIds.length) {
      return jsonResponse({ error: 'orderedIds requerido.' }, 400);
    }

    for (let i = 0; i < orderedIds.length; i += 1) {
      let query = supabase
        .from('whatsapp_stickers')
        .update({
          sort_order: i,
          folder_id: folderId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderedIds[i]);

      const { error } = await query;
      if (error) throw error;
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
