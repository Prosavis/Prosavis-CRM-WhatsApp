import type { ConversationHistoryMeta } from '../../supabase/functions/_shared/conversationHistory';
import type {
  InboxAiAppointment,
  InboxAiPropertySummary,
} from '../../supabase/functions/_shared/inboxAiContextFormat';
import { formatBogotaDateTime } from '../../supabase/functions/_shared/inboxAiContextFormat';
import type { MetaSessionWindow } from '../../supabase/functions/_shared/metaSessionWindow';

export interface InboxAiUsedContextSnapshot {
  historyMeta?: ConversationHistoryMeta | null;
  conversationTags?: string[] | null;
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow?: MetaSessionWindow | null;
  appointments?: InboxAiAppointment[] | null;
  appointmentsLoadFailed?: boolean;
}

const CONTEXT_UPCOMING_LIMIT = 5;
const CONTEXT_PAST_LIMIT = 5;

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PENDING_RESCHEDULE: 'Reagendar',
  CONFIRMED: 'Confirmada',
  EN_ROUTE: 'En camino',
  IN_ROUTE: 'En camino',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELED: 'Cancelada',
  REJECTED: 'Rechazada',
};

export function hasInboxAiUsedContext(
  snapshot: InboxAiUsedContextSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return Boolean(
    snapshot.historyMeta ||
      (snapshot.conversationTags && snapshot.conversationTags.length > 0) ||
      snapshot.propertySummary ||
      snapshot.sessionWindow ||
      (snapshot.appointments && snapshot.appointments.length > 0) ||
      snapshot.appointmentsLoadFailed,
  );
}

export function groupAppointmentsForUsedContext(
  appointments: InboxAiAppointment[] | null | undefined,
  now = new Date(),
): { upcoming: InboxAiAppointment[]; past: InboxAiAppointment[] } {
  const list = appointments ?? [];
  const nowMs = now.getTime();
  const upcoming = list
    .filter((appointment) => new Date(appointment.scheduledDate).getTime() >= nowMs)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))
    .slice(0, CONTEXT_UPCOMING_LIMIT);
  const past = list
    .filter((appointment) => new Date(appointment.scheduledDate).getTime() < nowMs)
    .sort((left, right) => right.scheduledDate.localeCompare(left.scheduledDate))
    .slice(0, CONTEXT_PAST_LIMIT);
  return { upcoming, past };
}

export function formatAppointmentStatusLabel(status: string | null | undefined): string {
  const key = status?.trim().toUpperCase() ?? '';
  if (!key) return '—';
  return APPOINTMENT_STATUS_LABEL[key] ?? status!.trim();
}

export function formatUsedContextAppointmentLine(appointment: InboxAiAppointment): string {
  const when = formatBogotaDateTime(appointment.scheduledDate);
  const who = appointment.providerName?.trim() || 'sin asignar';
  const status = formatAppointmentStatusLabel(appointment.status);
  const duration =
    appointment.duration != null && Number.isFinite(appointment.duration)
      ? `${appointment.duration} min`
      : null;
  return [when, who, status, duration].filter(Boolean).join(' · ');
}

export function formatAppointmentsContextSummary(
  appointments: InboxAiAppointment[] | null | undefined,
  appointmentsLoadFailed?: boolean,
  now = new Date(),
): { upcomingLines: string[]; pastLines: string[]; emptyLabel: string } {
  if (appointmentsLoadFailed) {
    return {
      upcomingLines: [],
      pastLines: [],
      emptyLabel: 'No se pudieron cargar las citas',
    };
  }
  const { upcoming, past } = groupAppointmentsForUsedContext(appointments, now);
  return {
    upcomingLines: upcoming.map(formatUsedContextAppointmentLine),
    pastLines: past.map(formatUsedContextAppointmentLine),
    emptyLabel: 'Sin citas recientes',
  };
}

export function formatHistoryMetaSummary(
  meta: ConversationHistoryMeta | null | undefined,
): string {
  if (!meta) return 'Sin historial cargado';
  const parts = [`${meta.loaded} mensajes`];
  if (meta.truncated) parts.push('ventana truncada');
  return parts.join(' · ');
}

export function formatPropertySummaryLabel(
  summary: InboxAiPropertySummary | null | undefined,
): string {
  if (!summary) return 'Sin resumen de propiedad';
  if (summary.patternLabel?.trim()) return summary.patternLabel.trim();
  if (summary.pattern === 'single' && summary.properties[0]?.address) {
    return `Misma propiedad: ${summary.properties[0].address}`;
  }
  if (summary.pattern === 'multiple') {
    return `${summary.uniquePropertyCount} propiedades distintas`;
  }
  if (summary.pattern === 'none') return 'Sin direcciones en citas';
  return 'Propiedad desconocida';
}

export function formatSessionWindowLabel(
  window: MetaSessionWindow | null | undefined,
): string {
  if (!window) return 'Ventana de sesión desconocida';
  if (window.status === 'open') {
    const expires = window.expiresAt
      ? new Date(window.expiresAt).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        })
      : null;
    return expires ? `Abierta · expira ${expires}` : 'Abierta';
  }
  if (window.status === 'closed') return 'Cerrada · requiere plantilla';
  return 'Desconocida · requiere plantilla';
}
