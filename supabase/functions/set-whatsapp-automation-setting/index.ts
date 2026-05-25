import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json();
    const enabled = Boolean(body.enabled);

    const { error } = await supabase
      .from('platform_settings')
      .upsert({
        key: 'whatsapp_automation',
        value: { enabled },
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return jsonResponse({ enabled });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
