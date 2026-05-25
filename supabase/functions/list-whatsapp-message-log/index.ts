import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const days = Number(body.days ?? 30);
    const from = new Date();
    from.setDate(from.getDate() - days);

    let query = supabase
      .from('whatsapp_message_log')
      .select('*')
      .eq('hidden_from_panel', false)
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })
      .limit(Number(body.limit ?? 100));

    if (body.phoneNumberId) query = query.eq('phone_number_id', body.phoneNumberId);
    if (body.status && body.status !== 'all') query = query.eq('status', body.status);
    if (body.search) {
      query = query.or(
        `message_body.ilike.%${body.search}%,recipient_phone.ilike.%${body.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return jsonResponse(data ?? []);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
