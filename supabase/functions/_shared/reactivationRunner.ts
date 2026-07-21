/**
 * Orquesta envíos de reactivación: candidatos → paso debido → Meta → estado + snapshot.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ACTIVE_CLIENT_WINDOW_DAYS,
  REACTIVATION_MAX_INACTIVE_DAYS,
  REACTIVATION_STALE_DAYS,
  type DirectorySegmentRow,
  type SegmentedClient,
  isEligibleForReactivation,
  loadLastAppointmentIndex,
  segmentDirectoryClient,
} from './clientSegments.ts';
import {
  REACTIVATION_CAMPAIGN_TYPE,
  REACTIVATION_SEQUENCE,
  REACTIVATION_TEMPLATE_LANGUAGE,
  buildDisplayBody,
  buildTemplateComponents,
  getStepDef,
  isPausedForHumanReply,
  resolveDueStep,
  type ReactivationStepNumber,
} from './reactivationCadence.ts';
import {
  assertMetaSendEnabled,
  ensureConversation,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from './whatsappOutbound.ts';
import {
  getStableKeyFromRecipient,
  normalizePhone,
  resolveRecipient,
} from './whatsappIdentity.ts';
import { isReactivationPhoneValid } from './directoryPhone.ts';

export type ReactivationOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_opt_out'
  | 'skipped_disabled'
  | 'skipped_missing_phone'
  | 'skipped_invalid_phone'
  | 'skipped_paused_reply'
  | 'skipped_not_due'
  | 'skipped_blacklisted'
  | 'skipped_company'
  | 'skipped_active'
  | 'skipped_stale'
  | 'skipped_completed'
  | 'enrolled'
  | 'exited_reactivated'
  | 'exited_completed'
  | 'exited_opt_out'
  | 'dry_run';

export interface ReactivationEvent {
  directoryId: string;
  recipientPhone: string | null;
  recipientName: string;
  stepNumber: number;
  templateName: string;
  outcome: ReactivationOutcome;
  errorMessage?: string;
  waMessageId?: string;
  lastAppointmentDate?: string | null;
  daysInactive?: number | null;
  messageBody?: string;
}

export interface ReactivationExecutionStats {
  sent: number;
  failed: number;
  dryRun: number;
  skipped: number;
  enrolled: number;
  exited: number;
  attempted: number;
}

export interface RunReactivationsParams {
  supabase: SupabaseClient;
  dryRun?: boolean;
  /** Límite de envíos reales/dry-run en este run (útil para pruebas). */
  limit?: number;
  runKind?: 'primary' | 'retry' | 'manual' | 'dry_run';
  schedulerName?: string;
  excludeCompanies?: boolean;
  /** Si true, no envía: solo calcula candidatos y pasos debidos. */
  previewOnly?: boolean;
}

export interface RunReactivationsResult {
  runId: string | null;
  runDate: string;
  dryRun: boolean;
  stats: ReactivationExecutionStats;
  events: ReactivationEvent[];
  enrolled: SegmentedClient[];
  due: Array<SegmentedClient & { dueStep: ReactivationStepNumber }>;
}

function emptyStats(): ReactivationExecutionStats {
  return {
    sent: 0,
    failed: 0,
    dryRun: 0,
    skipped: 0,
    enrolled: 0,
    exited: 0,
    attempted: 0,
  };
}

function bogotaDateKey(d = new Date()): string {
  const bogotaMs = d.getTime() - 5 * 60 * 60 * 1000;
  return new Date(bogotaMs).toISOString().slice(0, 10);
}

async function fetchAllDirectory(supabase: SupabaseClient): Promise<DirectorySegmentRow[]> {
  const pageSize = 1000;
  const rows: DirectorySegmentRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('crm_directory')
      .select(
        'id,full_name,display_name,phone,phone_key,app_user_id,classification,tags,status,opt_out,active_sequence,sequence_step,last_contact_at,last_response_at,first_contact_at,created_at,internal_notes',
      )
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as DirectorySegmentRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchBlocklistKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  const { data, error } = await supabase
    .from('whatsapp_blocklist')
    .select('phone,stable_key,bsuid');
  if (error) {
    console.error('[reactivation] blocklist query failed', error);
    return keys;
  }
  for (const row of data ?? []) {
    for (const v of [row.phone, row.stable_key, row.bsuid]) {
      if (typeof v === 'string' && v.trim()) keys.add(v.trim());
    }
  }
  return keys;
}

