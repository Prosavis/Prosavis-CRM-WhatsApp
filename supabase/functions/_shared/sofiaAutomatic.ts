// Decisiones del modo automática. No envía ni crea citas.

export const AUTO_BATCH = 6;
export const AUTO_SILENCE_FLOOR_SECONDS = 60;

export const AUTO_RIDER =
  'CIERRE: en este turno busca agendar. Si falta un dato, pide solo ese. ' +
  'Si dicen que no, despídete en una frase y no insistas. No confirmes un pago. ' +
  'No digas que la cita quedó agendada: el sistema la crea aparte.';

export const AUTO_GOODBYE = 'Entendido. Quedamos atentos cuando lo necesite.';
export const AUTO_HANDOFF = 'Una compañera sigue este caso con usted.';
export const AUTO_EMPLEO =
  'Entendido. Envíenos por aquí su hoja de vida, o sus datos de contacto y experiencia, para tenerle en cuenta en los procesos de selección.';

const OFFICIAL_HOURS = [240, 360, 480] as const;
type OfficialMinutes = (typeof OFFICIAL_HOURS)[number];

export type InboundKind = 'no' | 'empleo' | 'cobertura' | 'cierre' | 'escalar' | 'seguir';

export function isJobApplication(text: string): boolean {
  return /empleo|hoja de vida|vacante|busco trabajo|buscando trabajo|quiero trabajar|trabajo con ustedes/i.test(text);
}

export function wantsCleaning(text: string): boolean {
  return /limpieza|agendar|cotiz|precio|hogar|dom[eé]stic/i.test(text) && !isJobApplication(text);
}

export function isCoverageQuestion(text: string): boolean {
  const folded = text.trim();
  if (!folded || isJobApplication(folded)) return false;
  return /lleg|hasta (la|su|el) (casa|apto|apartamento)|d[oó]nde est[aá]n|d[oó]nde quedan|atienden|cubren|cobertura|hay servicio|tienen servicio|etapa \d|afueras|vereda|corregimiento|pereira\s*\?|dosquebradas\s*\?|(?:estoy|vivo|queda)\s+en\s+\S+/i.test(folded);
}

const OUT_OF_COVERAGE = /bogot[aá]|cali|medell[ií]n/i;
const OFFICIAL_ZONE = /pereira|dosquebradas|cerritos|santa rosa|cartago/i;
const HOUR_PRICE: Readonly<Record<number, number>> = { 4: 88_000, 6: 118_000, 8: 148_000 };

export type CoverageAnswer = 'fuera' | 'sede' | 'revisar' | 'llega';

/** Un sector o unas afueras no se confirman. La zona oficial sí. */
export function coverageAnswer(text: string): CoverageAnswer {
  if (OUT_OF_COVERAGE.test(text) && !OFFICIAL_ZONE.test(text)) return 'fuera';
  if (/d[oó]nde est[aá]n|d[oó]nde quedan/i.test(text)) return 'sede';
  if (/afueras|vereda|corregimiento/i.test(text)) return 'revisar';
  const place = text.match(/(?:estoy|vivo|queda)\s+en\s+(.{2,40})/i)?.[1]?.trim() ?? '';
  if (place && !OFFICIAL_ZONE.test(place)) return 'revisar';
  return 'llega';
}

