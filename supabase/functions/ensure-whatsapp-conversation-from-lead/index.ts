import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json();
    const phone = normalizePhone(String(body.phone ?? ''));
    const name = body.name ? String(body.name) : null;
    const phoneNumberId = body.phoneNumberId
      ? String(body.phoneNumberId)
      : Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? null;

    if (!phone || phone.length < 10) {
      return jsonResponse({ error: 'Teléfono inválido.' }, 400);
    }

    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key, phone_number_id, contact_name')
      .eq('stable_key', phone)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('whatsapp_conversations').insert({
        stable_key: phone,
        phone,
        contact_phone: phone,
        contact_name: name,
        phone_number_id: phoneNumberId,
        state: 'active',
      });
      if (error) throw error;
    } else {
      const patch: Record<string, unknown> = {};
      if (name && name !== existing.contact_name) {
        patch.contact_name = name;
      }
      // Conversaciones creadas por recordatorios/bulk a veces quedan sin línea WABA
      // y el inbox las filtra por phone_number_id — backfill al abrir desde directorio.
      if (phoneNumberId && !existing.phone_number_id) {
        patch.phone_number_id = phoneNumberId;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from('whatsapp_conversations')
          .update(patch)
          .eq('stable_key', phone);
        if (error) throw error;
      }
    }

    return jsonResponse({ success: true, conversationId: phone });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
