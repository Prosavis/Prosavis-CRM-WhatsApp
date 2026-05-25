import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json();
    const stableKey = String(body.stableKey ?? body.conversationKey ?? body.conversationId ?? '').trim();

    if (!stableKey) return jsonResponse({ error: 'stableKey es requerido.' }, 400);

    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0, crm_force_unread: false })
      .eq('stable_key', stableKey);

    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
