import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  buildTemplateDisplayBody,
  ensureConversation,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  outboundConversationKey,
  outboundRecipientLogIdentity,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import {
  BSUID_AUTH_TEMPLATE_UNSUPPORTED_CODE,
  assertTemplateRecipientSupported,
  resolveTemplateRecipientKey,
} from '../_shared/whatsappTemplateRecipient.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const recipientPhone = body.recipientPhone ? String(body.recipientPhone).trim() : '';
    const templateName = body.templateName ? String(body.templateName).trim() : '';
    const templateLanguage = body.templateLanguage ? String(body.templateLanguage).trim() : 'es_CO';
    const templateCategory = body.templateCategory ? String(body.templateCategory).trim() : undefined;
    const components = body.components as Array<Record<string, unknown>> | undefined;
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;
    const displayMessageBody = body.displayMessageBody
      ? String(body.displayMessageBody).trim()
      : buildTemplateDisplayBody(templateName, components);

    if (!recipientPhone || !templateName) {
      return jsonResponse({ error: 'Se requieren recipientPhone y templateName.' }, 400);
    }

    try {
      assertMetaSendEnabled();
    } catch (error) {
      return jsonResponse({ error: String(error) }, 503);
    }

    const recipientKey = resolveTemplateRecipientKey(recipientPhone);
    try {
      assertTemplateRecipientSupported(recipientKey, templateCategory);
    } catch (error) {
      return jsonResponse({
        error: formatError(error),
        code: BSUID_AUTH_TEMPLATE_UNSUPPORTED_CODE,
      }, 400);
    }
    if (await isRecipientBlocked(supabase, recipientKey)) {
      return jsonResponse({ error: 'recipient_blocked' }, 400);
    }

    const graph = getGraphCredentials(phoneNumberId);
    const metaResult = await sendToMeta({
      to: recipientKey,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName,
      templateLanguage,
      templateComponents: components,
      messageBody: displayMessageBody,
    });

    const stableKey = outboundConversationKey(recipientKey, graph.phoneNumberId);
    const recipientIdentity = outboundRecipientLogIdentity(recipientKey);

    await ensureConversation(supabase, stableKey, recipientKey, graph.phoneNumberId);

    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: recipientIdentity.recipientPhone,
        recipient_bsuid: recipientIdentity.recipientBsuid,
        direction: 'outbound',
        sender_type: 'agent',
        message_body: displayMessageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: templateName,
        campaign_type: 'MANUAL_PANEL',
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: metaResult.payload,
      },
      user.id,
      'crm',
    );

    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await updateConversationPreview(
      supabase,
      stableKey,
      displayMessageBody,
      metaResult.status,
      createdAt,
    );

    if (metaResult.status === 'failed') {
      return jsonResponse({ error: metaResult.errorMessage ?? 'No se pudo enviar la plantilla.' }, 412);
    }

    return jsonResponse({ success: true, waMessageId: metaResult.waMessageId });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
