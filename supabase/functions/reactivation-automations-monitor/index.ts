/**
 * reactivation-automations-monitor
 *
 * Panel de automatizaciones de reactivación WhatsApp.
 * Acciones: dashboard | history | setRecipientPreference | runDry | runReal | retryStep
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireDirectoryAdmin } from '../_shared/directoryMonitorAuth.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import {
  buildReactivationDashboard,
  fetchReactivationHistory,
  setReactivationPreference,
} from '../_shared/reactivationDashboard.ts';
import { runReactivations } from '../_shared/reactivationRunner.ts';
import {
  REACTIVATION_SEQUENCE,
  getStepDef,
  buildDisplayBody,
  buildTemplateComponents,
  REACTIVATION_TEMPLATE_LANGUAGE,
  REACTIVATION_CAMPAIGN_TYPE,
} from '../_shared/reactivationCadence.ts';
import {
  assertMetaSendEnabled,
  ensureConversation,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import {
  getStableKeyFromRecipient,
  normalizePhone,
  resolveRecipient,
} from '../_shared/whatsappIdentity.ts';

function verifyApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const expected =
    Deno.env.get('REACTIVATION_API_KEY')?.trim() ||
    Deno.env.get('REMINDER_API_KEY')?.trim();
  return Boolean(apiKey && expected && apiKey === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'GET'
      ? { action: 'dashboard' }
      : await req.json().catch(() => ({ action: 'dashboard' }));
    const action = String(body.action ?? 'dashboard').trim();

    // Worker-triggered dry run via API key (opcional)
    if (action === 'runDry' && verifyApiKey(req)) {
      const supabase = getServiceClient();
      const result = await runReactivations({
        supabase,
        dryRun: true,
        limit: body.limit != null ? Number(body.limit) : 20,
        schedulerName: 'reactivation-automations-monitor',
        runKind: 'dry_run',
      });
      return jsonResponse({ success: true, ...result, events: result.events.slice(0, 100) });
    }

    const { supabase, actor } = await requireDirectoryAdmin(req);

    if (req.method === 'GET' || action === 'dashboard') {
      return jsonResponse(await buildReactivationDashboard(supabase));
    }

    if (action === 'history') {
      const dateFrom = String(body.dateFrom ?? '').trim();
      const dateTo = String(body.dateTo ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return jsonResponse({ error: 'dateFrom y dateTo requeridos (YYYY-MM-DD).' }, 400);
      }
      return jsonResponse(await fetchReactivationHistory(supabase, { dateFrom, dateTo }));
    }

    if (action === 'setRecipientPreference') {
      const directoryId = String(body.directoryId ?? '').trim();
      const reactivationsEnabled = Boolean(body.reactivationsEnabled);
      if (!directoryId) {
        return jsonResponse({ error: 'directoryId es requerido.' }, 400);
      }
      const updatedBy = actor.kind === 'supabase' ? actor.uid : null;
      await setReactivationPreference(supabase, {
        directoryId,
        reactivationsEnabled,
        updatedBy,
      });
      return jsonResponse({ success: true });
    }

    if (action === 'runDry') {
      const result = await runReactivations({
        supabase,
        dryRun: true,
        limit: body.limit != null ? Number(body.limit) : 50,
        schedulerName: 'reactivation-automations-monitor',
        runKind: 'dry_run',
      });
      return jsonResponse({
        success: true,
        runId: result.runId,
        stats: result.stats,
        dueCount: result.due.length,
        events: result.events.slice(0, 100),
      });
    }

    if (action === 'runReal') {
      try {
        assertMetaSendEnabled();
      } catch (error) {
        return jsonResponse({ error: String(error) }, 503);
      }
      const result = await runReactivations({
        supabase,
        dryRun: false,
        limit: body.limit != null ? Number(body.limit) : undefined,
        schedulerName: 'reactivation-monitor-manual',
        runKind: 'manual',
      });
      return jsonResponse({
        success: true,
        runId: result.runId,
        stats: result.stats,
        dueCount: result.due.length,
        events: result.events.slice(0, 100),
      });
    }

    if (action === 'retryStep') {
      const directoryId = String(body.directoryId ?? '').trim();
      const stepNumber = Number(body.stepNumber ?? 0);
      if (!directoryId || !Number.isFinite(stepNumber) || stepNumber < 1 || stepNumber > 6) {
        return jsonResponse({ error: 'directoryId y stepNumber (1-6) requeridos.' }, 400);
      }

      const step = getStepDef(stepNumber);
      if (!step) return jsonResponse({ error: 'Paso inválido.' }, 400);

      const { data: entry, error: entryError } = await supabase
        .from('crm_directory')
        .select('id,display_name,full_name,phone,opt_out')
        .eq('id', directoryId)
        .maybeSingle();
      if (entryError) throw entryError;
      if (!entry) return jsonResponse({ error: 'Contacto no encontrado.' }, 404);
      if (entry.opt_out) return jsonResponse({ error: 'Contacto en opt-out.' }, 400);
      if (!entry.phone) return jsonResponse({ error: 'Sin teléfono.' }, 400);

      const firstName = String(entry.display_name || entry.full_name || 'Cliente')
        .split(' ')[0];

      try {
        assertMetaSendEnabled();
      } catch (error) {
        return jsonResponse({ error: String(error) }, 503);
      }

      const graph = getGraphCredentials();
      const phone = normalizePhone(String(entry.phone));
      if (await isRecipientBlocked(supabase, phone)) {
        return jsonResponse({ error: 'recipient_blocked' }, 400);
      }

      const components = buildTemplateComponents(firstName, step);
      const messageBody = buildDisplayBody(firstName, step);

      const metaResult = await sendToMeta({
        to: phone,
        phoneNumberId: graph.phoneNumberId,
        accessToken: graph.accessToken,
        templateName: step.templateName,
        templateLanguage: REACTIVATION_TEMPLATE_LANGUAGE,
        templateComponents: components,
        messageBody,
        requirePhone: true,
      });

      const stableKey = getStableKeyFromRecipient(phone);
      const recipient = resolveRecipient(phone);
      await ensureConversation(supabase, stableKey, phone, graph.phoneNumberId);
      const persisted = await persistOutboundLog(
        supabase,
        {
          conversation_stable_key: stableKey,
          recipient_phone: phone,
          recipient_bsuid: recipient.bsuid ?? null,
          direction: 'outbound',
          sender_type: 'system',
          message_body: messageBody,
          status: metaResult.status,
          wa_message_id: metaResult.waMessageId,
          template_name: step.templateName,
          campaign_type: REACTIVATION_CAMPAIGN_TYPE,
          phone_number_id: graph.phoneNumberId,
          error_message: metaResult.errorMessage ?? null,
          raw_payload: {
            ...metaResult.payload,
            source: 'reactivation_manual_retry',
            reactivationStep: stepNumber,
          },
        },
        // deno-lint-ignore no-explicit-any
        null as any,
      );
      const createdAt = persisted.createdAt ?? new Date().toISOString();
      await updateConversationPreview(
        supabase,
        stableKey,
        messageBody,
        metaResult.status,
        createdAt,
      );

      if (metaResult.status === 'failed') {
        return jsonResponse({
          success: false,
          error: metaResult.errorMessage ?? 'Envío fallido',
        }, 412);
      }

      await supabase
        .from('crm_directory')
        .update({
          active_sequence: REACTIVATION_SEQUENCE,
          sequence_step: stepNumber,
          last_contact_at: new Date().toISOString(),
        })
        .eq('id', directoryId);

      return jsonResponse({
        success: true,
        waMessageId: metaResult.waMessageId,
        templateName: step.templateName,
      });
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
