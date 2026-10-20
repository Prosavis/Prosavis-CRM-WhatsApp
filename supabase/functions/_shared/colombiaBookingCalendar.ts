/**
 * Copia de prosavis-firebase/functions/src/utils/colombiaBookingCalendar.ts.
 * Si cambia el calendario de festivos, cambia las dos.
 */
const FIXED_HOLIDAYS: Array<[number, number]> = [
  [1, 1],
  [5, 1],
  [7, 20],
  [8, 7],
  [12, 8],
  [12, 25],
];

const MONDAY_SHIFTED_HOLIDAYS: Array<[number, number]> = [
  [1, 6],
  [3, 19],
  [6, 29],
  [8, 15],
  [10, 12],
  [11, 1],
  [11, 11],
];

const EASTER_RELATIVE_HOLIDAYS = [-3, -2, 43, 64, 71];

const pad = (value: number): string => String(value).padStart(2, '0');

const toKey = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

function easterSundayUtc(year: number): Date {
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
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days
  ));
}

function nextMondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7;
  return addDaysUtc(date, daysUntilMonday);
}

function addDateToSet(set: Set<string>, date: Date): void {
  set.add(toKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  ));
}

function getBogotaDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
}

export function getColombiaPublicHolidayKeys(year: number): Set<string> {
  const holidays = new Set<string>();

  for (const [month, day] of FIXED_HOLIDAYS) {
    holidays.add(toKey(year, month, day));
  }

  for (const [month, day] of MONDAY_SHIFTED_HOLIDAYS) {
    addDateToSet(holidays, nextMondayUtc(new Date(Date.UTC(year, month - 1, day))));
  }

  const easter = easterSundayUtc(year);
  for (const offset of EASTER_RELATIVE_HOLIDAYS) {
    addDateToSet(holidays, addDaysUtc(easter, offset));
  }

  return holidays;
}

export function isColombiaPublicHolidayDateParts(
  year: number,
  month: number,
  day: number
): boolean {
  return getColombiaPublicHolidayKeys(year).has(toKey(year, month, day));
}

export function isColombiaPublicHolidayDate(date: Date): boolean {
  const { year, month, day } = getBogotaDateParts(date);
  return isColombiaPublicHolidayDateParts(year, month, day);
}

export function isColombiaCleaningDateBlocked(date: Date): boolean {
  const { year, month, day } = getBogotaDateParts(date);
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12));
  return utcNoon.getUTCDay() === 0 ||
    isColombiaPublicHolidayDateParts(year, month, day);
}

export function isColombiaCleaningDateKeyBlocked(dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return false;
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12));
  return utcNoon.getUTCDay() === 0 ||
    isColombiaPublicHolidayDateParts(year, month, day);
}
