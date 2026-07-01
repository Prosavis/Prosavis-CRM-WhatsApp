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
}

export interface ReminderHistoryResponse {
  runs: HistoryBatchRun[];
  itemsByRun: Record<string, HistoryBatchItem[]>;
}

export const REMINDER_STATUS_LABEL: Record<ReminderDeliveryStatus, string> = {
  pending: 'Pendiente',
  ready: 'Listo',
  missing_phone: 'Sin teléfono',
  missing_professional: 'Sin profesional',
  sent: 'Enviado',
  failed: 'Fallido',
  sent_unverified: 'Sin verificar',
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

export function historyItemToReminderRow(item: HistoryBatchItem): ReminderRow {
  return {
    appointmentId: item.appointmentId,
    recipientType: item.recipientType,
    recipientKey: item.recipientKey,
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
    logStatus: null,
    logCreatedAt: null,
    logErrorMessage: null,
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
