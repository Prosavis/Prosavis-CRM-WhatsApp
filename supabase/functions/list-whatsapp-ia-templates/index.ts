import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const { data, error } = await supabase
      .from('whatsapp_ia_templates')
      .select('id,name,body,variables,created_at')
      .eq('archived', false)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const templates = (data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      description: row.name,
      body: row.body,
      variables: Array.isArray(row.variables) ? row.variables : [],
      isDefault: false,
      generatedByAI: false,
    }));

    return jsonResponse({ templates });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
