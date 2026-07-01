/**
 * Persistencia de snapshots por ejecución del scheduler de recordatorios 24h.
 */

import { formatError } from './errors.ts';
import type { ReminderDeliveryStatus, ReminderRow } from './reminderDashboardBuilder.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface BatchSnapshotParams {
  runKind: 'primary' | 'retry';
  schedulerName: string;
  serviceDate: string;
}

export interface BatchSnapshotResult {
  batchRunId: string;
  itemCount: number;
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
    })
    .select('id')
    .single();

  if (runError) throw new Error(formatError(runError));
  const batchRunId = String(run.id);

  if (rows.length === 0) {
    return { batchRunId, itemCount: 0, summary };
  }

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

  return { batchRunId, itemCount: rows.length, summary };
}

export interface HistoryBatchRun {
  id: string;
  runAt: string;
  runKind: 'primary' | 'retry';
  schedulerName: string;
  serviceDate: string;
  summary: Record<string, number>;
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
}

export interface ReminderHistoryResponse {
  runs: HistoryBatchRun[];
  itemsByRun: Record<string, HistoryBatchItem[]>;
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
    .select('id, run_at, run_kind, scheduler_name, service_date, summary, created_at')
    .gte('service_date', params.dateFrom)
    .lte('service_date', params.dateTo)
    .order('run_at', { ascending: false });

  if (runsError) throw new Error(formatError(runsError));

  const mappedRuns: HistoryBatchRun[] = (runs ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    runAt: String(row.run_at),
    runKind: row.run_kind as 'primary' | 'retry',
    schedulerName: String(row.scheduler_name),
    serviceDate: String(row.service_date),
    summary: (row.summary ?? {}) as Record<string, number>,
    createdAt: String(row.created_at),
  }));

  if (mappedRuns.length === 0) {
    return { runs: [], itemsByRun: {} };
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

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) throw new Error(formatError(itemsError));

  const itemsByRun: Record<string, HistoryBatchItem[]> = {};
  for (const row of (items ?? []) as Record<string, unknown>[]) {
    const item = mapHistoryItem(row);
    if (!itemsByRun[item.batchRunId]) itemsByRun[item.batchRunId] = [];
    itemsByRun[item.batchRunId].push(item);
  }

  return { runs: mappedRuns, itemsByRun };
}
