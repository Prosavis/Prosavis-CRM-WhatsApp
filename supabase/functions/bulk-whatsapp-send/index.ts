import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  formatError,
  isRecipientBlocked,
  sendTextOutbound,
  sendToMeta,
  getGraphCredentials,
  assertMetaSendEnabled,
  persistOutboundLog,
} from '../_shared/whatsappOutbound.ts';
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
    const richBody = body.richBody ? String(body.richBody).trim() : '';
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

      const { data: directoryEntry } = await supabase
        .from('crm_directory')
        .select('opt_out')
        .eq('phone', phone)
        .maybeSingle();
      if (directoryEntry?.opt_out) {
        skipped += 1;
        continue;
      }

      try {
        if (isTemplateMode) {
          const metaResult = await sendToMeta({
            to: phone,
            phoneNumberId: graph.phoneNumberId,
            accessToken: graph.accessToken,
            templateName: String(body.templateName),
            templateLanguage: body.templateLanguage ? String(body.templateLanguage) : 'es_CO',
            templateComponents: body.templateComponents,
            messageBody: `[Plantilla] ${body.templateName}`,
            requirePhone: true,
          });

          const stableKey = getStableKeyFromRecipient(phone);
          const resolved = resolveRecipient(phone);
          await persistOutboundLog(
            supabase,
            {
              conversation_stable_key: stableKey,
              recipient_phone: phone,
              recipient_bsuid: resolved.bsuid ?? null,
              direction: 'outbound',
              sender_type: 'agent',
              message_body: `[Plantilla] ${body.templateName}`,
              status: metaResult.status,
              wa_message_id: metaResult.waMessageId,
              template_name: String(body.templateName),
              campaign_type: 'BULK_PANEL',
              phone_number_id: graph.phoneNumberId,
              error_message: metaResult.errorMessage ?? null,
              raw_payload: metaResult.payload,
            },
            user.id,
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
