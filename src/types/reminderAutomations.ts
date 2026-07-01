export type ReminderDeliveryStatus =
  | 'pending'
  | 'ready'
  | 'missing_phone'
  | 'missing_professional'
  | 'sent'
  | 'failed'
  | 'sent_unverified'
  | 'skipped';

export type ReminderRecipientType = 'client' | 'professional';

export interface ReminderRow {
  appointmentId: string;
  recipientType: ReminderRecipientType;
  recipientName: string;
  phone: string | null;
  phoneMasked: string | null;
  scheduledDate: string | null;
  appointmentStatus: string;
  deliveryStatus: ReminderDeliveryStatus;
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

export const REMINDER_STATUS_LABEL: Record<ReminderDeliveryStatus, string> = {
  pending: 'Pendiente',
  ready: 'Listo',
  missing_phone: 'Sin teléfono',
  missing_professional: 'Sin profesional',
  sent: 'Enviado',
  failed: 'Fallido',
  sent_unverified: 'Sin verificar',
  skipped: 'Omitido',
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
};
