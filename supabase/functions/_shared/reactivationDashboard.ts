/**
 * Dashboard + historial + preferencias del motor de reactivaciones.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  REACTIVATION_STALE_DAYS,
  type SegmentedClient,
} from './clientSegments.ts';
import {
  REACTIVATION_SEQUENCE,
  REACTIVATION_STEPS,
  computeNextSendAt,
  getStepDef,
  isPausedForHumanReply,
  nextSchedulerRunAt,
  nextStepNumber,
  resolveDueStep,
} from './reactivationCadence.ts';
import { buildReactivationUniverse } from './reactivationRunner.ts';

export interface ReactivationDashboardRow {
  directoryId: string;
  recipientName: string;
  phone: string | null;
  lastAppointmentDate: string | null;
  daysInactive: number | null;
  sequenceStep: number;
  dueStep: number | null;
  nextStepLabel: string | null;
  templateName: string | null;
  lastContactAt: string | null;
  lastResponseAt: string | null;
  /** Primer cron 12:00 CO en que toca el siguiente paso; null si no aplica. */
  nextSendAt: string | null;
  status:
    | 'due'
    | 'waiting'
    | 'paused_reply'
    | 'disabled'
    | 'opt_out'
    | 'completed'
    | 'stale'
    | 'active_again'
    | 'eligible';
  reactivationsEnabled: boolean;
  isCompany: boolean;
  isRecurring: boolean;
  messagePreview: string | null;
}

export interface ReactivationDashboard {
  meta: {
    timezone: 'America/Bogota';
    nextSchedulerRunAt: string;
    lastRunAt: string | null;
    steps: typeof REACTIVATION_STEPS;
  };
  summary: {
    enrolled: number;
    dueToday: number;
    pausedReply: number;
    optOut: number;
    completed: number;
    eligibleNew: number;
    sentLast7d: number;
    reactivatedApprox: number;
  };
  enrolled: ReactivationDashboardRow[];
  due: ReactivationDashboardRow[];
  lastRunEvents: Array<Record<string, unknown>>;
}

function mapClientRow(
  client: SegmentedClient,
  disabledIds: Set<string>,
  dueStepOverride?: number | null,
): ReactivationDashboardRow {
  const enabled = !disabledIds.has(client.id);
  const inSequence = client.activeSequence === REACTIVATION_SEQUENCE && client.sequenceStep > 0;
  const paused = isPausedForHumanReply({
    lastContactAt: client.lastContactAt,
    lastResponseAt: client.lastResponseAt,
  });

  let status: ReactivationDashboardRow['status'] = 'waiting';
  let dueStep: number | null = dueStepOverride ?? null;

  if (client.optOut) status = 'opt_out';
  else if (!enabled) status = 'disabled';
  else if (client.isActive && inSequence) status = 'active_again';
  else if (client.sequenceStep >= 6) status = 'completed';
  else if (client.daysInactive != null && client.daysInactive > REACTIVATION_STALE_DAYS) {
    status = 'stale';
  } else if (paused) status = 'paused_reply';
  else if (dueStep) status = dueStep === 1 && !inSequence ? 'eligible' : 'due';
  else if (!inSequence) status = 'eligible';

  if (dueStep == null && inSequence) {
    dueStep = resolveDueStep({
      sequenceStep: client.sequenceStep,
      lastContactAt: client.lastContactAt,
    });
    if (dueStep && status === 'waiting') status = 'due';
  }

  const next = dueStep ?? nextStepNumber(client.sequenceStep);
  const stepDef = next ? getStepDef(next) : null;
  const nextSendAt = computeNextSendAt({
    sequenceStep: client.sequenceStep,
    lastContactAt: client.lastContactAt,
    status,
  });

  return {
    directoryId: client.id,
    recipientName: client.name,
    phone: client.phone,
    lastAppointmentDate: client.lastAppointmentDate,
    daysInactive: client.daysInactive,
    sequenceStep: client.sequenceStep,
    dueStep,
    nextStepLabel: stepDef?.label ?? null,
    templateName: stepDef?.templateName ?? null,
    lastContactAt: client.lastContactAt,
    lastResponseAt: client.lastResponseAt,
    nextSendAt,
    status,
    reactivationsEnabled: enabled,
    isCompany: client.isCompany,
    isRecurring: client.isRecurring,
    messagePreview: null,
  };
}

