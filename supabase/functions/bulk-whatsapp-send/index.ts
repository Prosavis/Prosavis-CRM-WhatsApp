import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  buildTemplateDisplayBody,
  ensureConversation,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendTextOutbound,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import { directoryPhoneLookupVariants } from '../_shared/directoryPhone.ts';
import { getStableKeyFromRecipient, normalizePhone, resolveRecipient } from '../_shared/whatsappIdentity.ts';

const BULK_CONFIRM_PHRASE = 'CONFIRMAR_ENVIO_MASIVO';
const BATCH_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    if (String(body.confirmation ?? '') !== BULK_CONFIRM_PHRASE) {
      return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
    }

    const recipients = (body.recipients ?? []) as Array<{ phone: string; name?: string }>;
    if (!recipients.length) return jsonResponse({ error: 'Sin destinatarios.' }, 400);
    if (recipients.length > 500) return jsonResponse({ error: 'Máximo 500 destinatarios por envío.' }, 400);

    const isTemplateMode = Boolean(body.templateName);
    const templateName = body.templateName ? String(body.templateName).trim() : '';
    const templateLanguage = body.templateLanguage ? String(body.templateLanguage) : 'es_CO';
    const templateComponents = body.templateComponents as Array<Record<string, unknown>> | undefined;
    const richBody = body.richBody ? String(body.richBody).trim() : '';
    const displayMessageBodyFromClient = body.displayMessageBody
      ? String(body.displayMessageBody).trim()
      : '';
    if (!isTemplateMode && !richBody) {
      return jsonResponse({ error: 'Se requiere templateName o richBody.' }, 400);
    }

    assertMetaSendEnabled();
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;
    const graph = getGraphCredentials(phoneNumberId);

    const { data: job, error: jobError } = await supabase
      .from('whatsapp_broadcast_jobs')
      .insert({
        status: 'processing',
        total_recipients: recipients.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        template_name: body.templateName ? String(body.templateName) : null,
        rich_body_preview: richBody ? richBody.slice(0, 200) : null,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (jobError) throw jobError;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const recipient of recipients) {
      const phone = normalizePhone(String(recipient.phone ?? '').trim());
      if (!phone || phone.length < 10) {
        skipped += 1;
        continue;
      }

      if (await isRecipientBlocked(supabase, phone)) {
        skipped += 1;
        continue;
      }

      const phoneVariants = directoryPhoneLookupVariants(phone);
      const lookupPhones = phoneVariants.length > 0 ? phoneVariants : [phone];
      const { data: directoryRows } = await supabase
        .from('crm_directory')
        .select('opt_out')
        .in('phone', lookupPhones)
        .limit(1);
      const directoryEntry = directoryRows?.[0] ?? null;
      if (directoryEntry?.opt_out) {
        skipped += 1;
        continue;
      }

      try {
        if (isTemplateMode) {
          const displayMessageBody =
            displayMessageBodyFromClient ||
            buildTemplateDisplayBody(templateName, templateComponents);

          const metaResult = await sendToMeta({
            to: phone,
            phoneNumberId: graph.phoneNumberId,
            accessToken: graph.accessToken,
            templateName,
            templateLanguage,
            templateComponents,
            messageBody: displayMessageBody,
            requirePhone: true,
          });

          const stableKey = getStableKeyFromRecipient(phone);
          const resolved = resolveRecipient(phone);
          const contactName = recipient.name ? String(recipient.name).trim() : null;

          await ensureConversation(
            supabase,
            stableKey,
            phone,
            graph.phoneNumberId,
            contactName,
          );

          const persisted = await persistOutboundLog(
            supabase,
            {
              conversation_stable_key: stableKey,
              recipient_phone: phone,
              recipient_bsuid: resolved.bsuid ?? null,
              direction: 'outbound',
              sender_type: 'agent',
              message_body: displayMessageBody,
              status: metaResult.status,
              wa_message_id: metaResult.waMessageId,
              template_name: templateName,
              campaign_type: 'BULK_PANEL',
              phone_number_id: graph.phoneNumberId,
              error_message: metaResult.errorMessage ?? null,
              raw_payload: metaResult.payload,
            },
            user.id,
          );

          const createdAt = persisted.createdAt ?? new Date().toISOString();
          await updateConversationPreview(
            supabase,
            stableKey,
            displayMessageBody,
            metaResult.status,
            createdAt,
          );

          if (metaResult.status === 'sent') sent += 1;
          else failed += 1;
        } else {
          const result = await sendTextOutbound(supabase, {
            to: phone,
            text: richBody,
            phoneNumberId,
            agentUid: user.id,
            campaignType: 'BULK_PANEL',
            templateName: 'bulk_rich',
            contactName: recipient.name ? String(recipient.name).trim() : null,
          });
          if (result.success) sent += 1;
          else failed += 1;
        }
      } catch {
        failed += 1;
      }

      await supabase.from('whatsapp_broadcast_jobs').update({
        sent,
        failed,
        skipped,
      }).eq('id', job.id);

      await sleep(BATCH_DELAY_MS);
    }

    await supabase.from('whatsapp_broadcast_jobs').update({
      status: 'completed',
      sent,
      failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);

    return jsonResponse({ jobId: job.id, sent, failed, skipped });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
