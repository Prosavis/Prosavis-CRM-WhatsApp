/**
 * Formato puro del bloque de contexto AI del inbox (sin Deno/Firebase).
 * Testeable con Vitest.
 */

import {
  DEFAULT_TRANSCRIPT_CHAR_BUDGET,
  type ConversationHistoryMeta,
} from './conversationHistory.ts';
import type {
  InboxAiConversationContext,
  InboxAiOfficialAnswers,
} from './inboxAiKnowledge.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';
import { formatPricingCatalogBlock } from './pricingCatalog.ts';

const UPCOMING_APPTS = 5;
const PAST_APPTS = 5;
const BOGOTA_TZ = 'America/Bogota';
const MAX_PROPERTIES_IN_SUMMARY = 8;
const SECTION_TRUNCATION_MARKER = '[Sección truncada por presupuesto]';

export const INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET = 78_000;

/**
 * Incluye heading y contenido de cada sección. La suma (77.000) deja margen
 * para separadores sin desplazar el transcript reciente de 60.000 caracteres.
 */
export const SECTION_CHAR_BUDGETS = Object.freeze({
  '=== Momento actual ===': 700,
  '=== Canal / ventana WhatsApp ===': 350,
  '=== Perfil directorio ===': 1_200,
  '=== Contexto operativo de conversación ===': 1_000,
  '=== Clasificación CRM ===': 900,
  '=== Resumen de agendamientos / apoyos ===': 350,
  '=== Propiedades / ubicaciones de apoyos ===': 1_400,
  '=== Tags ===': 600,
  '=== Catálogo oficial de precios (fuente de verdad) ===': 2_500,
  '=== Respuestas oficiales de la casa ===': 4_500,
  '=== Citas / apoyos (Firestore, fuente de verdad) ===': 3_000,
  '=== Historial WhatsApp ===': 60_500,
} as const);

export type InboxAiSectionHeading = keyof typeof SECTION_CHAR_BUDGETS;

export interface InboxAiDirectory {
  id?: string;
  fullName?: string | null;
  email?: string | null;
  address?: string | null;
  /** Dirección preferida de servicio en directorio (si existe). */
  preferredServiceAddress?: string | null;
  city?: string | null;
  tags?: string[];
  appUserId?: string | null;
  notesSummary?: string | null;
  source?: string | null;
  serviceId?: string | null;
  classification?: string | null;
  paymentStatus?: string | null;
  optOut?: boolean;
  isReturningClient: boolean;
}

export interface InboxAiAppointment {
  id: string;
  scheduledDate: string;
  status?: string | null;
  serviceName?: string | null;
  address?: string | null;
  /** Referencia de ubicación (apto, torre, etc.). */
  addressReference?: string | null;
  duration?: number | null;
  clientName?: string | null;
  /** Auxiliar(es) / profesional asignado. */
  providerName?: string | null;
  paymentStatus?: string | null;
  totalAmount?: number | null;
  paymentMethod?: string | null;
  wompiReference?: string | null;
}

export function mapInboxAiAppointmentPayment(
  data: Record<string, unknown>,
): Pick<
  InboxAiAppointment,
  'paymentStatus' | 'totalAmount' | 'paymentMethod' | 'wompiReference'
> {
  const text = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  };
  const number = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    paymentStatus: text(data.paymentStatus),
    totalAmount: number(data.totalAmount),
    paymentMethod: text(data.paymentMethod),
    wompiReference: text(data.wompiReference),
  };
}

export type PropertyPattern = 'none' | 'single' | 'multiple' | 'unknown';

export interface InboxAiPropertyEntry {
  address: string;
  reference?: string | null;
  appointmentCount: number;
  firstDate?: string;
  lastDate?: string;
}

export interface InboxAiPropertySummary {
  uniquePropertyCount: number;
  pattern: PropertyPattern;
  /** Texto corto para el agente: misma propiedad vs varias. */
  patternLabel: string;
  properties: InboxAiPropertyEntry[];
  preferredDirectoryAddress?: string | null;
  appointmentsWithoutAddress: number;
}

export interface InboxAiContextSlice {
  phone: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  conversationTags?: string[];
  conversationContext?: InboxAiConversationContext;
  directory: InboxAiDirectory | null;
  officialAnswers?: InboxAiOfficialAnswers;
  appointments: InboxAiAppointment[];
  /** Total de citas encontradas en la ventana de lookback (no solo las listadas). */
  appointmentCount?: number;
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow: MetaSessionWindow;
}

