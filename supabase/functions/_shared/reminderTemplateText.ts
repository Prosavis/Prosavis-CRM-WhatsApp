/**
 * Texto de recordatorio_cita_24h y recordatorio_profesional_24h.
 * Lo usan el envío (send-appointment-reminder) y la vista previa del CRM,
 * para que el ojo muestre exactamente lo que va a salir.
 */

import {
  buildProfessionalReminderAddress,
  buildReminderPaymentText,
  buildReminderPaymentWarning,
  sanitizeWhatsAppTemplateParam,
  type ReminderPaymentInput,
} from './whatsappTemplateText.ts';

const TIMEZONE = 'America/Bogota';

export interface ReminderTemplateInput {
  clientName: string;
  professionalName: string;
  scheduledDate: string;
  address: string;
  durationMinutes: number;
  /** Ausente o 1: la duración se muestra sola, como antes. */
  teamSize?: number;
  totalAmount?: number;
  paymentStatus?: string;
  paidAmount?: number;
  pendingAmount?: number;
  mapsLink?: string;
}

export interface TeamClock {
  teamSize: number;
  wallClockMinutes: number;
  teamDurationMinutes: number;
  memberMinutes: number[];
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${mins} minutos`;
}

/** Jornada de la clienta. Con 2+ auxiliares dice cuántas, nunca la suma. */
export function formatClientDuration(minutes: number, teamSize?: number): string {
  const base = formatDuration(minutes);
  const size = Number(teamSize);
  if (Number.isFinite(size) && size > 1 && base !== '—') {
    return `${base} (${Math.round(size)} auxiliares)`;
  }
  return base;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIMEZONE,
  });
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

export function formatSchedule(isoString: string): string {
  return `${formatDate(isoString)} — ${formatTime(isoString)}`;
}

function paymentInput(data: ReminderTemplateInput): ReminderPaymentInput {
  return {
    totalAmount: data.totalAmount,
    paymentStatus: data.paymentStatus,
    paidAmount: data.paidAmount,
    pendingAmount: data.pendingAmount,
  };
}

export function clientReminderParameterTexts(data: ReminderTemplateInput): string[] {
  const payment = paymentInput(data);
  return [
    sanitizeWhatsAppTemplateParam(data.clientName || 'Cliente'),
    sanitizeWhatsAppTemplateParam(data.professionalName || 'Profesional'),
    sanitizeWhatsAppTemplateParam(formatSchedule(data.scheduledDate)),
    sanitizeWhatsAppTemplateParam(data.address),
    sanitizeWhatsAppTemplateParam(formatClientDuration(data.durationMinutes, data.teamSize)),
    sanitizeWhatsAppTemplateParam(buildReminderPaymentText(payment)),
    sanitizeWhatsAppTemplateParam(buildReminderPaymentWarning(payment)),
  ];
}

export function professionalReminderParameterTexts(data: ReminderTemplateInput): string[] {
  const scheduleText = `${formatDate(data.scheduledDate)} — ${formatTime(data.scheduledDate)}`;
  return [
    sanitizeWhatsAppTemplateParam(data.clientName || 'Cliente'),
    buildProfessionalReminderAddress(data.address, data.mapsLink),
    sanitizeWhatsAppTemplateParam(scheduleText),
    sanitizeWhatsAppTemplateParam(formatDuration(data.durationMinutes)),
  ];
}

export function clientReminderPreview(data: ReminderTemplateInput): string {
  const [name, professional, schedule, address, duration, payment, warning] =
    clientReminderParameterTexts(data);
  return [
    `Hola ${name} 👋`,
    '',
    `🧹 Tu profesional: ${professional}`,
    `📅 Fecha del servicio: ${schedule}`,
    `📍 Dirección: ${address}`,
    `⏰ Duración: ${duration}`,
    `💰 Valor: ${payment}`,
    '',
    warning,
    '',
    'Gracias por confiar en Prosavis.',
    '',
    'Responde PARAR para cancelar mensajes',
  ].join('\n');
}

export function professionalReminderPreview(data: ReminderTemplateInput): string {
  const [client, address, schedule, duration] = professionalReminderParameterTexts(data);
  return [
    '🧹 Recordatorio de servicio mañana',
    '',
    `👤 Cliente: ${client}`,
    `📍 Dirección: ${address}`,
    `🕐 Horario: ${schedule}`,
    `⏱ Duración: ${duration}`,
    '',
    'Gracias por confiar en Prosavis.',
  ].join('\n');
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function numberAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value) || index < 0 || index >= value.length) return null;
  const raw = Number(value[index]);
  return Number.isFinite(raw) ? raw : null;
}

function durationFallback(data: Record<string, unknown>): number {
  const raw = Number(data.duration);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

/**
 * Misma regla que getAppointmentClock en Firebase: la jornada es del primer
 * inicio al último fin; las horas de equipo son la suma.
 */
export function teamClockFromRecord(data: Record<string, unknown>): TeamClock {
  const ids = stringIds(data.assignedTeamMemberIds);
  const fallback = durationFallback(data);
  if (ids.length <= 1) {
    return {
      teamSize: ids.length === 0 ? 0 : 1,
      wallClockMinutes: fallback,
      teamDurationMinutes: fallback,
      memberMinutes: ids.length === 1 ? [fallback] : [],
    };
  }

  const durations = data.assignedTeamMemberDurationsMinutes;
  if (!Array.isArray(durations) || durations.length === 0) {
    return {
      teamSize: ids.length,
      wallClockMinutes: fallback,
      teamDurationMinutes: fallback,
      memberMinutes: ids.map(() => fallback),
    };
  }

  let earliest = Infinity;
  let latest = -Infinity;
  let team = 0;
  let counted = 0;
  const memberMinutes: number[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const raw = numberAt(durations, index);
    if (raw == null || raw <= 0) {
      memberMinutes.push(0);
      continue;
    }
    const minutes = Math.round(raw);
    const offsetRaw = numberAt(data.assignedTeamMemberStartOffsetsMinutes, index);
    const offset = offsetRaw == null ? 0 : Math.round(offsetRaw);
    earliest = Math.min(earliest, offset);
    latest = Math.max(latest, offset + minutes);
    team += minutes;
    counted += 1;
    memberMinutes.push(minutes);
  }

  if (counted === 0 || !Number.isFinite(earliest) || latest <= earliest) {
    return {
      teamSize: ids.length,
      wallClockMinutes: fallback,
      teamDurationMinutes: fallback,
      memberMinutes: ids.map(() => fallback),
    };
  }

  return {
    teamSize: ids.length,
    wallClockMinutes: latest - earliest,
    teamDurationMinutes: team,
    memberMinutes,
  };
}

export function memberDurationMinutes(
  data: Record<string, unknown>,
  memberId: string,
): number {
  const clock = teamClockFromRecord(data);
  const ids = stringIds(data.assignedTeamMemberIds);
  if (ids.length <= 1) return clock.wallClockMinutes;
  const index = ids.indexOf(memberId);
  if (index < 0) return clock.wallClockMinutes;
  const minutes = clock.memberMinutes[index];
  return minutes > 0 ? minutes : clock.wallClockMinutes;
}

export function memberOffsetMinutes(
  data: Record<string, unknown>,
  memberId: string,
): number {
  const ids = stringIds(data.assignedTeamMemberIds);
  if (ids.length <= 1) return 0;
  const index = ids.indexOf(memberId);
  if (index < 0) return 0;
  const raw = numberAt(data.assignedTeamMemberStartOffsetsMinutes, index);
  return raw == null ? 0 : Math.round(raw);
}

/** Vista interna. Null si hay una sola auxiliar. */
export function formatTeamDurationLabel(clock: TeamClock): string | null {
  if (clock.teamSize <= 1) return null;
  const total = formatDuration(clock.teamDurationMinutes);
  if (total === '—') return null;
  const positive = clock.memberMinutes.filter((minutes) => minutes > 0);
  const unique = [...new Set(positive)];
  if (unique.length === 1 && positive.length === clock.teamSize) {
    return `${total} de equipo (${clock.teamSize} auxiliares x ${formatDuration(unique[0])})`;
  }
  return `${total} de equipo (${clock.teamSize} auxiliares)`;
}