async function fetchDisabledDirectoryIds(supabase: SupabaseClient): Promise<Set<string>> {
  const disabled = new Set<string>();
  const { data, error } = await supabase
    .from('whatsapp_reactivation_preferences')
    .select('directory_id,reactivations_enabled')
    .eq('reactivations_enabled', false);
  if (error) {
    console.error('[reactivation] preferences query failed', error);
    return disabled;
  }
  for (const row of data ?? []) {
    if (row.directory_id) disabled.add(String(row.directory_id));
  }
  return disabled;
}

async function exitSequence(
  supabase: SupabaseClient,
  directoryId: string,
  reason: 'reactivated' | 'completed' | 'opt_out' | 'stale' | 'invalid_phone',
): Promise<void> {
  await supabase
    .from('crm_directory')
    .update({
      // Valor canónico en crm_directory (todos los contactos usan NINGUNA).
      active_sequence: 'NINGUNA',
      sequence_step: 0,
    })
    .eq('id', directoryId);
  console.log('[reactivation] exited sequence', { directoryId, reason });
}

async function advanceSequence(
  supabase: SupabaseClient,
  directoryId: string,
  step: number,
  nowIso: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    active_sequence: REACTIVATION_SEQUENCE,
    sequence_step: step,
    last_contact_at: nowIso,
  };
  await supabase.from('crm_directory').update(patch).eq('id', directoryId);
}

export async function buildReactivationUniverse(supabase: SupabaseClient): Promise<{
  clients: SegmentedClient[];
  enrolled: SegmentedClient[];
  due: Array<SegmentedClient & { dueStep: ReactivationStepNumber }>;
  disabledIds: Set<string>;
}> {
  const serviceId = Deno.env.get('PROSAVIS_SERVICE_ID')?.trim() || undefined;
  const [directoryRows, blocklistKeys, disabledIds, index] = await Promise.all([
    fetchAllDirectory(supabase),
    fetchBlocklistKeys(supabase),
    fetchDisabledDirectoryIds(supabase),
    loadLastAppointmentIndex({ serviceId }),
  ]);

  const asOf = new Date();
  const clients = directoryRows
    .filter((e) => {
      const status = (e.status || 'active').toLowerCase();
      return status === 'active';
    })
    .map((entry) =>
      segmentDirectoryClient({ entry, index, blocklistKeys, asOf }),
    );

  const enrolled = clients.filter(
    (c) => c.activeSequence === REACTIVATION_SEQUENCE && c.sequenceStep > 0,
  );

  const due: Array<SegmentedClient & { dueStep: ReactivationStepNumber }> = [];

  for (const client of clients) {
    // Reactivado: tenía secuencia y volvió a activo
    if (client.activeSequence === REACTIVATION_SEQUENCE && client.isActive) {
      continue; // se maneja en el runner como exit
    }

    const inSequence = client.activeSequence === REACTIVATION_SEQUENCE && client.sequenceStep > 0;

    if (!inSequence) {
      if (
        isEligibleForReactivation(client, {
          excludeCompanies: true,
          maxInactiveDays: REACTIVATION_MAX_INACTIVE_DAYS,
        })
      ) {
        due.push({ ...client, dueStep: 1 });
      }
      continue;
    }

    if (client.optOut || client.isBlacklisted) continue;
    if (client.daysInactive != null && client.daysInactive > REACTIVATION_STALE_DAYS) continue;
    if (client.sequenceStep >= 6) continue;

    if (
      isPausedForHumanReply({
        lastContactAt: client.lastContactAt,
        lastResponseAt: client.lastResponseAt,
      })
    ) {
      continue;
    }

    const step = resolveDueStep({
      sequenceStep: client.sequenceStep,
      lastContactAt: client.lastContactAt,
      asOf,
    });
    if (step) due.push({ ...client, dueStep: step });
  }

  return { clients, enrolled, due, disabledIds };
}

