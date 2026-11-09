import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  isReactivationPhoneValid,
  normalizeDirectoryPhoneE164,
} from '../_shared/directoryPhone.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';
import { claimLidConversationPhone } from '../_shared/whatsappLidClaim.ts';
import {
  commercialPhoneNumberId,
  customerPhoneFromStableKey,
  isCommercialStableKey,
  isLidStableKey,
  LID_CUSTOMER_PREFIX,
} from '../_shared/whatsappLines.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const rawKey = String(body.conversationId ?? body.stableKey ?? '').trim();
    const rawPhone = String(body.phone ?? '').trim();

    if (!isLidStableKey(rawKey)) {
      return jsonResponse(
        { error: 'La conversación no es un identificador privado de WhatsApp.' },
        400,
      );
    }

    const e164 = normalizeDirectoryPhoneE164(rawPhone);
    if (!e164 || !isReactivationPhoneValid(e164)) {
      return jsonResponse(
        { error: 'Teléfono inválido. Usa formato internacional, ej. +573001234567' },
        400,
      );
    }

    const { data: conv, error: readError } = await supabase
      .from('whatsapp_conversations')
      .select('phone_number_id')
      .eq('stable_key', rawKey)
      .maybeSingle();
    if (readError) throw readError;

    const phoneNumberId = conv?.phone_number_id
      ? String(conv.phone_number_id)
      : (isCommercialStableKey(rawKey) ? commercialPhoneNumberId() : null);
    const userId = customerPhoneFromStableKey(rawKey).slice(LID_CUSTOMER_PREFIX.length).trim();
    if (!userId) {
      return jsonResponse({ error: 'El chat no tiene un identificador privado utilizable.' }, 400);
    }

    const claimed = await claimLidConversationPhone({
      supabase,
      userId,
      phone: normalizePhone(e164),
      phoneNumberId,
    });

    return jsonResponse({ success: true, ...claimed });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
