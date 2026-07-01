/**
 * reminder-automations-monitor
 *
 * Panel de automatizaciones para el pipeline de recordatorios WhatsApp 24h:
 * cruza citas en Firestore (appointments) con whatsapp_message_log.
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireDirectoryAdmin } from '../_shared/directoryMonitorAuth.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import {
  buildDashboard,
  buildSnapshotRowsForServiceDate,
  handleRetry,
  setRecipientPreference,
} from '../_shared/reminderDashboardBuilder.ts';
import type { RecipientType } from '../_shared/reminderRecipientKey.ts';
import {
  fetchReminderHistory,
  persistBatchSnapshot,
} from '../_shared/reminderBatchSnapshot.ts';

function verifyReminderApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const expected = Deno.env.get('REMINDER_API_KEY')?.trim();
  return Boolean(apiKey && expected && apiKey === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'GET'
      ? {}
      : await req.json().catch(() => ({}));
    const action = String(body.action ?? 'dashboard').trim();

    if (action === 'snapshot') {
      if (!verifyReminderApiKey(req)) {
        return jsonResponse({ error: 'No autorizado.' }, 401);
      }

      const runKind = body.runKind as 'primary' | 'retry';
      const schedulerName = String(body.schedulerName ?? '').trim();
      const serviceDate = String(body.serviceDate ?? '').trim();

      if (!['primary', 'retry'].includes(runKind)) {
        return jsonResponse({ error: 'runKind inválido.' }, 400);
      }
      if (!schedulerName) {
        return jsonResponse({ error: 'schedulerName es requerido.' }, 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
        return jsonResponse({ error: 'serviceDate inválido (YYYY-MM-DD).' }, 400);
      }

      const supabase = getServiceClient();
      const rows = await buildSnapshotRowsForServiceDate(supabase, serviceDate);
      const result = await persistBatchSnapshot(supabase, rows, {
        runKind,
        schedulerName,
        serviceDate,
      });
      return jsonResponse({ success: true, ...result });
    }

    const { supabase, actor } = await requireDirectoryAdmin(req);

    if (req.method === 'GET' || action === 'dashboard') {
      return jsonResponse(await buildDashboard(supabase));
    }

    if (action === 'retry') {
      const appointmentId = String(body.appointmentId ?? '').trim();
      const recipientType = body.recipientType as RecipientType;
      return await handleRetry(supabase, appointmentId, recipientType);
    }

    if (action === 'history') {
      const dateFrom = String(body.dateFrom ?? '').trim();
      const dateTo = String(body.dateTo ?? '').trim();
      const recipientType = body.recipientType as RecipientType | undefined;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return jsonResponse({ error: 'dateFrom y dateTo requeridos (YYYY-MM-DD).' }, 400);
      }

      const history = await fetchReminderHistory(supabase, {
        dateFrom,
        dateTo,
        recipientType: recipientType && ['client', 'professional'].includes(recipientType)
          ? recipientType
          : undefined,
      });
      return jsonResponse(history);
    }

    if (action === 'setRecipientPreference') {
      const recipientKey = String(body.recipientKey ?? '').trim();
      const recipientType = body.recipientType as RecipientType;
      const remindersEnabled = Boolean(body.remindersEnabled);

      if (!recipientKey) {
        return jsonResponse({ error: 'recipientKey es requerido.' }, 400);
      }
      if (!['client', 'professional'].includes(recipientType)) {
        return jsonResponse({ error: 'recipientType inválido.' }, 400);
      }

      const updatedBy = actor.kind === 'supabase' ? actor.uid : null;
      await setRecipientPreference(supabase, {
        recipientKey,
        recipientType,
        remindersEnabled,
        updatedBy,
      });
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
