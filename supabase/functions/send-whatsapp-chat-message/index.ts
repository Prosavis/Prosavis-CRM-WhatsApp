import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

interface MetaSendResult {
  status: 'sent' | 'failed';
  waMessageId: string | null;
  payload: Record<string, unknown>;
}

async function sendTextToMeta(params: {
  recipientPhone: string;
  messageBody: string;
  phoneNumberId: string;
}): Promise<MetaSendResult> {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const graphVersion = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v21.0';

  if (!accessToken) {
    throw new Error('Falta WHATSAPP_ACCESS_TOKEN para envio real.');
  }

  if (!params.phoneNumberId) {
    throw new Error('Falta WHATSAPP_PHONE_NUMBER_ID para envio real.');
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.recipientPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: params.messageBody,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  const waMessageId =
    Array.isArray(payload.messages) && payload.messages[0]?.id
      ? String(payload.messages[0].id)
      : null;

  return {
    status: response.ok && waMessageId ? 'sent' : 'failed',
    waMessageId,
    payload: {
      metaStatus: response.status,
      metaOk: response.ok,
      metaResponse: payload,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json();
    const stableKey = String(body.conversationStableKey ?? body.to ?? '').trim();
    const messageBody = String(body.messageBody ?? body.text ?? '').trim();
    const recipientPhone = String(body.recipientPhone ?? body.to ?? stableKey).trim();
    const phoneNumberId = String(
      body.phoneNumberId ?? Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    ).trim();
    const metaSendEnabled = Deno.env.get('ENABLE_META_SEND') === 'true';

    if (!stableKey || !messageBody) {
      return jsonResponse({ error: 'conversationStableKey y messageBody son requeridos.' }, 400);
    }

    if (!recipientPhone) {
      return jsonResponse({ error: 'recipientPhone es requerido para envio real.' }, 400);
    }

    if (!metaSendEnabled) {
      return jsonResponse(
        {
          error:
            'Envio Meta desactivado. Configure ENABLE_META_SEND=true y secrets validos para operar en produccion.',
        },
        503,
      );
    }

    const metaResult = await sendTextToMeta({ recipientPhone, messageBody, phoneNumberId });

    const { data: message, error: insertError } = await supabase
      .from('whatsapp_message_log')
      .insert({
        conversation_stable_key: stableKey,
        recipient_phone: recipientPhone,
        direction: 'outbound',
        sender_type: 'agent',
        agent_uid: user.id,
        message_body: messageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        campaign_type: 'OTHER',
        phone_number_id: phoneNumberId || null,
        raw_payload: metaResult.payload,
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
        last_message_outbound_status: metaResult.status,
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
