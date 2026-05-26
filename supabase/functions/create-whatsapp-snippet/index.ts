import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const shortcut = String(body.shortcut ?? '').trim().toLowerCase();
    const label = String(body.label ?? '').trim();
    const text = String(body.body ?? '').trim();

    if (!shortcut || !label || !text) {
      return jsonResponse({ error: 'Se requieren shortcut, label y body.' }, 400);
    }
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
    if (existing) {
      return jsonResponse({ error: `Ya existe un snippet con el atajo "${shortcut}".` }, 409);
    }

    const { data, error } = await supabase
      .from('whatsapp_snippets')
      .insert({
        shortcut,
        label,
        title: label,
        body: text,
        created_by: user.id,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    return jsonResponse({ success: true, id: data.id });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
