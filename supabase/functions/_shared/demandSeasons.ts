/**
 * Temporadas que llenan la agenda de Prosavis (Pereira, Dosquebradas,
 * Cerritos, Santa Rosa de Cabal y Cartago). Una sola ventana abierta:
 * gana la que empieza antes. Una feria de otro municipio no se nombra.
 *
 * El receso escolar es el de Pereira 2026. Otro año no se menciona hasta
 * que la Secretaría publique el calendario.
 */

const BOGOTA_TZ = 'America/Bogota';

export type DemandSeasonTier = 'agenda' | 'hogar';

type SeasonScope = 'todos' | 'pereira' | 'santa_rosa' | 'cartago';

export interface DemandSeason {
  id: string;
  label: string;
  tier: DemandSeasonTier;
  reason: string;
  phrase: string;
  eventStart: string;
}

interface SeasonWindow extends DemandSeason {
  scope: SeasonScope;
  warnStart: string;
  mentionUntil: string;
}

const BOOK_AHEAD = 'Conviene dejar la cita con tiempo para garantizar el turno.';

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Domingo de Pascua (cómputo gregoriano). Misma cuenta que el calendario de festivos. */
function easterSundayKey(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(ymd(year, month, 1), delta + (n - 1) * 7);
}

function bogotaDateKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const key = `${value('year')}-${value('month')}-${value('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function cityScope(city: string | null | undefined): SeasonScope | 'desconocida' {
  if (!city?.trim()) return 'desconocida';
  const normalized = city.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (normalized.includes('santa rosa')) return 'santa_rosa';
  if (normalized.includes('cartago')) return 'cartago';
  if (
    normalized.includes('dosquebrada')
    || normalized.includes('cerrito')
    || normalized.includes('pereira')
  ) {
    return 'pereira';
  }
  return 'desconocida';
}

function windowFor(params: {
  id: string;
  label: string;
  tier: DemandSeasonTier;
  scope: SeasonScope;
  reason: string;
  phrase: string;
  eventStart: string;
  warnStart: string;
  mentionUntil: string;
}): SeasonWindow {
  return params;
}

function annualWindows(year: number): SeasonWindow[] {
  const juevesSanto = addDays(easterSundayKey(year), -3);
  const madre = nthWeekdayOfMonth(year, 5, 0, 2);
  const amor = nthWeekdayOfMonth(year, 9, 6, 3);
  return [
    windowFor({
      id: 'fin-de-ano',
      label: 'temporada de diciembre',
      tier: 'agenda',
      scope: 'todos',
      reason: 'Visitas, cenas, velitas, Inmaculada y Navidad. La agenda se llena.',
      phrase: `Se viene la temporada de diciembre y, por el alto flujo, ${BOOK_AHEAD.charAt(0).toLowerCase()}${BOOK_AHEAD.slice(1)}`,
      eventStart: ymd(year, 12, 1),
      warnStart: ymd(year, 11, 1),
      mentionUntil: ymd(year, 12, 23),
    }),
    windowFor({
      id: 'semana-santa',
      label: 'Semana Santa',
      tier: 'agenda',
      scope: 'todos',
      reason: 'Viaje y casa lista antes de salir. La agenda se llena.',
      phrase: `Se viene Semana Santa y la agenda se llena. ${BOOK_AHEAD}`,
      eventStart: juevesSanto,
      warnStart: addDays(juevesSanto, -28),
      mentionUntil: addDays(juevesSanto, -2),
    }),
    windowFor({
      id: 'cosecha',
      label: 'Fiestas de la Cosecha',
      tier: 'agenda',
      scope: 'pereira',
      reason: 'Fiestas de Pereira, del 14 al 30 de agosto. La agenda se llena.',
      phrase: `Se vienen las Fiestas de la Cosecha y la agenda se llena. ${BOOK_AHEAD}`,
      eventStart: ymd(year, 8, 14),
      warnStart: ymd(year, 7, 17),
      mentionUntil: ymd(year, 8, 30),
    }),
    windowFor({
      id: 'feria-cartago',
      label: 'Feria de Cartago',
      tier: 'agenda',
      scope: 'cartago',
      reason: 'Aniversario de Cartago el 9 de agosto. La agenda se llena.',
      phrase: `Se viene la Feria de Cartago y la agenda se llena. ${BOOK_AHEAD}`,
      eventStart: ymd(year, 8, 1),
      warnStart: ymd(year, 7, 4),
      mentionUntil: ymd(year, 8, 9),
    }),
    windowFor({
      id: 'araucarias',
      label: 'Fiestas de las Araucarias',
      tier: 'agenda',
      scope: 'santa_rosa',
      reason: 'Fiestas de Santa Rosa de Cabal, del 8 al 13 de octubre. La agenda se llena.',
      phrase: `Se vienen las Fiestas de las Araucarias y la agenda se llena. ${BOOK_AHEAD}`,
      eventStart: ymd(year, 10, 8),
      warnStart: ymd(year, 9, 10),
      mentionUntil: ymd(year, 10, 13),
    }),
    windowFor({
      id: 'dia-madre',
      label: 'Día de la Madre',
      tier: 'hogar',
      scope: 'todos',
      reason: 'Reunión en casa el segundo domingo de mayo.',
      phrase: `Se acerca el Día de la Madre y ${BOOK_AHEAD.charAt(0).toLowerCase()}${BOOK_AHEAD.slice(1)}`,
      eventStart: madre,
      warnStart: addDays(madre, -21),
      mentionUntil: addDays(madre, -1),
    }),
    windowFor({
      id: 'amor-amistad',
      label: 'Amor y Amistad',
      tier: 'hogar',
      scope: 'todos',
      reason: 'Reunión en casa el tercer sábado de septiembre.',
      phrase: `Se acerca el Día del Amor y la Amistad y ${BOOK_AHEAD.charAt(0).toLowerCase()}${BOOK_AHEAD.slice(1)}`,
      eventStart: amor,
      warnStart: addDays(amor, -21),
      mentionUntil: addDays(amor, -1),
    }),
  ];
}

/** Receso y regreso a clases publicados para Pereira en 2026. */
function schoolWindows2026(): SeasonWindow[] {
  return [
    windowFor({
      id: 'regreso-clases',
      label: 'regreso a clases',
      tier: 'agenda',
      scope: 'pereira',
      reason: 'Regreso a clases en Pereira el 26 de enero de 2026.',
      phrase: `Se acerca el regreso a clases y ${BOOK_AHEAD.charAt(0).toLowerCase()}${BOOK_AHEAD.slice(1)}`,
      eventStart: '2026-01-26',
      warnStart: '2026-01-05',
      mentionUntil: '2026-01-25',
    }),
    windowFor({
      id: 'mitad-de-ano',
      label: 'vacaciones de mitad de año',
      tier: 'agenda',
      scope: 'todos',
      reason: 'Receso estudiantil de Pereira, del 15 de junio al 5 de julio de 2026. La agenda se llena.',
      phrase: `Se vienen las vacaciones de mitad de año y la agenda se llena. ${BOOK_AHEAD}`,
      eventStart: '2026-06-15',
      warnStart: '2026-05-18',
      mentionUntil: '2026-06-14',
    }),
    windowFor({
      id: 'receso-octubre',
      label: 'receso escolar de octubre',
      tier: 'agenda',
      scope: 'pereira',
      reason: 'Receso estudiantil de Pereira, del 5 al 11 de octubre de 2026.',
      phrase: `Se viene el receso escolar de octubre y ${BOOK_AHEAD.charAt(0).toLowerCase()}${BOOK_AHEAD.slice(1)}`,
      eventStart: '2026-10-05',
      warnStart: '2026-09-21',
      mentionUntil: '2026-10-11',
    }),
  ];
}

function windowsAround(today: string): SeasonWindow[] {
  const year = Number(today.slice(0, 4));
  return [
    ...annualWindows(year - 1),
    ...annualWindows(year),
    ...annualWindows(year + 1),
    ...schoolWindows2026(),
  ];
}

function isOpen(today: string, season: SeasonWindow): boolean {
  return today >= season.warnStart && today <= season.mentionUntil;
}

/**
 * La temporada que se le puede decir hoy. Sin ciudad, o con una ciudad
 * fuera de cobertura, no entra una feria de un solo municipio.
 */
export function selectDemandSeason(
  nowIso: string,
  city?: string | null,
): DemandSeason | null {
  const today = bogotaDateKey(nowIso);
  if (!today) return null;
  const scope = cityScope(city);
  const open = windowsAround(today).filter((season) =>
    isOpen(today, season) && (season.scope === 'todos' || season.scope === scope)
  );
  open.sort((left, right) => {
    if (left.eventStart !== right.eventStart) {
      return left.eventStart < right.eventStart ? -1 : 1;
    }
    if (left.tier !== right.tier) return left.tier === 'agenda' ? -1 : 1;
    return left.id < right.id ? -1 : 1;
  });
  const picked = open[0];
  if (!picked) return null;
  return {
    id: picked.id,
    label: picked.label,
    tier: picked.tier,
    reason: picked.reason,
    phrase: picked.phrase,
    eventStart: picked.eventStart,
  };
}

export function formatDemandSeasonLines(nowIso: string, city?: string | null): string[] {
  const season = selectDemandSeason(nowIso, city);
  if (!season) {
    return [
      'Ninguna temporada próxima.',
      'Si pospone, agradece y deja la puerta abierta. No inventes una fiesta ni enumeres fechas.',
    ];
  }
  return [
    `Temporada: ${season.label}`,
    `Por qué (no lo copies literal): ${season.reason}`,
    `Di solo esto, en una frase: ${season.phrase}`,
  ];
}
