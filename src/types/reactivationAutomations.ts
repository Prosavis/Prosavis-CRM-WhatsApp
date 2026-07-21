export type ReactivationRowStatus =
  | 'due'
  | 'waiting'
  | 'paused_reply'
  | 'disabled'
  | 'opt_out'
  | 'completed'
  | 'stale'
  | 'active_again'
  | 'eligible';

export interface ReactivationStepDef {
  step: number;
  gapDaysFromPrevious: number;
  dayFromEnrollment: number;
  templateName: string;
  extraBodyParams?: string[];
  label: string;
}

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
  status: ReactivationRowStatus;
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
    steps: ReactivationStepDef[];
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
  lastRunEvents: ReactivationHistoryEvent[];
}

export interface ReactivationHistoryRun {
  id: string;
  run_at: string;
  run_kind: string;
  scheduler_name: string;
  run_date: string;
  summary: Record<string, unknown>;
  execution_stats: Record<string, number>;
  dry_run: boolean;
  created_at: string;
}

export interface ReactivationHistoryEvent {
  id: string;
  batch_run_id: string;
  directory_id: string;
  recipient_phone: string | null;
  recipient_name: string | null;
  step_number: number;
  template_name: string;
  outcome: string;
  error_message: string | null;
  wa_message_id: string | null;
  last_appointment_date: string | null;
  days_inactive: number | null;
  message_body: string | null;
  created_at: string;
}

export interface ReactivationHistoryResponse {
  runs: ReactivationHistoryRun[];
  eventsByRun: Record<string, ReactivationHistoryEvent[]>;
}

export const REACTIVATION_STATUS_LABEL: Record<ReactivationRowStatus, string> = {
  due: 'Pendiente de envío',
  waiting: 'En espera',
  paused_reply: 'Pausado (respondió)',
  disabled: 'Desactivado',
  opt_out: 'Opt-out',
  completed: 'Completado',
  stale: 'Caducado',
  active_again: 'Reactivado',
  eligible: 'Elegible (nuevo)',
};

export const REACTIVATION_STATUS_COLOR: Record<
  ReactivationRowStatus,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  due: 'warning',
  waiting: 'default',
  paused_reply: 'info',
  disabled: 'default',
  opt_out: 'error',
  completed: 'success',
  stale: 'default',
  active_again: 'success',
  eligible: 'info',
};

export function formatReactivationDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}