async function sendReactivationTemplate(params: {
  supabase: SupabaseClient;
  phone: string;
  clientName: string;
  stepNumber: ReactivationStepNumber;
}): Promise<{ success: boolean; waMessageId?: string; messageBody: string; templateName: string; error?: string }> {
  const step = getStepDef(params.stepNumber);
  if (!step) {
    return {
      success: false,
      messageBody: '',
      templateName: '',
      error: 'invalid_step',
    };
  }

  assertMetaSendEnabled();
  const graph = getGraphCredentials();
  const phone = normalizePhone(params.phone);
  const components = buildTemplateComponents(params.clientName, step);
  const messageBody = buildDisplayBody(params.clientName, step);

  if (await isRecipientBlocked(params.supabase, phone)) {
    return {
      success: false,
      messageBody,
      templateName: step.templateName,
      error: 'recipient_blocked',
    };
  }

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
  await ensureConversation(params.supabase, stableKey, phone, graph.phoneNumberId);

  const persisted = await persistOutboundLog(
    params.supabase,
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
        reactivationStep: params.stepNumber,
      },
    },
    // Igual que send-appointment-reminder: system jobs sin agent_uid.
    // deno-lint-ignore no-explicit-any
    null as any,
  );

  const createdAt = persisted.createdAt ?? new Date().toISOString();
  await updateConversationPreview(
    params.supabase,
    stableKey,
    messageBody,
    metaResult.status,
    createdAt,
  );

  if (metaResult.status === 'failed') {
    return {
      success: false,
      messageBody,
      templateName: step.templateName,
      error: metaResult.errorMessage ?? 'meta_failed',
    };
  }

  return {
    success: true,
    waMessageId: metaResult.waMessageId ?? undefined,
    messageBody,
    templateName: step.templateName,
  };
}

