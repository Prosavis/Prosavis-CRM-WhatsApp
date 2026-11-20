// Decisiones del modo automática. No envía ni crea citas.

export const AUTO_BATCH = 6;
export const AUTO_SILENCE_FLOOR_SECONDS = 60;

export const AUTO_RIDER =
  'CIERRE: en este turno busca agendar. Si falta un dato, pide solo ese. ' +
  'Si dicen que no, despídete en una frase y no insistas. No confirmes un pago. ' +
  'No digas que la cita quedó agendada: el sistema la crea aparte.';

export const AUTO_GOODBYE = 'Entendido. Quedamos atentos cuando lo necesite.';
export const AUTO_HANDOFF = 'Una compañera sigue este caso con usted.';

const OFFICIAL_HOURS = [240, 360, 480] as const;
type OfficialMinutes = (typeof OFFICIAL_HOURS)[number];

export type InboundKind = 'no' | 'escalar' | 'seguir';

export function classifyInbound(text: string): { kind: InboundKind; motivo: string } {
  const folded = text.trim();
  if (/no,?\s*gracias|no muchas gracias|por ahora no|no me interesa/i.test(folded)) {
    return { kind: 'no', motivo: 'no quiere' };
  }
  if (/m[aá]rcame|ll[aá]mame|\bllamada\b/i.test(folded)) {
    return { kind: 'escalar', motivo: 'pidió una llamada' };
  }
  if (/queja|reclamo/i.test(folded)) {
    return { kind: 'escalar', motivo: 'queja' };
  }
  if (/empleo|hoja de vida|vacante|trabajo con ustedes/i.test(folded)) {
    return { kind: 'escalar', motivo: 'empleo' };
  }
  if (/comprobante|ya pag[uú]e|ya les pag/i.test(folded)) {
    return { kind: 'escalar', motivo: 'comprobante' };
  }
  if (/reagendar|mover la cita|cancelar la cita|cambiar la cita|cambiar el horario/i.test(folded)) {
    return { kind: 'escalar', motivo: 'mover la cita' };
  }
  return { kind: 'seguir', motivo: '' };
}

export function claimsBooked(text: string): boolean {
  return /qued[oó] agendad|cita qued[oó] confirmad|ya qued[oó] la (cita|visita)/i.test(text);
}

const PAYMENT_CONFIRMED = /ya (les |nos )?pag[oó]|pago (recibido|confirmado|verificado)|recibimos (el |su )?pago/i;

/** El borrador ya revisado se envía. Se retiene si afirma una cita o un pago. */
export function storedDraftSend(text: string): 'enviar' | 'retener' {
  const draft = text.trim();
  if (!draft || claimsBooked(draft) || PAYMENT_CONFIRMED.test(draft)) return 'retener';
  return 'enviar';
}

export const AUTO_REWRITES = 1;

export type ReviewStep = 'enviar' | 'reescribir' | 'elevar' | 'saltar';

type ReviewVerdict = 'aprobar' | 'devolver' | 'riesgo' | 'otro';

function reviewVerdict(value: string): ReviewVerdict {
  if (value === 'aprobar' || value === 'devolver' || value === 'riesgo') return value;
  return 'otro';
}

/** Un «devolver» se reescribe. El riesgo y una cita inventada se elevan. */
export function reviewDisposition(input: {
  verdict: string;
  feedback: string;
  draft: string;
  attempt: number;
  maxRewrites: number;
}): ReviewStep {
  if (input.feedback === 'El revisor no respondió' && !claimsBooked(input.draft)) return 'saltar';
  if (claimsBooked(input.draft)) return 'elevar';
  const verdict = reviewVerdict(input.verdict);
  switch (verdict) {
    case 'aprobar':
      return 'enviar';
    case 'devolver':
      return input.attempt <= input.maxRewrites ? 'reescribir' : 'elevar';
    case 'riesgo':
    case 'otro':
      return 'elevar';
    default: {
      const unexpected: never = verdict;
      return unexpected;
    }
  }
}

export function noticeName(nombre: string): string {
  const cleaned = nombre.replace(/\d{8,}/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'Sin nombre';
}

export function staffNoticeCopy(nombre: string, motivo: string): { title: string; body: string } {
  return {
    title: 'Sofía no pudo cerrar',
    body: `${noticeName(nombre)}. ${motivo.trim() || 'No pudo resolverlo.'}`,
  };
}

export interface CreatePayload {
  scheduledDate: string;
  duration: OfficialMinutes;
  wantsKit: boolean;
}

export type BookingPick =
  | { kind: 'crear'; payload: CreatePayload }
  | { kind: 'mover' }
  | { kind: 'ninguna' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function officialMinutes(value: unknown): OfficialMinutes | null {
  return OFFICIAL_HOURS.find((hours) => hours === value) ?? null;
}

export function pickBooking(actions: unknown): BookingPick {
  if (!Array.isArray(actions)) return { kind: 'ninguna' };
  if (actions.some((action) => isRecord(action) && action.type === 'reschedule_appointment')) {
    return { kind: 'mover' };
  }
  for (const action of actions) {
    if (!isRecord(action) || action.type !== 'create_appointment' || !isRecord(action.payload)) continue;
    const duration = officialMinutes(action.payload.duration);
    const scheduledDate = typeof action.payload.scheduledDate === 'string'
      ? action.payload.scheduledDate.trim()
      : '';
    if (!duration || !scheduledDate.includes('T') || Number.isNaN(new Date(scheduledDate).getTime())) continue;
    return {
      kind: 'crear',
      payload: {
        scheduledDate,
        duration,
        wantsKit: action.payload.wantsKit === true,
      },
    };
  }
  return { kind: 'ninguna' };
}

export function appointmentConfirmation(slotIso: string, durationMinutes: number): string | null {
  const duration = officialMinutes(durationMinutes);
  const date = new Date(slotIso);
  if (!duration || Number.isNaN(date.getTime())) return null;
  const when = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const hours = duration / 60;
  return `Quedó agendada la visita de ${hours} horas, ${when}. El pago queda pendiente de verificar.`;
}

export function readAppointmentId(result: unknown): string {
  if (!isRecord(result)) return '';
  if (typeof result.appointmentId === 'string' && result.appointmentId.trim()) return result.appointmentId.trim();
  if (isRecord(result.result) && typeof result.result.appointmentId === 'string') {
    return result.result.appointmentId.trim();
  }
  return '';
}