export async function buildReactivationDashboard(
  supabase: SupabaseClient,
): Promise<ReactivationDashboard> {
  const { clients, enrolled, due, disabledIds } = await buildReactivationUniverse(supabase);

  const dueIds = new Set(due.map((d) => d.id));
  const dueById = new Map(due.map((d) => [d.id, d.dueStep]));

  const enrolledRows = enrolled.map((c) =>
    mapClientRow(c, disabledIds, dueById.get(c.id) ?? null),
  );
  const dueRows = due.map((c) => mapClientRow(c, disabledIds, c.dueStep));

  const eligibleNew = due.filter((d) => d.dueStep === 1 && d.sequenceStep < 1).length;
  const pausedReply = enrolled.filter((c) =>
    isPausedForHumanReply({
      lastContactAt: c.lastContactAt,
      lastResponseAt: c.lastResponseAt,
    }),
  ).length;
  const optOut = clients.filter((c) => c.optOut && c.isInactive).length;
  const completed = enrolled.filter((c) => c.sequenceStep >= 6).length;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: sentLast7d } = await supabase
    .from('whatsapp_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_type', 'REACTIVATION')
    .in('status', ['sent', 'delivered', 'read'])
    .gte('created_at', weekAgo);

  const { data: lastRun } = await supabase
    .from('whatsapp_reactivation_runs')
    .select('id,run_at,execution_stats,summary,dry_run')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastRunEvents: Array<Record<string, unknown>> = [];
  if (lastRun?.id) {
    const { data: events } = await supabase
      .from('whatsapp_reactivation_events')
      .select('*')
      .eq('batch_run_id', lastRun.id)
      .order('created_at', { ascending: false })
      .limit(100);
    lastRunEvents = (events ?? []) as Array<Record<string, unknown>>;
  }

  // Aprox. reactivados: salidas exited_reactivated en últimos 30 días
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: reactivatedApprox } = await supabase
    .from('whatsapp_reactivation_events')
    .select('id', { count: 'exact', head: true })
    .eq('outcome', 'exited_reactivated')
    .gte('created_at', monthAgo);

  return {
    meta: {
      timezone: 'America/Bogota',
      nextSchedulerRunAt: nextSchedulerRunAt(),
      lastRunAt: lastRun?.run_at ?? null,
      steps: REACTIVATION_STEPS,
    },
    summary: {
      enrolled: enrolled.length,
      dueToday: dueIds.size,
      pausedReply,
      optOut,
      completed,
      eligibleNew,
      sentLast7d: sentLast7d ?? 0,
      reactivatedApprox: reactivatedApprox ?? 0,
    },
    enrolled: enrolledRows,
    due: dueRows,
    lastRunEvents,
  };
}

export async function fetchReactivationHistory(
  supabase: SupabaseClient,
  params: { dateFrom: string; dateTo: string },
) {
  const { data: runs, error } = await supabase
    .from('whatsapp_reactivation_runs')
    .select('*')
    .gte('run_date', params.dateFrom)
    .lte('run_date', params.dateTo)
    .order('run_at', { ascending: false })
    .limit(60);

  if (error) throw error;

  const runIds = (runs ?? []).map((r) => r.id as string);
  const eventsByRun: Record<string, Array<Record<string, unknown>>> = {};

  if (runIds.length > 0) {
    const { data: events, error: eventsError } = await supabase
      .from('whatsapp_reactivation_events')
      .select('*')
      .in('batch_run_id', runIds)
      .order('created_at', { ascending: false });
    if (eventsError) throw eventsError;
    for (const event of events ?? []) {
      const key = String(event.batch_run_id);
      eventsByRun[key] ??= [];
      eventsByRun[key].push(event as Record<string, unknown>);
    }
  }

  return { runs: runs ?? [], eventsByRun };
}

export async function setReactivationPreference(
  supabase: SupabaseClient,
  params: {
    directoryId: string;
    reactivationsEnabled: boolean;
    updatedBy: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('whatsapp_reactivation_preferences').upsert(
    {
      directory_id: params.directoryId,
      reactivations_enabled: params.reactivationsEnabled,
      updated_by: params.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'directory_id' },
  );
  if (error) throw error;
}
