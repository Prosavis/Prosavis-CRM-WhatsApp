import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const { data, error } = await supabase
      .from('whatsapp_template_presets')
      .select(
        'id,preset_label,template_name,template_language,header_values,body_values,section_key,is_favorite,sort_order,created_at,updated_at',
      )
      .order('is_favorite', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('preset_label', { ascending: true });

    if (error) throw error;

    return jsonResponse({ presets: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
