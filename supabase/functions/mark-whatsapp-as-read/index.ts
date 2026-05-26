import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError, WHATSAPP_API_VERSION } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const waMessageId = body.waMessageId ? String(body.waMessageId).trim() : '';
    const conversationKey = String(
      body.stableKey ?? body.conversationKey ?? body.conversationId ?? '',
    ).trim();
    const phoneNumberId = (
      body.phoneNumberId ? String(body.phoneNumberId).trim() : Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
    ).trim();
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim() ?? '';

    if (!waMessageId && !conversationKey) {
      return jsonResponse({ error: 'Se requiere waMessageId o conversationKey.' }, 400);
    }

    if (waMessageId && phoneNumberId && accessToken) {
      const response = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: waMessageId,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.warn('mark-whatsapp-as-read Meta API warning', payload);
      }
    }

    if (conversationKey) {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 0, crm_force_unread: false })
        .eq('stable_key', conversationKey);
      if (error) throw error;
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