export async function runReactivations(
  params: RunReactivationsParams,
): Promise<RunReactivationsResult> {
  const dryRun = Boolean(params.dryRun || params.previewOnly);
  const runKind = params.runKind ?? (dryRun ? 'dry_run' : 'primary');
  const schedulerName = params.schedulerName ?? 'run-whatsapp-reactivations';
  const limit = params.limit && params.limit > 0 ? params.limit : undefined;
  const runDate = bogotaDateKey();
  const stats = emptyStats();
  const events: ReactivationEvent[] = [];

  const { clients, enrolled, due, disabledIds } = await buildReactivationUniverse(
    params.supabase,
  );

  // Exits: reactivados / stale / completed / opt_out
  for (const client of clients) {
    if (client.activeSequence !== REACTIVATION_SEQUENCE) continue;

    if (client.isActive) {
      if (!dryRun && !params.previewOnly) {
        await exitSequence(params.supabase, client.id, 'reactivated');
      }
      stats.exited += 1;
      events.push({
        directoryId: client.id,
        recipientPhone: client.phone,
        recipientName: client.name,
        stepNumber: client.sequenceStep,
        templateName: '',
        outcome: 'exited_reactivated',
        lastAppointmentDate: client.lastAppointmentDate,
        daysInactive: client.daysInactive,
      });
      continue;
    }

    if (client.optOut) {
      if (!dryRun && !params.previewOnly) {
        await exitSequence(params.supabase, client.id, 'opt_out');
      }
      stats.exited += 1;
      events.push({
        directoryId: client.id,
        recipientPhone: client.phone,
        recipientName: client.name,
        stepNumber: client.sequenceStep,
        templateName: '',
        outcome: 'exited_opt_out',
      });
      continue;
    }

    if (client.daysInactive != null && client.daysInactive > REACTIVATION_STALE_DAYS) {
      if (!dryRun && !params.previewOnly) {
        await exitSequence(params.supabase, client.id, 'stale');
      }
      stats.exited += 1;
      events.push({
        directoryId: client.id,
        recipientPhone: client.phone,
        recipientName: client.name,
        stepNumber: client.sequenceStep,
        templateName: '',
        outcome: 'skipped_stale',
        daysInactive: client.daysInactive,
      });
      continue;
    }

    if (client.sequenceStep >= 6) {
      if (!dryRun && !params.previewOnly) {
        await exitSequence(params.supabase, client.id, 'completed');
      }
      stats.exited += 1;
      events.push({
        directoryId: client.id,
        recipientPhone: client.phone,
        recipientName: client.name,
        stepNumber: 6,
        templateName: '',
        outcome: 'exited_completed',
      });
    }
  }

  let processed = 0;
  for (const candidate of due) {
    if (limit != null && processed >= limit) break;

    const stepDef = getStepDef(candidate.dueStep);
    if (!stepDef) continue;

    if (disabledIds.has(candidate.id)) {
      stats.skipped += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'skipped_disabled',
        lastAppointmentDate: candidate.lastAppointmentDate,
        daysInactive: candidate.daysInactive,
      });
      continue;
    }

    if (candidate.optOut) {
      stats.skipped += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'skipped_opt_out',
      });
      continue;
    }

    if (
      isPausedForHumanReply({
        lastContactAt: candidate.lastContactAt,
        lastResponseAt: candidate.lastResponseAt,
      })
    ) {
      stats.skipped += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'skipped_paused_reply',
      });
      continue;
    }

    if (!candidate.phone?.trim()) {
      stats.skipped += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: null,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'skipped_missing_phone',
      });
      continue;
    }

    // Número presente pero no entregable por WhatsApp (ej. +57 sin móvil 3xxxxxxxxx).
    // Lo sacamos de la secuencia para que no reintente/falle indefinidamente.
    if (!isReactivationPhoneValid(candidate.phone)) {
      stats.skipped += 1;
      if (!dryRun && !params.previewOnly) {
        await exitSequence(params.supabase, candidate.id, 'invalid_phone');
      }
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'skipped_invalid_phone',
      });
      continue;
    }

    processed += 1;
    stats.attempted += 1;

    if (dryRun || params.previewOnly) {
      stats.dryRun += 1;
      if (candidate.dueStep === 1 && candidate.sequenceStep < 1) stats.enrolled += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'dry_run',
        lastAppointmentDate: candidate.lastAppointmentDate,
        daysInactive: candidate.daysInactive,
        messageBody: buildDisplayBody(candidate.name, stepDef),
      });
      continue;
    }

    try {
      const result = await sendReactivationTemplate({
        supabase: params.supabase,
        phone: candidate.phone,
        clientName: candidate.name.split(' ')[0] || candidate.name,
        stepNumber: candidate.dueStep,
      });

      if (result.success) {
        const nowIso = new Date().toISOString();
        await advanceSequence(
          params.supabase,
          candidate.id,
          candidate.dueStep,
          nowIso,
        );
        stats.sent += 1;
        if (candidate.dueStep === 1 && candidate.sequenceStep < 1) stats.enrolled += 1;
        events.push({
          directoryId: candidate.id,
          recipientPhone: candidate.phone,
          recipientName: candidate.name,
          stepNumber: candidate.dueStep,
          templateName: result.templateName,
          outcome: 'sent',
          waMessageId: result.waMessageId,
          lastAppointmentDate: candidate.lastAppointmentDate,
          daysInactive: candidate.daysInactive,
          messageBody: result.messageBody,
        });
      } else {
        stats.failed += 1;
        events.push({
          directoryId: candidate.id,
          recipientPhone: candidate.phone,
          recipientName: candidate.name,
          stepNumber: candidate.dueStep,
          templateName: result.templateName,
          outcome: 'failed',
          errorMessage: result.error,
          lastAppointmentDate: candidate.lastAppointmentDate,
          daysInactive: candidate.daysInactive,
          messageBody: result.messageBody,
        });
      }
    } catch (err) {
      stats.failed += 1;
      events.push({
        directoryId: candidate.id,
        recipientPhone: candidate.phone,
        recipientName: candidate.name,
        stepNumber: candidate.dueStep,
        templateName: stepDef.templateName,
        outcome: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        lastAppointmentDate: candidate.lastAppointmentDate,
        daysInactive: candidate.daysInactive,
      });
    }
  }

  // Persist snapshot
  let runId: string | null = null;
  if (!params.previewOnly) {
    const { data: runRow, error: runError } = await params.supabase
      .from('whatsapp_reactivation_runs')
      .insert({
        run_kind: runKind,
        scheduler_name: schedulerName,
        run_date: runDate,
        dry_run: dryRun,
        summary: {
          dueCount: due.length,
          enrolledCount: enrolled.length,
          inactiveEligible: due.filter((d) => d.dueStep === 1).length,
          activeWindowDays: ACTIVE_CLIENT_WINDOW_DAYS,
        },
        execution_stats: stats,
      })
      .select('id')
      .single();

    if (runError) {
      console.error('[reactivation] failed to persist run', runError);
    } else {
      runId = runRow.id as string;
      if (events.length > 0) {
        const rows = events.map((e) => ({
          batch_run_id: runId,
          directory_id: e.directoryId,
          recipient_phone: e.recipientPhone,
          recipient_name: e.recipientName,
          step_number: e.stepNumber,
          template_name: e.templateName || 'n/a',
          outcome: e.outcome,
          error_message: e.errorMessage ?? null,
          wa_message_id: e.waMessageId ?? null,
          last_appointment_date: e.lastAppointmentDate ?? null,
          days_inactive: e.daysInactive ?? null,
          message_body: e.messageBody ?? null,
        }));
        const { error: eventsError } = await params.supabase
          .from('whatsapp_reactivation_events')
          .insert(rows);
        if (eventsError) {
          console.error('[reactivation] failed to persist events', eventsError);
        }
      }
    }
  }

  return {
    runId,
    runDate,
    dryRun,
    stats,
    events,
    enrolled,
    due,
  };
}
