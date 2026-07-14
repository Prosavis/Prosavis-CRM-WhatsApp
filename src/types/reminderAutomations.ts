export type ReminderDeliveryStatus =
  | 'pending'
  | 'ready'
  | 'missing_phone'
  | 'missing_professional'
  | 'sent'
  | 'in_transit'
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
  /** Entregados (delivered/read tras reconciliación). */
  sent: number;
  failed: number;
  /** Aceptados por Meta sin confirmación de entrega al teléfono. */
  inTransit: number;
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

/** Outcome efectivo de entrega (reconciliado con el log vivo de Meta). */
export type BatchEventDisplayOutcome =
  | BatchEventOutcome
  | 'delivered'
  | 'in_transit';

export interface HistoryBatchEvent {
  id: string;
  batchRunId: string;
  appointmentId: string;
  recipientType: ReminderRecipientType;
  /** Resultado del intento al cerrar el batch (congelado). */
  outcome: BatchEventOutcome;
  /** Estado de entrega efectivo (log vivo de Meta). */
  displayOutcome: BatchEventDisplayOutcome;
  errorMessage: string | null;
  waMessageId: string | null;
  attemptNumber: number | null;
  recipientName: string | null;
  clientName: string | null;
  professionalName: string | null;
  logStatus: string | null;
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

export const BATCH_EVENT_OUTCOME_LABEL: Record<BatchEventDisplayOutcome, string> = {
  sent: 'Enviado',
  delivered: 'Entregado',
  in_transit: 'En tránsito',
  failed: 'Fallido',
  skipped_already_sent: 'Ya tenía recordatorio',
  skipped_disabled: 'Recordatorios apagados',
  skipped_missing_phone: 'Sin teléfono',
  skipped_missing_professional: 'Sin cleaner asignado',
  skipped_max_attempts: 'Límite de intentos',
};

export const BATCH_EVENT_OUTCOME_COLOR: Record<
  BatchEventDisplayOutcome,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  sent: 'success',
  delivered: 'success',
  in_transit: 'warning',
  failed: 'error',
  skipped_already_sent: 'info',
  skipped_disabled: 'default',
  skipped_missing_phone: 'warning',
  skipped_missing_professional: 'warning',
  skipped_max_attempts: 'warning',
};

export function formatExecutionStatsNarrative(stats: ExecutionStats): string {
  const parts: string[] = [];
  if (stats.sent > 0) parts.push(`${stats.sent} entregados`);
  if (stats.inTransit > 0) parts.push(`${stats.inTransit} en tránsito`);
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
  sent: 'Entregado',
  in_transit: 'En tránsito',
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
  in_transit: 'warning',
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
  if (
    row.deliveryStatus !== 'sent' &&
    row.deliveryStatus !== 'sent_unverified' &&
    row.deliveryStatus !== 'in_transit'
  ) {
    return '—';
  }
  if (row.deliveryStatus === 'in_transit') {
    const iso = row.sentAt ?? row.logCreatedAt;
    const when = iso
      ? new Date(iso).toLocaleString('es-CO', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Bogota',
        })
      : null;
    return when ? `En tránsito · ${when}` : 'En tránsito (pendiente de entrega)';
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
  if (row.deliveryStatus === 'in_transit') {
    return 'Meta aceptó el mensaje; aún no hay confirmación de entrega al teléfono';
  }
  if (row.deliveryStatus === 'sent' && row.logStatus === 'read') {
    return 'Entregado y leído';
  }
  if (row.deliveryStatus === 'sent' && row.logStatus === 'delivered') {
    return 'Entregado al teléfono';
  }
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
