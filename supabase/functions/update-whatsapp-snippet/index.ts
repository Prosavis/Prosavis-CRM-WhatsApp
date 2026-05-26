import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const snippetId = String(body.snippetId ?? '').trim();
    if (!snippetId) return jsonResponse({ error: 'Se requiere snippetId.' }, 400);

    const patch: Record<string, unknown> = {};

    if (typeof body.shortcut === 'string') {
      const shortcut = body.shortcut.trim().toLowerCase();
      if (!shortcut.startsWith('/')) {
        return jsonResponse({ error: 'El shortcut debe comenzar con /.' }, 400);
      }
      if (shortcut.includes(' ')) {
        return jsonResponse({ error: 'El shortcut no puede contener espacios.' }, 400);
      }
      const { data: existing } = await supabase
        .from('whatsapp_snippets')
        .select('id')
        .eq('shortcut', shortcut)
        .maybeSingle();
      if (existing && existing.id !== snippetId) {
        return jsonResponse({ error: `Ya existe un snippet con el atajo "${shortcut}".` }, 409);
      }
      patch.shortcut = shortcut;
    }

    if (typeof body.label === 'string' && body.label.trim()) {
      patch.label = body.label.trim();
      patch.title = body.label.trim();
    }
    if (typeof body.body === 'string' && body.body.trim()) patch.body = body.body.trim();

    if (!Object.keys(patch).length) {
      return jsonResponse({ error: 'No hay campos para actualizar.' }, 400);
    }

    const { error } = await supabase.from('whatsapp_snippets').update(patch).eq('id', snippetId);
    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
