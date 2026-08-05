/**
 * Formato puro del bloque de contexto AI del inbox (sin Deno/Firebase).
 * Testeable con Vitest.
 */

import type { ConversationHistoryMeta } from './conversationHistory.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';
import { formatPricingCatalogBlock } from './pricingCatalog.ts';

const UPCOMING_APPTS = 5;
const PAST_APPTS = 5;
const BOGOTA_TZ = 'America/Bogota';
const MAX_PROPERTIES_IN_SUMMARY = 8;

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
  paymentStatus?: string | null;
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
  conversationTags: string[];
  directory: InboxAiDirectory | null;
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
  let pattern: PropertyPattern = 'none';
  let patternLabel = 'Sin direcciones de apoyo registradas.';
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
  if (a.totalAmount != null) {
    parts.push(`valor: COP ${String(a.totalAmount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);
  }
  if (a.paymentMethod) parts.push(`método: ${a.paymentMethod}`);
  if (a.wompiReference) parts.push(`referencia Wompi: ${a.wompiReference}`);
  return `- ${parts.join(' | ')}`;
}

function formatPropertySummaryBlock(summary: InboxAiPropertySummary): string[] {
  const lines: string[] = [];
  lines.push('=== Propiedades / ubicaciones de apoyos ===');
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

/** Formatea el bloque de contexto CRM (puro, testeable). */
export function formatInboxAiContextBlock(params: {
  phone: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  directory: InboxAiDirectory | null;
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
  const lines: string[] = [];

  lines.push('=== Momento actual ===');
  lines.push(`Fecha/hora actual (Colombia): ${formatBogotaDateTime(nowIso)} (${nowIso})`);
  lines.push('Usa esta fecha como referencia temporal al interpretar "hoy", "mañana", "ayer" y el historial.');
  lines.push(
    'Política operativa: si el cliente indica que a cierta hora no habrá nadie / se va la persona, ' +
      'propón llegada ~1 h antes para recepción segura del personal (nunca esa hora exacta).',
  );

  lines.push('');
  lines.push('=== Canal / ventana WhatsApp ===');
  lines.push(`Estado: ${params.sessionWindow.status}`);
  lines.push(`Último mensaje inbound: ${params.sessionWindow.lastInboundAt ?? 'desconocido'}`);
  lines.push(`Expira: ${params.sessionWindow.expiresAt ?? 'desconocido'}`);
  lines.push(`Requiere plantilla: ${params.sessionWindow.requiresTemplate ? 'sí' : 'no'}`);

  lines.push('');
  lines.push('=== Perfil directorio ===');
  if (params.directory) {
    const d = params.directory;
    lines.push(`Nombre: ${d.fullName ?? '—'}`);
    lines.push(`Teléfono: ${params.phone}`);
    if (d.email) lines.push(`Email: ${d.email}`);
    if (d.city) lines.push(`Ciudad: ${d.city}`);
    if (d.address) lines.push(`Dirección de contacto: ${d.address}`);
    if (d.preferredServiceAddress) {
      lines.push(`Dirección preferida de servicio: ${d.preferredServiceAddress}`);
    }
    lines.push(`Cliente recurrente (CRM): ${d.isReturningClient ? 'sí' : 'no'}`);
    if (d.paymentStatus) {
      lines.push(`Estado de pago (directorio): ${d.paymentStatus}`);
    }
    if (d.appUserId) lines.push(`app_user_id: ${d.appUserId}`);
    if (d.notesSummary) lines.push(`Notas: ${d.notesSummary}`);
  } else {
    lines.push(`Sin entrada en crm_directory. Teléfono: ${params.phone}`);
  }

  const totalAppts =
    typeof params.appointmentCount === 'number'
      ? params.appointmentCount
      : params.appointments.length;
  const pastCount = params.appointments.filter(
    (a) => new Date(a.scheduledDate).getTime() < now,
  ).length;
  const upcomingCount = params.appointments.filter(
    (a) => new Date(a.scheduledDate).getTime() >= now,
  ).length;

  lines.push('');
  lines.push('=== Resumen de agendamientos / apoyos ===');
  lines.push(`Total apoyos/citas encontrados (ventana CRM): ${totalAppts}`);
  lines.push(`En listado contextual: ${upcomingCount} próximos, ${pastCount} pasados recientes`);

  const propertySummary =
    params.propertySummary ??
    buildPropertyLocationSummary({
      appointments: params.allAppointmentsForProperties ?? params.appointments,
      preferredDirectoryAddress:
        params.directory?.preferredServiceAddress ?? params.directory?.address ?? null,
    });

  lines.push('');
  lines.push(...formatPropertySummaryBlock(propertySummary));

  lines.push('');
  lines.push('=== Tags ===');
  lines.push(
    `Conversación: ${
      params.conversationTags.length ? params.conversationTags.join(', ') : '(ninguno)'
    }`,
  );
  const dirTags = params.directory?.tags ?? [];
  lines.push(`Directorio: ${dirTags.length ? dirTags.join(', ') : '(ninguno)'}`);

  lines.push('');
  lines.push(formatPricingCatalogBlock());

  const upcoming = params.appointments
    .filter((a) => new Date(a.scheduledDate).getTime() >= now)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, UPCOMING_APPTS);
  const past = params.appointments
    .filter((a) => new Date(a.scheduledDate).getTime() < now)
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
    .slice(0, PAST_APPTS);

  lines.push('');
  lines.push('=== Citas / apoyos (Firestore, fuente de verdad) ===');
  lines.push(
    'Cada apoyo incluye fecha/hora (Colombia), estado, servicio, cliente, auxiliar, dirección y pago cuando existen.',
  );
  if (!upcoming.length && !past.length) {
    lines.push('Sin citas/apoyos encontrados para este contacto.');
  } else {
    if (upcoming.length) {
      lines.push('Próximos:');
      for (const a of upcoming) lines.push(formatAppointmentLine(a));
    }
    if (past.length) {
      lines.push('Pasados recientes:');
      for (const a of past) lines.push(formatAppointmentLine(a));
    }
  }

  lines.push('');
  lines.push('=== Historial WhatsApp ===');
  lines.push(
    'Los mensajes incluyen fecha/hora cuando está disponible. Relaciónalos con la fecha actual de arriba.',
  );
  if (params.historyMeta.truncated) {
    lines.push(
      `(Ventana truncada: ${params.historyMeta.loaded} turns; se priorizan mensajes recientes` +
        `${params.historyMeta.oldestAt ? `; desde ${formatBogotaDateTime(params.historyMeta.oldestAt)}` : ''}` +
        `${params.historyMeta.newestAt ? `; hasta ${formatBogotaDateTime(params.historyMeta.newestAt)}` : ''})`,
    );
  } else {
    lines.push(
      `(${params.historyMeta.loaded} turns` +
        `${params.historyMeta.oldestAt ? `; desde ${formatBogotaDateTime(params.historyMeta.oldestAt)}` : ''}` +
        `${params.historyMeta.newestAt ? `; hasta ${formatBogotaDateTime(params.historyMeta.newestAt)}` : ''})`,
    );
  }
  lines.push(params.transcript);

  return lines.join('\n');
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

/**
 * Sustituye afirmaciones de pago inferidas por datos reales de la cita próxima
 * más cercana. Sin datos autoritativos elimina estado y monto inventados.
 */
export function groundBookingPayment<
  T extends {
    paymentStatus?: unknown;
    paymentAmount?: unknown;
  },
>(
  bookingContext: T,
  ctx: Pick<InboxAiContextSlice, 'appointments'>,
  nowIso = new Date().toISOString(),
): GroundedBookingPayment<T> {
  const now = new Date(nowIso).getTime();
  const closest = ctx.appointments
    .filter((appointment) => isRelevantUpcomingAppointment(appointment, now))
    .sort(
      (a, b) =>
        new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
    )
    .find(
      (appointment) =>
        normalizeAppointmentPaymentStatus(appointment.paymentStatus) != null ||
        (appointment.totalAmount != null && Number.isFinite(appointment.totalAmount)),
    );

  if (!closest) {
    return {
      ...bookingContext,
      paymentStatus: 'none',
      paymentAmount: null,
    };
  }

  return {
    ...bookingContext,
    paymentStatus:
      normalizeAppointmentPaymentStatus(closest.paymentStatus) ?? 'none',
    paymentAmount:
      closest.totalAmount != null && Number.isFinite(closest.totalAmount)
        ? closest.totalAmount
        : null,
  };
}

export const INBOX_AI_SYSTEM_INSTRUCTION =
  'Eres un agente de ventas de Prosavis (limpieza residencial y empresas en Colombia). ' +
  'Responde en español, cordial y concreto. ' +
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
  'Cuando la ventana Meta esté cerrada, propone una plantilla aprobada en vez de texto libre. ' +
  'Si hay link de pago, menciónalo al final. ' +
  'Adapta el tono a los tags (p. ej. Empresas vs residencial). ' +
  'Si hay tags sensibles internos (Bloqueado, Decline, lista negra), no empujes venta agresiva y no reveles esos tags al cliente en el texto. ' +
  'Si hay citas próximas, tenlas en cuenta al responder (no ofrezcas re-agendar ignorándolas).';
