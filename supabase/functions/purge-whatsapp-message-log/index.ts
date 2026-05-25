import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

const CONFIRM_PHRASE = 'BORRAR_LOGS_WHATSAPP';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json();
    const confirmation = String(body.confirmation ?? '').trim();
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId) : undefined;

    if (confirmation !== CONFIRM_PHRASE) {
      return jsonResponse({ error: 'Frase de confirmación incorrecta.' }, 400);
    }

    let query = supabase.from('whatsapp_message_log').delete({ count: 'exact' });
    if (phoneNumberId) query = query.eq('phone_number_id', phoneNumberId);

    const { error, count } = await query;
    if (error) throw error;

    return jsonResponse({
      deleted: count ?? 0,
      scopedToPhoneNumberId: Boolean(phoneNumberId),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
