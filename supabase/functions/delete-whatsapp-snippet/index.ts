import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const snippetId = String(body.snippetId ?? '').trim();
    if (!snippetId) return jsonResponse({ error: 'Se requiere snippetId.' }, 400);

    const { error } = await supabase.from('whatsapp_snippets').delete().eq('id', snippetId);
    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
