export const COLOMBIA_TIME_ZONE = 'America/Bogota';
export const COLOMBIA_DATE_LOCALE = 'es-CO';

export function colombiaDateKey(value: Date | string | number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function previousColombiaDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function colombiaCalendarDayDiff(fromKey: string, toKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromKey.split('-').map(Number);
  const [toYear, toMonth, toDay] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function formatColombiaDateLabel(date: Date): string {
  return date.toLocaleDateString(COLOMBIA_DATE_LOCALE, {
    timeZone: COLOMBIA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatRelativeColombiaTime(date?: Date, now = new Date()): string {
  if (!date) return '';
  const dateKey = colombiaDateKey(date);
  const nowKey = colombiaDateKey(now);
  if (dateKey === nowKey) {
    return date.toLocaleTimeString(COLOMBIA_DATE_LOCALE, {
      timeZone: COLOMBIA_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (dateKey === previousColombiaDateKey(nowKey)) return 'Ayer';
  if (colombiaCalendarDayDiff(dateKey, nowKey) < 7) {
    return date.toLocaleDateString(COLOMBIA_DATE_LOCALE, {
      timeZone: COLOMBIA_TIME_ZONE,
      weekday: 'short',
    });
  }
  return date.toLocaleDateString(COLOMBIA_DATE_LOCALE, {
    timeZone: COLOMBIA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
