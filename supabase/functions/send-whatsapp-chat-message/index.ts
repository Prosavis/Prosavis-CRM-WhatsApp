import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json();
    const stableKey = String(body.conversationStableKey ?? '').trim();
    const messageBody = String(body.messageBody ?? '').trim();

    if (!stableKey || !messageBody) {
      return jsonResponse({ error: 'conversationStableKey y messageBody son requeridos.' }, 400);
    }

    const { data: message, error: insertError } = await supabase
      .from('whatsapp_message_log')
      .insert({
        conversation_stable_key: stableKey,
        recipient_phone: body.recipientPhone ?? stableKey,
        direction: 'outbound',
        sender_type: 'agent',
        agent_uid: user.id,
        message_body: messageBody,
        status: 'sent',
        campaign_type: 'OTHER',
        phone_number_id: body.phoneNumberId ?? null,
        raw_payload: { phase: 'stub', metaSendEnabled: false },
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: messageBody,
        last_message_at: message.created_at,
        last_message_direction: 'outbound',
        last_message_outbound_status: 'sent',
        unread_count: 0,
      })
      .eq('stable_key', stableKey);

    if (updateError) throw updateError;
    return jsonResponse(message);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
