/**
 * Persistencia de snapshots por ejecución del scheduler de recordatorios 24h.
 */

import { formatError } from './errors.ts';
import type { ReminderDeliveryStatus, ReminderRow } from './reminderDashboardBuilder.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type BatchEventOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_already_sent'
  | 'skipped_disabled'
  | 'skipped_missing_phone'
  | 'skipped_missing_professional'
  | 'skipped_max_attempts';

export interface ExecutionStats {
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  skippedDisabled: number;
  skippedMissingPhone: number;
  skippedMissingProfessional: number;
  skippedMaxAttempts: number;
  attempted: number;
}

export interface BatchSnapshotEvent {
  appointmentId: string;
  recipientType: 'client' | 'professional';
  outcome: BatchEventOutcome;
  errorMessage?: string;
  waMessageId?: string;
  attemptNumber?: number;
}

export interface BatchSnapshotParams {
  runKind: 'primary' | 'retry' | 'manual';
  schedulerName: string;
  serviceDate: string;
  executionStats?: ExecutionStats;
  events?: BatchSnapshotEvent[];
}

export interface BatchSnapshotResult {
  batchRunId: string;
  itemCount: number;
  eventCount: number;
  summary: Record<ReminderDeliveryStatus, number>;
}

export async function persistBatchSnapshot(
  supabase: SupabaseClient,
  rows: ReminderRow[],
  params: BatchSnapshotParams,
): Promise<BatchSnapshotResult> {
  const summary = rows.reduce(
    (acc, row) => {
      acc[row.deliveryStatus] = (acc[row.deliveryStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<ReminderDeliveryStatus, number>,
  );

  const { data: run, error: runError } = await supabase
    .from('reminder_batch_runs')
    .insert({
      run_at: new Date().toISOString(),
      run_kind: params.runKind,
      scheduler_name: params.schedulerName,
      service_date: params.serviceDate,
      summary,
      execution_stats: params.executionStats ?? {},
    })
    .select('id')
    .single();

  if (runError) throw new Error(formatError(runError));
  const batchRunId = String(run.id);

  if (rows.length > 0) {
    const items = rows.map((row) => ({
      batch_run_id: batchRunId,
      appointment_id: row.appointmentId,
      recipient_type: row.recipientType,
      recipient_key: row.recipientKey,
      recipient_name: row.recipientName,
      phone: row.phone,
      scheduled_date: row.scheduledDate,
      appointment_status: row.appointmentStatus,
      delivery_status: row.deliveryStatus,
      reminders_enabled: row.remindersEnabled,
      sent_at: row.sentAt,
      template_name: row.templateName,
      wa_message_id: row.waMessageId,
      failure_reason: row.failureReason,
      attempt_count: row.attemptCount,
      last_attempt_at: row.lastAttemptAt,
      message_body: row.messageBody,
      conversation_stable_key: row.conversationStableKey,
      address: row.address,
      professional_name: row.professionalName,
      client_name: row.clientName,
      log_status: row.logStatus,
      log_created_at: row.logCreatedAt,
      log_error_message: row.logErrorMessage,
    }));

    const { error: itemsError } = await supabase.from('reminder_batch_items').insert(items);
    if (itemsError) throw new Error(formatError(itemsError));
  }

  const events = params.events ?? [];
  if (events.length > 0) {
    const eventRows = events.map((event) => ({
      batch_run_id: batchRunId,
      appointment_id: event.appointmentId,
      recipient_type: event.recipientType,
      outcome: event.outcome,
      error_message: event.errorMessage ?? null,
      wa_message_id: event.waMessageId ?? null,
      attempt_number: event.attemptNumber ?? null,
    }));

    const { error: eventsError } = await supabase.from('reminder_batch_events').insert(eventRows);
    if (eventsError) throw new Error(formatError(eventsError));
  }

  return { batchRunId, itemCount: rows.length, eventCount: events.length, summary };
}

export interface HistoryBatchRun {
  id: string;
  runAt: string;
  runKind: 'primary' | 'retry' | 'manual';
  schedulerName: string;
  serviceDate: string;
  summary: Record<string, number>;
  executionStats: ExecutionStats;
  createdAt: string;
}

export interface HistoryBatchItem {
  id: string;
  batchRunId: string;
  appointmentId: string;
  recipientType: 'client' | 'professional';
  recipientKey: string | null;
  recipientName: string | null;
  phone: string | null;
  scheduledDate: string | null;
  appointmentStatus: string | null;
  deliveryStatus: string;
  remindersEnabled: boolean;
  sentAt: string | null;
  templateName: string | null;
  waMessageId: string | null;
  failureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  messageBody: string | null;
  conversationStableKey: string | null;
  address: string | null;
  professionalName: string | null;
  clientName: string | null;
  logStatus: string | null;
  logCreatedAt: string | null;
  logErrorMessage: string | null;
}

export interface HistoryBatchEvent {
  id: string;
  batchRunId: string;
  appointmentId: string;
  recipientType: 'client' | 'professional';
  outcome: BatchEventOutcome;
  errorMessage: string | null;
  waMessageId: string | null;
  attemptNumber: number | null;
}

export interface ReminderHistoryResponse {
  runs: HistoryBatchRun[];
  itemsByRun: Record<string, HistoryBatchItem[]>;
  eventsByRun: Record<string, HistoryBatchEvent[]>;
  deltasByRunId: Record<string, string | null>;
}

function emptyExecutionStats(): ExecutionStats {
  return {
    sent: 0,
    failed: 0,
    skippedAlreadySent: 0,
    skippedDisabled: 0,
    skippedMissingPhone: 0,
    skippedMissingProfessional: 0,
    skippedMaxAttempts: 0,
    attempted: 0,
  };
}

function parseExecutionStats(raw: unknown): ExecutionStats {
  if (!raw || typeof raw !== 'object') return emptyExecutionStats();
  const stats = raw as Record<string, unknown>;
  return {
    sent: Number(stats.sent ?? 0) || 0,
    failed: Number(stats.failed ?? 0) || 0,
    skippedAlreadySent: Number(stats.skippedAlreadySent ?? 0) || 0,
    skippedDisabled: Number(stats.skippedDisabled ?? 0) || 0,
    skippedMissingPhone: Number(stats.skippedMissingPhone ?? 0) || 0,
    skippedMissingProfessional: Number(stats.skippedMissingProfessional ?? 0) || 0,
    skippedMaxAttempts: Number(stats.skippedMaxAttempts ?? 0) || 0,
    attempted: Number(stats.attempted ?? 0) || 0,
  };
}

export function computeRunDelta(
  prev: HistoryBatchRun | undefined,
  curr: HistoryBatchRun,
): string | null {
  if (!prev) return null;

  const prevStats = prev.executionStats;
  const currStats = curr.executionStats;
  const parts: string[] = [];

  const sentDelta = currStats.sent - prevStats.sent;
  if (sentDelta !== 0) {
    parts.push(`${sentDelta > 0 ? '+' : ''}${sentDelta} enviados`);
  }

  const failedDelta = currStats.failed - prevStats.failed;
  if (failedDelta !== 0) {
    parts.push(`${failedDelta > 0 ? '+' : ''}${failedDelta} fallidos`);
  }

  const skippedDelta =
    (currStats.skippedAlreadySent - prevStats.skippedAlreadySent) +
    (currStats.skippedMissingPhone - prevStats.skippedMissingPhone);
  if (skippedDelta !== 0) {
    parts.push(`${skippedDelta > 0 ? '+' : ''}${skippedDelta} omitidos`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

function mapHistoryItem(row: Record<string, unknown>): HistoryBatchItem {
  return {
    id: String(row.id),
    batchRunId: String(row.batch_run_id),
    appointmentId: String(row.appointment_id),
    recipientType: row.recipient_type as 'client' | 'professional',
    recipientKey: row.recipient_key ? String(row.recipient_key) : null,
    recipientName: row.recipient_name ? String(row.recipient_name) : null,
    phone: row.phone ? String(row.phone) : null,
    scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
    appointmentStatus: row.appointment_status ? String(row.appointment_status) : null,
    deliveryStatus: String(row.delivery_status),
    remindersEnabled: Boolean(row.reminders_enabled),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    templateName: row.template_name ? String(row.template_name) : null,
    waMessageId: row.wa_message_id ? String(row.wa_message_id) : null,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    messageBody: row.message_body ? String(row.message_body) : null,
    conversationStableKey: row.conversation_stable_key
      ? String(row.conversation_stable_key)
      : null,
    address: row.address ? String(row.address) : null,
    professionalName: row.professional_name ? String(row.professional_name) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    logStatus: row.log_status ? String(row.log_status) : null,
    logCreatedAt: row.log_created_at ? String(row.log_created_at) : null,
    logErrorMessage: row.log_error_message ? String(row.log_error_message) : null,
  };
}

function mapHistoryEvent(row: Record<string, unknown>): HistoryBatchEvent {
  return {
    id: String(row.id),
    batchRunId: String(row.batch_run_id),
    appointmentId: String(row.appointment_id),
    recipientType: row.recipient_type as 'client' | 'professional',
    outcome: row.outcome as BatchEventOutcome,
    errorMessage: row.error_message ? String(row.error_message) : null,
    waMessageId: row.wa_message_id ? String(row.wa_message_id) : null,
    attemptNumber: row.attempt_number != null ? Number(row.attempt_number) : null,
  };
}

export async function fetchReminderHistory(
  supabase: SupabaseClient,
  params: {
    dateFrom: string;
    dateTo: string;
    recipientType?: 'client' | 'professional';
  },
): Promise<ReminderHistoryResponse> {
  const { data: runs, error: runsError } = await supabase
    .from('reminder_batch_runs')
    .select('id, run_at, run_kind, scheduler_name, service_date, summary, execution_stats, created_at')
    .gte('service_date', params.dateFrom)
    .lte('service_date', params.dateTo)
    .order('run_at', { ascending: false });

  if (runsError) throw new Error(formatError(runsError));

  const mappedRuns: HistoryBatchRun[] = (runs ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    runAt: String(row.run_at),
    runKind: row.run_kind as 'primary' | 'retry' | 'manual',
    schedulerName: String(row.scheduler_name),
    serviceDate: String(row.service_date),
    summary: (row.summary ?? {}) as Record<string, number>,
    executionStats: parseExecutionStats(row.execution_stats),
    createdAt: String(row.created_at),
  }));

  if (mappedRuns.length === 0) {
    return { runs: [], itemsByRun: {}, eventsByRun: {}, deltasByRunId: {} };
  }

  const runIds = mappedRuns.map((r) => r.id);
  let itemsQuery = supabase
    .from('reminder_batch_items')
    .select('*')
    .in('batch_run_id', runIds)
    .order('recipient_name', { ascending: true });

  if (params.recipientType) {
    itemsQuery = itemsQuery.eq('recipient_type', params.recipientType);
  }

  const [itemsResult, eventsResult] = await Promise.all([
    itemsQuery,
    supabase
      .from('reminder_batch_events')
      .select('*')
      .in('batch_run_id', runIds)
      .order('created_at', { ascending: true }),
  ]);

  if (itemsResult.error) throw new Error(formatError(itemsResult.error));
  if (eventsResult.error) throw new Error(formatError(eventsResult.error));

  const itemsByRun: Record<string, HistoryBatchItem[]> = {};
  for (const row of (itemsResult.data ?? []) as Record<string, unknown>[]) {
    const item = mapHistoryItem(row);
    if (!itemsByRun[item.batchRunId]) itemsByRun[item.batchRunId] = [];
    itemsByRun[item.batchRunId].push(item);
  }

  const eventsByRun: Record<string, HistoryBatchEvent[]> = {};
  for (const row of (eventsResult.data ?? []) as Record<string, unknown>[]) {
    const event = mapHistoryEvent(row);
    if (params.recipientType && event.recipientType !== params.recipientType) continue;
    if (!eventsByRun[event.batchRunId]) eventsByRun[event.batchRunId] = [];
    eventsByRun[event.batchRunId].push(event);
  }

  const runsByServiceDate = new Map<string, HistoryBatchRun[]>();
  for (const run of [...mappedRuns].sort((a, b) => a.runAt.localeCompare(b.runAt))) {
    const list = runsByServiceDate.get(run.serviceDate) ?? [];
    list.push(run);
    runsByServiceDate.set(run.serviceDate, list);
  }

  const deltasByRunId: Record<string, string | null> = {};
  for (const serviceRuns of runsByServiceDate.values()) {
    for (let i = 0; i < serviceRuns.length; i += 1) {
      const curr = serviceRuns[i];
      const prev = i > 0 ? serviceRuns[i - 1] : undefined;
      deltasByRunId[curr.id] = computeRunDelta(prev, curr);
    }
  }

  return { runs: mappedRuns, itemsByRun, eventsByRun, deltasByRunId };
}