/** Fecha/hora legible en zona Colombia (America/Bogota). */
export function formatBogotaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

/** Solo fecha en Bogotá. */
export function formatBogotaDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}

/** Normaliza dirección para agrupar la misma propiedad con variantes menores. */
export function normalizeAddressKey(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null;
  const normalized = address
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[#.,;:/\\()-]/g, ' ')
    .replace(/\b(apto|apartamento|ap|torre|casa|interior|int|local|oficina|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length >= 5 ? normalized : null;
}

function displayAddress(a: InboxAiAppointment): string | null {
  const line = a.address?.trim();
  if (!line) return null;
  const ref = a.addressReference?.trim();
  return ref ? `${line} (${ref})` : line;
}

/**
 * Analiza todas las citas/apoyos para detectar si son en la misma propiedad
 * o en ubicaciones distintas. Usar el set completo (no solo el listado corto).
 */
export function buildPropertyLocationSummary(params: {
  appointments: InboxAiAppointment[];
  preferredDirectoryAddress?: string | null;
}): InboxAiPropertySummary {
  const preferred = params.preferredDirectoryAddress?.trim() || null;
  let withoutAddress = 0;
  const groups = new Map<
    string,
    {
      address: string;
      reference: string | null;
      count: number;
      firstDate?: string;
      lastDate?: string;
    }
  >();

  for (const appt of params.appointments) {
    const key = normalizeAddressKey(appt.address);
    if (!key) {
      withoutAddress += 1;
      continue;
    }
    const display = displayAddress(appt) ?? appt.address!.trim();
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, {
        address: display,
        reference: appt.addressReference?.trim() || null,
        count: 1,
        firstDate: appt.scheduledDate,
        lastDate: appt.scheduledDate,
      });
      continue;
    }
    prev.count += 1;
    if (!prev.firstDate || appt.scheduledDate < prev.firstDate) {
      prev.firstDate = appt.scheduledDate;
    }
    if (!prev.lastDate || appt.scheduledDate > prev.lastDate) {
      prev.lastDate = appt.scheduledDate;
      // Preferir la forma más reciente (puede incluir referencia más completa).
      prev.address = display;
      prev.reference = appt.addressReference?.trim() || prev.reference;
    }
  }

  const properties = [...groups.values()]
    .sort((a, b) => b.count - a.count || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    .slice(0, MAX_PROPERTIES_IN_SUMMARY)
    .map((g) => ({
      address: g.address,
      reference: g.reference,
      appointmentCount: g.count,
      firstDate: g.firstDate,
      lastDate: g.lastDate,
    }));

  const uniquePropertyCount = groups.size;
  let pattern: PropertyPattern;
  let patternLabel: string;
  if (uniquePropertyCount === 0 && withoutAddress === 0) {
    pattern = 'none';
    patternLabel = 'Sin apoyos/citas con dirección en la ventana.';
  } else if (uniquePropertyCount === 0 && withoutAddress > 0) {
    pattern = 'unknown';
    patternLabel = `${withoutAddress} apoyo(s) sin dirección registrada (ubicación desconocida).`;
  } else if (uniquePropertyCount === 1) {
    pattern = 'single';
    patternLabel =
      `Siempre en la misma propiedad (${properties[0]?.address ?? '—'}; ${properties[0]?.appointmentCount ?? 0} apoyo(s)).`;
  } else {
    pattern = 'multiple';
    patternLabel =
      `Ha usado ${uniquePropertyCount} propiedades/ubicaciones distintas en sus apoyos.`;
  }

  return {
    uniquePropertyCount,
    pattern,
    patternLabel,
    properties,
    preferredDirectoryAddress: preferred,
    appointmentsWithoutAddress: withoutAddress,
  };
}

function formatAppointmentLine(a: InboxAiAppointment): string {
  const when = formatBogotaDateTime(a.scheduledDate);
  const place = displayAddress(a) ?? 'sin dirección';
  const parts = [
    when,
    a.status ?? '—',
    a.serviceName ?? 'servicio',
    `cliente: ${a.clientName ?? '—'}`,
    `auxiliar: ${a.providerName ?? 'sin asignar'}`,
    `dirección: ${place}`,
  ];
  if (a.duration != null) parts.push(`${a.duration}h`);
  if (a.paymentStatus) parts.push(`pago: ${a.paymentStatus}`);
  if (
    a.totalAmount != null &&
    Number.isFinite(a.totalAmount) &&
    a.totalAmount > 0
  ) {
    parts.push(`valor: COP ${String(a.totalAmount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);
  }
  if (a.paymentMethod) parts.push(`método: ${a.paymentMethod}`);
  if (a.wompiReference) parts.push(`referencia Wompi: ${a.wompiReference}`);
  return `- ${parts.join(' | ')}`;
}

function formatPropertySummaryBlock(summary: InboxAiPropertySummary): string[] {
  const lines: string[] = [];
  lines.push(summary.patternLabel);
  lines.push(`Propiedades únicas: ${summary.uniquePropertyCount}`);
  if (summary.appointmentsWithoutAddress > 0) {
    lines.push(`Apoyos sin dirección: ${summary.appointmentsWithoutAddress}`);
  }
  if (summary.preferredDirectoryAddress) {
    lines.push(`Dirección preferida (directorio): ${summary.preferredDirectoryAddress}`);
  }
  if (summary.properties.length) {
    lines.push('Historial por propiedad (conteo de apoyos + rango de fechas):');
    for (const p of summary.properties) {
      const first = p.firstDate ? formatBogotaDate(p.firstDate) : '—';
      const last = p.lastDate ? formatBogotaDate(p.lastDate) : '—';
      lines.push(
        `- ${p.address} | ${p.appointmentCount} apoyo(s) | desde ${first} hasta ${last}`,
      );
    }
  }
  lines.push(
    'Al agendar o confirmar, pregunta si el apoyo es en la misma propiedad habitual o en otra ubicación.',
  );
  return lines;
}

export function getSectionCharBudget(heading: string): number {
  if (!Object.prototype.hasOwnProperty.call(SECTION_CHAR_BUDGETS, heading)) {
    throw new Error(`Heading sin presupuesto de caracteres: ${heading}`);
  }
  return SECTION_CHAR_BUDGETS[heading as InboxAiSectionHeading];
}

function clipSection(section: string, heading: InboxAiSectionHeading): string {
  const budget = getSectionCharBudget(heading);
  if (section.length <= budget) return section;
  const suffix = `\n${SECTION_TRUNCATION_MARKER}`;
  return `${section.slice(0, Math.max(heading.length, budget - suffix.length)).trimEnd()}${suffix}`;
}

function buildSection(heading: InboxAiSectionHeading, lines: string[]): string {
  return clipSection([heading, ...lines].join('\n'), heading);
}

function clipTranscriptToLatest(transcript: string): string {
  if (transcript.length <= DEFAULT_TRANSCRIPT_CHAR_BUDGET) return transcript;
  const marker = '[Historial recortado desde lo más antiguo]';
  const remaining = DEFAULT_TRANSCRIPT_CHAR_BUDGET - marker.length - 1;
  return `${marker}\n${transcript.slice(-Math.max(0, remaining))}`;
}

function formatOfficialAnswers(answers?: InboxAiOfficialAnswers): string[] {
  const lines = [
    'Reutiliza la redacción oficial de la casa antes de improvisar una respuesta nueva.',
  ];
  if (!answers?.snippets.length && !answers?.faqs.length) {
    lines.push('Sin respuestas oficiales activas disponibles.');
    return lines;
  }
  if (answers.snippets.length) {
    lines.push('Snippets fijados:');
    for (const snippet of answers.snippets) {
      lines.push(`- ${snippet.shortcut} | ${snippet.label}: ${snippet.body}`);
    }
  }
  if (answers.faqs.length) {
    lines.push('Preguntas frecuentes activas:');
    for (const faq of answers.faqs) {
      const metadata = [
        faq.category ? `categoría: ${faq.category}` : null,
        faq.keywords.length ? `keywords: ${faq.keywords.join(', ')}` : null,
      ].filter(Boolean);
      lines.push(
        `- ${faq.question}: ${faq.answer}${metadata.length ? ` (${metadata.join(' | ')})` : ''}`,
      );
    }
  }
  return lines;
}

/** Formatea el bloque de contexto CRM (puro, testeable). */
export function formatInboxAiContextBlock(params: {
  phone: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  conversationTags?: string[];
  conversationContext?: InboxAiConversationContext;
  directory: InboxAiDirectory | null;
  officialAnswers?: InboxAiOfficialAnswers;
  appointments: InboxAiAppointment[];
  appointmentCount?: number;
  /** Citas completas de lookback para resumen de propiedades (si no, usa appointments). */
  allAppointmentsForProperties?: InboxAiAppointment[];
  propertySummary?: InboxAiPropertySummary | null;
  sessionWindow: MetaSessionWindow;
  nowIso?: string;
}): string {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const now = new Date(nowIso).getTime();
  const conversationTags =
    params.conversationContext?.tags ?? params.conversationTags ?? [];
  const directory = params.directory;
  const conversation = params.conversationContext;
  const sections: string[] = [];

  sections.push(buildSection('=== Momento actual ===', [
    `Fecha/hora actual (Colombia): ${formatBogotaDateTime(nowIso)} (${nowIso})`,
    'Usa esta fecha como referencia temporal al interpretar "hoy", "mañana", "ayer" y el historial.',
    'Política operativa: si el cliente indica que a cierta hora no habrá nadie / se va la persona, ' +
      'propón llegada ~1 h antes para recepción segura del personal (nunca esa hora exacta).',
  ]));

  sections.push(buildSection('=== Canal / ventana WhatsApp ===', [
    `Estado: ${params.sessionWindow.status}`,
    `Último mensaje inbound: ${params.sessionWindow.lastInboundAt ?? 'desconocido'}`,
    `Expira: ${params.sessionWindow.expiresAt ?? 'desconocido'}`,
    `Requiere plantilla: ${params.sessionWindow.requiresTemplate ? 'sí' : 'no'}`,
  ]));

  const directoryLines: string[] = [];
  if (directory) {
    directoryLines.push(`Nombre: ${directory.fullName ?? '—'}`);
    directoryLines.push(`Teléfono: ${params.phone}`);
    if (directory.email) directoryLines.push(`Email: ${directory.email}`);
    if (directory.city) directoryLines.push(`Ciudad: ${directory.city}`);
    if (directory.address) directoryLines.push(`Dirección de contacto: ${directory.address}`);
    if (directory.preferredServiceAddress) {
      directoryLines.push(
        `Dirección preferida de servicio: ${directory.preferredServiceAddress}`,
      );
    }
    directoryLines.push(
      `Cliente recurrente (CRM): ${directory.isReturningClient ? 'sí' : 'no'}`,
    );
    if (directory.paymentStatus) {
      directoryLines.push(`Estado de pago (directorio): ${directory.paymentStatus}`);
    }
    if (directory.appUserId) directoryLines.push(`app_user_id: ${directory.appUserId}`);
    if (directory.notesSummary) directoryLines.push(`Notas: ${directory.notesSummary}`);
  } else {
    directoryLines.push(`Sin entrada en crm_directory. Teléfono: ${params.phone}`);
  }
  sections.push(buildSection('=== Perfil directorio ===', directoryLines));

  sections.push(buildSection('=== Contexto operativo de conversación ===', [
    `Notas administrativas: ${conversation?.adminNotes ?? '—'}`,
    `Asignado a: ${conversation?.assignedTo ?? 'sin asignar'}`,
    `Última intención: ${conversation?.lastIntent ?? 'desconocida'}`,
    `Automatización inbound deshabilitada: ${
      conversation?.automatedInboundDisabled ? 'sí' : 'no'
    }`,
  ]));

  sections.push(buildSection('=== Clasificación CRM ===', [
    `Fuente: ${directory?.source ?? '—'}`,
    `Servicio: ${directory?.serviceId ?? '—'}`,
    `Clasificación: ${directory?.classification ?? '—'}`,
    `Estado de pago: ${directory?.paymentStatus ?? '—'}`,
    `Opt-out: ${directory?.optOut ? 'sí' : 'no'}`,
  ]));

  const totalAppointments =
    typeof params.appointmentCount === 'number'
      ? params.appointmentCount
      : params.appointments.length;
  const pastCount = params.appointments.filter(
    (appointment) => new Date(appointment.scheduledDate).getTime() < now,
  ).length;
  const upcomingCount = params.appointments.filter(
    (appointment) => new Date(appointment.scheduledDate).getTime() >= now,
  ).length;
  sections.push(buildSection('=== Resumen de agendamientos / apoyos ===', [
    `Total apoyos/citas encontrados (ventana CRM): ${totalAppointments}`,
    `En listado contextual: ${upcomingCount} próximos, ${pastCount} pasados recientes`,
  ]));

  const propertySummary =
    params.propertySummary ??
    buildPropertyLocationSummary({
      appointments: params.allAppointmentsForProperties ?? params.appointments,
      preferredDirectoryAddress:
        directory?.preferredServiceAddress ?? directory?.address ?? null,
    });
  const propertyLines = formatPropertySummaryBlock(propertySummary);
  sections.push(buildSection(
    '=== Propiedades / ubicaciones de apoyos ===',
    propertyLines,
  ));

  const directoryTags = directory?.tags ?? [];
  sections.push(buildSection('=== Tags ===', [
    `Conversación: ${conversationTags.length ? conversationTags.join(', ') : '(ninguno)'}`,
    `Directorio: ${directoryTags.length ? directoryTags.join(', ') : '(ninguno)'}`,
  ]));

  const pricingLines = formatPricingCatalogBlock().split('\n');
  pricingLines.shift();
  sections.push(buildSection(
    '=== Catálogo oficial de precios (fuente de verdad) ===',
    pricingLines,
  ));

  sections.push(buildSection(
    '=== Respuestas oficiales de la casa ===',
    formatOfficialAnswers(params.officialAnswers),
  ));

  const upcoming = params.appointments
    .filter((appointment) => new Date(appointment.scheduledDate).getTime() >= now)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))
    .slice(0, UPCOMING_APPTS);
  const past = params.appointments
    .filter((appointment) => new Date(appointment.scheduledDate).getTime() < now)
    .sort((left, right) => right.scheduledDate.localeCompare(left.scheduledDate))
    .slice(0, PAST_APPTS);
  const appointmentLines = [
    'Cada apoyo incluye fecha/hora (Colombia), estado, servicio, cliente, auxiliar, dirección y pago cuando existen.',
  ];
  if (!upcoming.length && !past.length) {
    appointmentLines.push('Sin citas/apoyos encontrados para este contacto.');
  } else {
    if (upcoming.length) {
      appointmentLines.push('Próximos:');
      appointmentLines.push(...upcoming.map(formatAppointmentLine));
    }
    if (past.length) {
      appointmentLines.push('Pasados recientes:');
      appointmentLines.push(...past.map(formatAppointmentLine));
    }
  }
  sections.push(buildSection(
    '=== Citas / apoyos (Firestore, fuente de verdad) ===',
    appointmentLines,
  ));

  const historyLines = [
    'Los mensajes incluyen fecha/hora cuando está disponible. Relaciónalos con la fecha actual de arriba.',
  ];
  if (params.historyMeta.truncated) {
    historyLines.push(
      `(Ventana truncada: ${params.historyMeta.loaded} turns; se priorizan mensajes recientes` +
        `${params.historyMeta.oldestAt ? `; desde ${formatBogotaDateTime(params.historyMeta.oldestAt)}` : ''}` +
        `${params.historyMeta.newestAt ? `; hasta ${formatBogotaDateTime(params.historyMeta.newestAt)}` : ''})`,
    );
  } else {
    historyLines.push(
      `(${params.historyMeta.loaded} turns` +
        `${params.historyMeta.oldestAt ? `; desde ${formatBogotaDateTime(params.historyMeta.oldestAt)}` : ''}` +
        `${params.historyMeta.newestAt ? `; hasta ${formatBogotaDateTime(params.historyMeta.newestAt)}` : ''})`,
    );
  }
  historyLines.push(clipTranscriptToLatest(params.transcript));
  sections.push(buildSection('=== Historial WhatsApp ===', historyLines));

  const block = sections.join('\n\n');
  if (block.length > INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET) {
    throw new Error(
      `Inbox AI context exceeded ${INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET} characters.`,
    );
  }
  return block;
}

/** Mezcla datos CRM reales sobre clientInfo del booking JSON inferido. */
export function groundBookingClientInfo<
  T extends {
    clientInfo?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      city?: string | null;
      isReturningClient?: boolean;
      userId?: string | null;
    };
  },
>(
  bookingContext: T,
  ctx: Pick<InboxAiContextSlice, 'phone' | 'directory' | 'propertySummary'>,
): T {
  const info = { ...(bookingContext.clientInfo ?? {}) };
  const d = ctx.directory;
  if (d?.fullName) info.name = d.fullName;
  info.phone = ctx.phone;
  if (d?.email) info.email = d.email;

  // Preferir dirección de la propiedad habitual / preferida sobre alucinaciones.
  const singleProperty =
    ctx.propertySummary?.pattern === 'single'
      ? ctx.propertySummary.properties[0]?.address
      : null;
  const groundedAddress =
    d?.preferredServiceAddress ??
    singleProperty ??
    d?.address ??
    null;
  if (groundedAddress) info.address = groundedAddress;

  if (d?.city) info.city = d.city;
  info.isReturningClient = Boolean(d?.isReturningClient);
  if (d?.appUserId) info.userId = d.appUserId;
  return { ...bookingContext, clientInfo: info };
}

type GroundedBookingPayment<T> = Omit<T, 'paymentStatus' | 'paymentAmount'> & {
  paymentStatus: 'APPROVED' | 'PENDING' | 'none';
  paymentAmount: number | null;
};

function normalizeAppointmentPaymentStatus(
  value: string | null | undefined,
): 'APPROVED' | 'PENDING' | null {
  const status = value?.trim().toUpperCase();
  if (!status) return null;
  if (['APPROVED', 'PAID', 'PAGO_ACEPTADO', 'SUCCESSFUL'].includes(status)) {
    return 'APPROVED';
  }
  if (['PENDING', 'PAGO_PENDIENTE', 'PAGO_EN_PROCESO'].includes(status)) {
    return 'PENDING';
  }
  return null;
}

function isRelevantUpcomingAppointment(
  appointment: InboxAiAppointment,
  now: number,
): boolean {
  const scheduledAt = new Date(appointment.scheduledDate).getTime();
  if (!Number.isFinite(scheduledAt) || scheduledAt < now) return false;
  const status = appointment.status?.trim().toUpperCase();
  return !status || !['CANCELLED', 'CANCELED', 'REJECTED'].includes(status);
}

function bookingTargetString(
  collectedData: Record<string, unknown> | null,
  field: 'date' | 'time' | 'address',
): string | null {
  const value = collectedData?.[field];
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function appointmentBogotaDateTime(
  scheduledDate: string,
): { date: string; time: string } | null {
  const parsed = new Date(scheduledDate);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

function appointmentMatchesBookingTarget(
  appointment: InboxAiAppointment,
  target: { date: string | null; time: string | null; address: string | null },
): boolean {
  const scheduled = appointmentBogotaDateTime(appointment.scheduledDate);
  if (target.date && (!scheduled || scheduled.date !== target.date)) return false;
  if (target.time && (!scheduled || scheduled.time !== target.time)) return false;
  if (target.address) {
    const targetAddress = normalizeAddressKey(target.address);
    const appointmentAddress = normalizeAddressKey(appointment.address);
    if (!targetAddress || !appointmentAddress || targetAddress !== appointmentAddress) {
      return false;
    }
  }
  return true;
}

function hasAuthoritativeAppointmentPayment(
  appointment: InboxAiAppointment,
): boolean {
  return (
    normalizeAppointmentPaymentStatus(appointment.paymentStatus) != null ||
    (appointment.totalAmount != null &&
      Number.isFinite(appointment.totalAmount) &&
      appointment.totalAmount > 0)
  );
}

/**
 * Sustituye afirmaciones de pago inferidas por la cita que corresponde a la
 * reserva conversada. Sin objetivo explícito usa la cita próxima más cercana.
 */
export function groundBookingPayment<
  T extends {
    collectedData?: unknown;
    paymentStatus?: unknown;
    paymentAmount?: unknown;
  },
>(
  bookingContext: T,
  ctx: Pick<InboxAiContextSlice, 'appointments'>,
  nowIso = new Date().toISOString(),
): GroundedBookingPayment<T> {
  const now = new Date(nowIso).getTime();
  const candidates = ctx.appointments
    .filter((appointment) => isRelevantUpcomingAppointment(appointment, now))
    .sort(
      (a, b) =>
        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
    );
  const collectedData =
    typeof bookingContext.collectedData === 'object' &&
    bookingContext.collectedData !== null &&
    !Array.isArray(bookingContext.collectedData)
      ? bookingContext.collectedData as Record<string, unknown>
      : null;
  const target = {
    date: bookingTargetString(collectedData, 'date'),
    time: bookingTargetString(collectedData, 'time'),
    address: bookingTargetString(collectedData, 'address'),
  };
  const hasExplicitTarget = Boolean(target.date || target.time || target.address);
  const appointment = hasExplicitTarget
    ? candidates
        .find((candidate) => appointmentMatchesBookingTarget(candidate, target))
    : candidates[0];

  if (!appointment || !hasAuthoritativeAppointmentPayment(appointment)) {
    return {
      ...bookingContext,
      paymentStatus: 'none',
      paymentAmount: null,
    };
  }

  return {
    ...bookingContext,
    paymentStatus:
      normalizeAppointmentPaymentStatus(appointment.paymentStatus) ?? 'none',
    paymentAmount:
      appointment.totalAmount != null &&
      Number.isFinite(appointment.totalAmount) &&
      appointment.totalAmount > 0
        ? appointment.totalAmount
        : null,
  };
}

export const INBOX_AI_SYSTEM_INSTRUCTION =
  'Eres un agente de ventas de Prosavis (limpieza residencial y empresas en Colombia). ' +
  'Responde en español, cordial y concreto. ' +
  'Prefiere las respuestas oficiales de la casa y reutiliza su redacción antes de improvisar; ' +
  'si ninguna respuesta oficial aplica, responde con el resto del contexto verificado. ' +
  'Usa el perfil CRM, tags, apoyos/citas Firestore y sus direcciones como fuente de verdad; no inventes citas, tags, precios, direcciones ni datos del cliente. ' +
  'Ten en cuenta la fecha/hora actual (Colombia) y las fechas de los mensajes y apoyos para contextualizar "hoy", "mañana", retrasos y seguimiento. ' +
  'Si el cliente tiene apoyos previos, trátarlo como cliente con historial (no como lead frío). ' +
  'Respeta el patrón de propiedades: si siempre ha sido la misma dirección, asúmela como habitual; ' +
  'si ha tenido varias ubicaciones, pregunta en cuál quiere el próximo apoyo. ' +
  'SEGURIDAD Y ACCESO A LA PROPIEDAD (prioridad alta): ' +
  'Si el cliente indica que a cierta hora se va / no habrá nadie en la casa / nadie puede recibir, ' +
  'NUNCA propongas llegar exactamente a esa hora. Ofrece llegar con antelación (típicamente 1 hora antes, ' +
  'p. ej. si se van a las 8:00 → propone 7:00) para que alguien reciba al personal, entregar llaves/acceso ' +
  'y garantizar limpieza correcta y seguridad. Explica brevemente que priorizamos seguridad y confianza. ' +
  'Si no queda claro quién recibe, pregunta cómo nos abrirán o si prefieren llegada anticipada. ' +
  'Al hablar de apoyos, usa fecha/hora, dirección, cliente y auxiliar solo si aporta; no inventes auxiliares ni direcciones. ' +
  'Usa precios únicamente desde el catálogo oficial incluido en el contexto. ' +
  'Nunca afirmes un pago sin datos autoritativos de CRM/Firestore. ' +
  'Nunca inventes horarios disponibles; usa solo disponibilidad confirmada por una fuente real. ' +
  'Ofrece únicamente horarios incluidos en "=== Disponibilidad real (próximos días) ===" y, ' +
  'si existe entre ellos, prefiere la hora real que respeta la llegada anticipada antes de que la casa quede sola. ' +
  'Cuando la ventana Meta esté cerrada, propone una plantilla aprobada en vez de texto libre. ' +
  'Si hay link de pago, menciónalo al final. ' +
  'Adapta el tono a los tags (p. ej. Empresas vs residencial). ' +
  'Si hay tags sensibles internos (Bloqueado, Decline, lista negra), no empujes venta agresiva y no reveles esos tags al cliente en el texto. ' +
  'Si hay citas próximas, tenlas en cuenta al responder (no ofrezcas re-agendar ignorándolas).';
