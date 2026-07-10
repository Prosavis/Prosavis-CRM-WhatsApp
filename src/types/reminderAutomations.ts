export type ReminderDeliveryStatus =
  | 'pending'
  | 'ready'
  | 'missing_phone'
  | 'missing_professional'
  | 'sent'
  | 'failed'
  | 'sent_unverified'
  | 'skipped'
  | 'not_attempted'
  | 'disabled';

export type ReminderRecipientType = 'client' | 'professional';

export interface ReminderRow {
  appointmentId: string;
  recipientType: ReminderRecipientType;
  recipientKey: string | null;
  /** UID del co-asignado específico (solo `recipientType: 'professional'`);
   * desambigua filas cuando una cita tiene varios profesionales. */
  recipientMemberId: string | null;
  recipientName: string;
  phone: string | null;
  phoneMasked: string | null;
  scheduledDate: string | null;
  appointmentStatus: string;
  deliveryStatus: ReminderDeliveryStatus;
  remindersEnabled: boolean;
  sentAt: string | null;
  templateName: string;
  waMessageId: string | null;
  logStatus: string | null;
  logCreatedAt: string | null;
  logErrorMessage: string | null;
  messageBody: string | null;
  conversationStableKey: string | null;
  address: string | null;
  professionalName: string | null;
  clientName: string | null;
  failureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
}

export interface ReminderAutomationsDashboard {
  meta: {
    timezone: 'America/Bogota';
    nextSchedulerRunAt: string;
    lastSchedulerRunAt: string;
    lastBatchRunAt: string;
    upcomingServiceDate: string;
    lastRunServiceDate: string;
    beforeNextSchedulerRun: boolean;
  };
  clients: { upcoming: ReminderRow[]; lastRun: ReminderRow[] };
  professionals: { upcoming: ReminderRow[]; lastRun: ReminderRow[] };
  summary: Record<ReminderDeliveryStatus, number>;
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

export type BatchEventOutcome =
  | 'sent'
  | 'failed'
  | 'skipped_already_sent'
  | 'skipped_disabled'
  | 'skipped_missing_phone'
  | 'skipped_missing_professional'
  | 'skipped_max_attempts';

export interface HistoryBatchEvent {
  id: string;
  batchRunId: string;
  appointmentId: string;
  recipientType: ReminderRecipientType;
  outcome: BatchEventOutcome;
  errorMessage: string | null;
  waMessageId: string | null;
  attemptNumber: number | null;
}

export interface HistoryBatchItem {
  id: string;
  batchRunId: string;
  appointmentId: string;
  recipientType: ReminderRecipientType;
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

export interface ReminderHistoryResponse {
  runs: HistoryBatchRun[];
  itemsByRun: Record<string, HistoryBatchItem[]>;
  eventsByRun: Record<string, HistoryBatchEvent[]>;
  deltasByRunId: Record<string, string | null>;
}

export const BATCH_EVENT_OUTCOME_LABEL: Record<BatchEventOutcome, string> = {
  sent: 'Enviado',
  failed: 'Fallido',
  skipped_already_sent: 'Ya tenía recordatorio',
  skipped_disabled: 'Recordatorios apagados',
  skipped_missing_phone: 'Sin teléfono',
  skipped_missing_professional: 'Sin cleaner asignado',
  skipped_max_attempts: 'Límite de intentos',
};

export const BATCH_EVENT_OUTCOME_COLOR: Record<
  BatchEventOutcome,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  sent: 'success',
  failed: 'error',
  skipped_already_sent: 'info',
  skipped_disabled: 'default',
  skipped_missing_phone: 'warning',
  skipped_missing_professional: 'warning',
  skipped_max_attempts: 'warning',
};

export function formatExecutionStatsNarrative(stats: ExecutionStats): string {
  const parts: string[] = [];
  if (stats.sent > 0) parts.push(`${stats.sent} enviados`);
  if (stats.failed > 0) parts.push(`${stats.failed} fallidos`);
  const skipped =
    stats.skippedAlreadySent +
    stats.skippedDisabled +
    stats.skippedMissingPhone +
    stats.skippedMissingProfessional +
    stats.skippedMaxAttempts;
  if (skipped > 0) parts.push(`${skipped} omitidos`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin acciones registradas';
}

export const REMINDER_STATUS_LABEL: Record<ReminderDeliveryStatus, string> = {
  pending: 'Pendiente',
  ready: 'Listo',
  missing_phone: 'Sin teléfono',
  missing_professional: 'Sin profesional',
  sent: 'Enviado',
  failed: 'Fallido',
  sent_unverified: 'Enviado (sin log)',
  skipped: 'Omitido',
  not_attempted: 'Sin intento',
  disabled: 'Desactivado',
};

export const REMINDER_STATUS_COLOR: Record<
  ReminderDeliveryStatus,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  pending: 'default',
  ready: 'info',
  missing_phone: 'warning',
  missing_professional: 'warning',
  sent: 'success',
  failed: 'error',
  sent_unverified: 'warning',
  skipped: 'default',
  not_attempted: 'warning',
  disabled: 'default',
};

const NO_SEND_DELIVERY_STATUSES = new Set<ReminderDeliveryStatus>([
  'missing_phone',
  'missing_professional',
  'failed',
  'not_attempted',
  'skipped',
]);

export function formatReminderSentDisplay(row: ReminderRow): string {
  if (NO_SEND_DELIVERY_STATUSES.has(row.deliveryStatus)) {
    return row.failureReason ?? '—';
  }
  if (row.deliveryStatus !== 'sent' && row.deliveryStatus !== 'sent_unverified') {
    return '—';
  }
  const iso = row.sentAt ?? row.logCreatedAt;
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

export function reminderStatusTooltip(row: ReminderRow): string | undefined {
  if (row.failureReason) return row.failureReason;
  if (
    row.deliveryStatus === 'sent' &&
    ['CANCELLED', 'CANCELED', 'REJECTED'].includes(row.appointmentStatus.toUpperCase())
  ) {
    return 'Cita cancelada; recordatorio enviado antes de cancelar';
  }
  return undefined;
}

export function historyItemToReminderRow(item: HistoryBatchItem): ReminderRow {
  return {
    appointmentId: item.appointmentId,
    recipientType: item.recipientType,
    recipientKey: item.recipientKey,
    // `recipient_key` de una fila "professional" ya es el UID del co-asignado
    // (ver resolveRecipientKey), así que no requiere columna nueva en Supabase.
    recipientMemberId: item.recipientType === 'professional' ? item.recipientKey : null,
    recipientName: item.recipientName ?? '—',
    phone: item.phone,
    phoneMasked: item.phone,
    scheduledDate: item.scheduledDate,
    appointmentStatus: item.appointmentStatus ?? 'UNKNOWN',
    deliveryStatus: item.deliveryStatus as ReminderDeliveryStatus,
    remindersEnabled: item.remindersEnabled,
    sentAt: item.sentAt,
    templateName: item.templateName ?? '',
    waMessageId: item.waMessageId,
    logStatus: item.logStatus,
    logCreatedAt: item.logCreatedAt,
    logErrorMessage: item.logErrorMessage,
    messageBody: item.messageBody,
    conversationStableKey: item.conversationStableKey,
    address: item.address,
    professionalName: item.professionalName,
    clientName: item.clientName,
    failureReason: item.failureReason,
    attemptCount: item.attemptCount,
    lastAttemptAt: item.lastAttemptAt,
  };
}
