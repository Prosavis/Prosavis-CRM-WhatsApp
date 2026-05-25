import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'whatsapp_automation')
      .maybeSingle();

    if (error) throw error;
    const value = (data?.value ?? {}) as { enabled?: boolean };
    return jsonResponse({ enabled: value.enabled ?? false });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
