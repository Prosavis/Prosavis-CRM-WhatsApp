import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

const MAX_STICKER_NAME_LENGTH = 80;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const stickerId = String(body.stickerId ?? '').trim();
    if (!stickerId) return jsonResponse({ error: 'Se requiere stickerId.' }, 400);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name || name.length > MAX_STICKER_NAME_LENGTH) {
        return jsonResponse({ error: `Nombre requerido (máx ${MAX_STICKER_NAME_LENGTH} caracteres).` }, 400);
      }
      patch.name = name;
    }

    if (typeof body.archived === 'boolean') patch.archived = body.archived;

    if (typeof body.favorite === 'boolean') {
      const { data: existing, error: readError } = await supabase
        .from('whatsapp_stickers')
        .select('favorite_by_uids')
        .eq('id', stickerId)
        .single();
      if (readError) throw readError;
      const current = Array.isArray(existing.favorite_by_uids) ? existing.favorite_by_uids : [];
      patch.favorite_by_uids = body.favorite
        ? [...new Set([...current, user.id])]
        : current.filter((uid: string) => uid !== user.id);
    }

    const { error } = await supabase.from('whatsapp_stickers').update(patch).eq('id', stickerId);
    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
