export interface PostServiceAutomationEvent {
  id: string;
  batch_run_id: string;
  appointment_id: string | null;
  directory_id: string | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  service_date: string;
  template_name: string;
  outcome: string;
  error_message: string | null;
  wa_message_id: string | null;
  message_body: string | null;
  created_at: string;
}

export interface PostServiceAutomationRun {
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

export interface PostServiceAutomationsDashboard {
  meta: {
    timezone: 'America/Bogota';
    templateName: 'service_finalizado';
    lastRunAt: string | null;
  };
  summary: {
    scheduled: number;
    pending: number;
    sent: number;
    failed: number;
    dryRun: number;
    skipped: number;
  };
  recentEvents: PostServiceAutomationEvent[];
}

export interface PostServiceHistoryResponse {
  runs: PostServiceAutomationRun[];
  eventsByRun: Record<string, PostServiceAutomationEvent[]>;
}

export interface PostServiceActionResult {
  success: boolean;
  stats?: Record<string, number>;
  event?: PostServiceAutomationEvent | null;
}

export const POST_SERVICE_OUTCOME_LABEL: Record<string, string> = {
  scheduled: 'Programado',
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
  dry_run: 'Simulación',
  skipped: 'Omitido',
  skipped_disabled: 'Omitido (desactivado)',
  skipped_missing_phone: 'Omitido (sin teléfono)',
  skipped_invalid_phone: 'Omitido (número inválido)',
  skipped_missing_appointment: 'Omitido (sin cita)',
  skipped_not_eligible: 'Omitido (no elegible)',
  skipped_already_sent: 'Omitido (ya enviado)',
};

export const POST_SERVICE_OUTCOME_COLOR: Record<
  string,
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  scheduled: 'info',
  pending: 'warning',
  sent: 'success',
  failed: 'error',
  dry_run: 'info',
  skipped: 'default',
  skipped_disabled: 'default',
  skipped_missing_phone: 'warning',
  skipped_invalid_phone: 'error',
  skipped_missing_appointment: 'warning',
  skipped_not_eligible: 'default',
  skipped_already_sent: 'default',
};
