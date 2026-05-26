import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[{}]/g, '').trim()))];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? '').trim();
    const description = String(body.description ?? label).trim();
    const text = String(body.body ?? '').trim();

    if (!label || !text) return jsonResponse({ error: 'Se requieren label y body.' }, 400);

    const { data, error } = await supabase
      .from('whatsapp_ia_templates')
      .insert({
        name: label,
        body: text,
        variables: extractVariables(text),
        created_by: user.id,
        archived: false,
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
