import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  metaErrorCode,
  metaErrorMessage,
  persistOutboundLog,
  sendToMeta,
} from '../_shared/whatsappOutbound.ts';
import { getStableKeyFromRecipient, normalizePhone, resolveRecipient } from '../_shared/whatsappIdentity.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const to = String(body.to ?? '').trim();
    const reactToWaMessageId = String(body.reactToWaMessageId ?? '').trim();
    const emoji = typeof body.emoji === 'string' ? body.emoji : '';
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;
    const clientRequestId = body.clientRequestId ? String(body.clientRequestId).trim() : undefined;

    if (!to) return jsonResponse({ error: 'Se requiere destinatario (to).' }, 400);
    if (!reactToWaMessageId) return jsonResponse({ error: 'Se requiere el mensaje a reaccionar.' }, 400);

    try {
      assertMetaSendEnabled();
    } catch (error) {
      return jsonResponse({ error: String(error) }, 503);
    }

    if (await isRecipientBlocked(supabase, to)) {
      return jsonResponse({ error: 'recipient_blocked' }, 400);
    }

    const graph = getGraphCredentials(phoneNumberId);
    const recipient = resolveRecipient(to);
    const stableKey = getStableKeyFromRecipient(to);
    const recipientPhone = recipient.phone ? normalizePhone(recipient.phone) : stableKey;
    const reactionRemoved = emoji.trim() === '';

    const metaResult = await sendToMeta({
      to,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      reactionToWaMessageId: reactToWaMessageId,
      reactionEmoji: emoji,
    });

    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: recipientPhone,
        recipient_bsuid: recipient.bsuid ?? null,
        direction: 'outbound',
        sender_type: 'agent',
        message_body: emoji,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        reaction_to: reactToWaMessageId,
        reaction_removed: reactionRemoved,
        client_request_id: clientRequestId ?? null,
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: metaResult.payload,
      },
      user.id,
    );

    if (metaResult.status === 'failed') {
      const code = metaErrorCode(metaResult.payload);
      const message = code === 131009
        ? 'Meta no permite reaccionar a este mensaje. Puede ser muy antiguo o no existir.'
        : metaErrorMessage(metaResult.payload) ?? 'No se pudo enviar la reacción.';
      return jsonResponse({ error: message }, 500);
    }

    return jsonResponse({
      success: true,
      waMessageId: metaResult.waMessageId,
      messageId: persisted.messageId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
