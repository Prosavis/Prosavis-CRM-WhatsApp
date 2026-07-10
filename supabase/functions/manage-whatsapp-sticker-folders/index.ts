import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

const MAX_FOLDER_NAME_LENGTH = 40;

type Action =
  | 'create'
  | 'update'
  | 'delete'
  | 'reorder';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').trim() as Action;

    if (action === 'create') {
      const name = String(body.name ?? '').trim();
      if (!name || name.length > MAX_FOLDER_NAME_LENGTH) {
        return jsonResponse(
          { error: `Nombre de carpeta requerido (máx ${MAX_FOLDER_NAME_LENGTH}).` },
          400,
        );
      }
      const { data: maxRow } = await supabase
        .from('whatsapp_sticker_folders')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSort = Number(maxRow?.sort_order ?? -1) + 1;
      const { data, error } = await supabase
        .from('whatsapp_sticker_folders')
        .insert({
          name,
          sort_order: nextSort,
          created_by: user.id,
        })
        .select('id,name,sort_order,created_at,created_by,updated_at')
        .single();
      if (error) throw error;
      return jsonResponse({
        success: true,
        folder: {
          id: data.id,
          name: data.name,
          sortOrder: data.sort_order,
          createdAt: data.created_at,
          createdByUid: data.created_by,
          updatedAt: data.updated_at,
        },
      });
    }

    if (action === 'update') {
      const folderId = String(body.folderId ?? '').trim();
      if (!folderId) return jsonResponse({ error: 'Se requiere folderId.' }, 400);
      const patch: Record<string, unknown> = {};
      if (typeof body.name === 'string') {
        const name = body.name.trim();
        if (!name || name.length > MAX_FOLDER_NAME_LENGTH) {
          return jsonResponse(
            { error: `Nombre de carpeta requerido (máx ${MAX_FOLDER_NAME_LENGTH}).` },
            400,
          );
        }
        patch.name = name;
      }
      if (typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)) {
        patch.sort_order = Math.max(0, Math.floor(body.sortOrder));
      }
      if (!Object.keys(patch).length) {
        return jsonResponse({ error: 'Nada que actualizar.' }, 400);
      }
      const { error } = await supabase
        .from('whatsapp_sticker_folders')
        .update(patch)
        .eq('id', folderId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'delete') {
      const folderId = String(body.folderId ?? '').trim();
      if (!folderId) return jsonResponse({ error: 'Se requiere folderId.' }, 400);
      // ON DELETE SET NULL mueve stickers a "Sin carpeta"
      const { error } = await supabase
        .from('whatsapp_sticker_folders')
        .delete()
        .eq('id', folderId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'reorder') {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.map((id: unknown) => String(id).trim()).filter(Boolean)
        : [];
      if (!orderedIds.length) {
        return jsonResponse({ error: 'orderedIds requerido.' }, 400);
      }
      for (let i = 0; i < orderedIds.length; i += 1) {
        const { error } = await supabase
          .from('whatsapp_sticker_folders')
          .update({ sort_order: i })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'action inválida (create|update|delete|reorder).' }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