function formatCop(value: number): string {
  return `$${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function sectorName(blob: string): string | null {
  const place = blob.match(/(?:estoy|vivo|queda)\s+en\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i)?.[1] ?? '';
  if (!place || OFFICIAL_ZONE.test(place) || OUT_OF_COVERAGE.test(place)) return null;
  return `${place.charAt(0).toUpperCase()}${place.slice(1).toLowerCase()}`;
}

function teamPriceLine(blob: string): string | null {
  const people = Number(blob.match(/(\d+)\s*personas?/i)?.[1] ?? 0);
  const hours = Number(blob.match(/(\d+)\s*horas/i)?.[1] ?? 0);
  const each = HOUR_PRICE[hours] ?? 0;
  if (!each || people < 2 || people > 6) return null;
  return `Para ${people} profesionales de ${hours} horas el total es de ${formatCop(each * people)} (${formatCop(each)} por cada jornada).`;
}

function decemberDateLine(blob: string): string | null {
  const day = blob.match(/(\d{1,2})\s+de\s+diciembre/i)?.[1];
  if (!day) return null;
  return `El ${day} de diciembre es temporada alta. Conviene dejar la cita con tiempo para asegurar el turno.`;
}

/**
 * Confirma el domicilio solo en la zona oficial.
 * Un sector o las afueras se revisan. No inventa recargo de transporte.
 */
export function coverageReply(text: string, context = ''): string {
  const answer = coverageAnswer(text);
  switch (answer) {
    case 'fuera':
      return 'Por ahora el servicio a domicilio está en Pereira, Dosquebradas, Cerritos, Santa Rosa de Cabal y Cartago. En esa ciudad no lo prestamos.';
    case 'sede':
      return 'La sede está en la Cra. 23 #85-13, Manzana 5 Casa 17, Pereira. La limpieza es a domicilio: la auxiliar llega a su casa. ¿En qué barrio o conjunto es, y para qué fecha la necesita?';
    case 'revisar': {
      const blob = `${context}\n${text}`;
      const sector = sectorName(blob);
      const opening = sector
        ? `Para el sector de ${sector} hay que revisar el punto exacto y la ruta de acceso.`
        : 'Para ese sector hay que revisar el punto exacto y la ruta de acceso.';
      return [
        `${opening} ¿Me indica la dirección exacta, la vereda o un punto de referencia?`,
        teamPriceLine(blob),
        decemberDateLine(blob),
      ].filter((line): line is string => Boolean(line)).join('\n\n');
    }
    case 'llega':
      return 'Sí, la auxiliar llega hasta su casa. Atendemos en Pereira, Dosquebradas, Cerritos, Santa Rosa de Cabal y Cartago. Para separar el cupo, ¿me comparte la dirección completa, con conjunto, etapa, torre o casa y número, y qué fecha le queda mejor?';
    default: {
      const unexpected: never = answer;
      return unexpected;
    }
  }
}

const HOUR_CHOICE = /\b(4|6|8)\s*horas?\b/i;

/** La clienta eligió 4, 6 u 8 horas. No es una pregunta de precio. */
export function chosenHours(text: string): 4 | 6 | 8 | null {
  const match = text.match(HOUR_CHOICE);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours !== 4 && hours !== 6 && hours !== 8) return null;
  const confirms = /suficiente|est[aá] bien|me sirve|de acuerdo|perfecto|listo|considero/i.test(text)
    || /^\s*(con\s+)?(4|6|8)\s*horas?\s*\.?\s*$/i.test(text);
  return confirms ? hours : null;
}

function mentionedWhen(blob: string): string | null {
  const named = blob.match(
    /(?:mañana\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+\d{1,2}\s+de\s+[a-záéíóúñ]+/i,
  );
  if (named) return named[0];
  const dated = blob.match(
    /\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
  );
  return dated ? dated[0] : null;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/** Una dirección dicha en el chat. La sede no cuenta como la casa de la clienta. */
function mentionedAddress(blob: string): string | null {
  const pattern = /(?:cra|carrera|calle|cll|av\.?|avenida|diagonal|transversal)\.?\s*\d+\s*#\s*\d+(?:-\d+)?/gi;
  const found = [...blob.matchAll(pattern)].map((item) => item[0].replace(/\s+/g, ' ').trim());
  return found.find((item) => !/23\s*#\s*85/.test(item)) ?? null;
}

/**
 * Cierra con los datos ya dichos. Pide la hora y el mapa.
 * No ofrece un horario ni dice que la cita quedó agendada.
 */
export function closeReply(text: string, context = ''): string {
  const hours = chosenHours(text);
  if (!hours) return '';
  const price = formatCop(HOUR_PRICE[hours] ?? 0);
  const blob = `${context}\n${text}`;
  const when = mentionedWhen(blob);
  const address = mentionedAddress(blob);
  const lines = [`Con ${hours} horas, el valor es de ${price}.`];
  if (when || address) {
    const facts = [
      when ? `Fecha: ${sentenceCase(when)}` : '',
      `Duración: ${hours} horas (${price})`,
      address ? `Dirección: ${address}` : '',
    ].filter((line) => line.length > 0);
    lines.push(`Para organizarla, estos son los datos que ya tenemos:\n${facts.map((fact) => `• ${fact}`).join('\n')}`);
  }
  if (!when) lines.push('¿Para qué fecha la necesita?');
  if (!address) lines.push('¿Me indica la dirección completa?');
  if (when && address) {
    lines.push('Solo falta la hora de inicio. ¿A qué hora le queda bien empezar?');
    lines.push('Si puede, comparta la ubicación o el enlace de Google Maps para que la auxiliar llegue a la propiedad.');
  }
  return lines.join('\n\n');
}

export function classifyInbound(text: string): { kind: InboundKind; motivo: string } {
  const folded = text.trim();
  if (/no,?\s*gracias|no muchas gracias|por ahora no|no me interesa/i.test(folded)) {
    return { kind: 'no', motivo: 'no quiere' };
  }
  if (isJobApplication(folded)) {
    return { kind: 'empleo', motivo: 'empleo' };
  }
  if (isCoverageQuestion(folded)) {
    return { kind: 'cobertura', motivo: 'cobertura' };
  }
  if (chosenHours(folded)) {
    return { kind: 'cierre', motivo: 'eligió la duración' };
  }
  if (/m[aá]rcame|ll[aá]mame|\bllamada\b/i.test(folded)) {
    return { kind: 'escalar', motivo: 'pidió una llamada' };
  }
  if (/queja|reclamo/i.test(folded)) {
    return { kind: 'escalar', motivo: 'queja' };
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
