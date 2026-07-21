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

export const REACTIVATION_OUTCOME_LABEL: Record<string, string> = {
  sent: 'Enviado',
  failed: 'Fallido',
  dry_run: 'Simulación (no envió)',
  skipped_opt_out: 'Omitido (opt-out)',
  skipped_disabled: 'Omitido (desactivado)',
  skipped_missing_phone: 'Omitido (sin teléfono)',
  skipped_paused_reply: 'Omitido (respondió)',
  skipped_not_due: 'Omitido (aún no toca)',
  skipped_blacklisted: 'Omitido (lista negra)',
  skipped_company: 'Omitido (empresa)',
  skipped_active: 'Omitido (activo)',
  skipped_stale: 'Omitido (caducado)',
  skipped_completed: 'Omitido (completado)',
  enrolled: 'Inscrito',
  exited_reactivated: 'Salió (reactivado)',
  exited_completed: 'Salió (completado)',
  exited_opt_out: 'Salió (opt-out)',
};

export const REACTIVATION_OUTCOME_COLOR: Record<
  string,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  sent: 'success',
  failed: 'error',
  dry_run: 'info',
  skipped_opt_out: 'default',
  skipped_disabled: 'default',
  skipped_missing_phone: 'warning',
  skipped_paused_reply: 'info',
  skipped_not_due: 'default',
  skipped_blacklisted: 'default',
  skipped_company: 'default',
  skipped_active: 'default',
  skipped_stale: 'default',
  skipped_completed: 'default',
  enrolled: 'success',
  exited_reactivated: 'success',
  exited_completed: 'success',
  exited_opt_out: 'default',
};

export const REACTIVATION_STATUS_HINT: Record<ReactivationRowStatus, string> = {
  due: 'Tiene un paso pendiente de envío hoy.',
  waiting: 'Inscrito; el siguiente paso aún no toca por la cadencia.',
  paused_reply: 'Respondió después del último contacto; se pausa para atención humana.',
  disabled: 'Reactivaciones desactivadas para este contacto.',
  opt_out: 'Marcó opt-out; no se le envía.',
  completed: 'Completó los 6 pasos de la cadencia.',
  stale: 'Lleva demasiado tiempo inactivo; se sale del programa.',
  active_again: 'Volvió a agendar; sale de la secuencia de reactivación.',
  eligible: 'Cumple criterios para entrar (paso 1). Aún no inscrito.',
};

export function formatReactivationRunKind(kind: string): string {
  if (kind === 'primary') return 'Envío principal (12:00 p. m.)';
  if (kind === 'manual') return 'Envío manual';
  if (kind === 'retry') return 'Reintento automático';
  if (kind === 'dry_run') return 'Simulación (dry-run)';
  return kind;
}
