// Horario del equipo: lunes a viernes de 8:00 a 18:00, hora de Bogotá.
// Sábados, domingos y festivos no hay oficina.
import { isColombiaPublicHolidayDate } from './colombiaBookingCalendar.ts';

const OFFICE_OPEN_HOUR = 8;
const OFFICE_CLOSE_HOUR = 18;

function bogotaParts(now: Date): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: byType.weekday ?? '', hour: Number(byType.hour ?? '0') };
}

/** True cuando hay alguien en la oficina para aprobar un borrador. */
export function teamIsInOffice(now: Date): boolean {
  if (isColombiaPublicHolidayDate(now)) return false;
  const { weekday, hour } = bogotaParts(now);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return hour >= OFFICE_OPEN_HOUR && hour < OFFICE_CLOSE_HOUR;
}

const BRIDGE_BODY = 'Ya recibimos su mensaje. Mañana a primera hora le respondemos con todo gusto.';

/** Saludo del mensaje puente según la hora, con el mismo cuerpo. */
export function bridgeGreeting(now: Date): string {
  const { hour } = bogotaParts(now);
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${greeting}. ${BRIDGE_BODY}`;
}

/** Medianoche siguiente en Bogotá. Colombia no cambia de hora: UTC-5. */
export function nextBogotaMidnight(now: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0));
}
