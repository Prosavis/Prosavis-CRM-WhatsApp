/**
 * Ventanas del tab Recordatorios 24h (Colombia).
 * Antes de las 18:00: próximo = mañana, último = hoy.
 * Después de las 18:00: último = el lote que acaba de salir (mañana),
 * próximo = pasado mañana.
 */

const COLOMBIA_UTC_OFFSET_HOURS = -5;

export function getColombiaDate(now: Date): { year: number; month: number; day: number } {
  const colombiaOffsetMs = COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const colombiaMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000 + colombiaOffsetMs;
  const d = new Date(colombiaMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function colombiaMidnightUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 5, 0, 0, 0));
}

export function colombiaSchedulerRunUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 23, 0, 0, 0));
}

export function formatColombiaDateKey(date: Date): string {
  const col = getColombiaDate(date);
  const y = col.year;
  const m = String(col.month + 1).padStart(2, '0');
  const d = String(col.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 6 PM Colombia del día anterior al servicio (inicio del batch 24h). */
export function reminderBatchStartUtcForScheduledDate(scheduledDateIso: string): Date {
  const col = getColombiaDate(new Date(scheduledDateIso));
  return new Date(Date.UTC(col.year, col.month, col.day - 1, 23, 0, 0, 0));
}

export type ReminderDashboardWindows = {
  timezone: 'America/Bogota';
  nextSchedulerRunAt: string;
  lastSchedulerRunAt: string;
  lastBatchRunAt: string;
  upcomingServiceDate: string;
  lastRunServiceDate: string;
  beforeNextSchedulerRun: boolean;
  upcomingDayOffset: number;
  lastRunDayOffset: number;
};

export function resolveReminderDashboardWindows(now = new Date()): ReminderDashboardWindows {
  const todayRun = colombiaSchedulerRunUtc(0, now);
  const beforeNextSchedulerRun = now.getTime() < todayRun.getTime();
  const upcomingDayOffset = beforeNextSchedulerRun ? 1 : 2;
  const lastRunDayOffset = beforeNextSchedulerRun ? 0 : 1;

  return {
    timezone: 'America/Bogota',
    nextSchedulerRunAt: (beforeNextSchedulerRun
      ? todayRun
      : colombiaSchedulerRunUtc(1, now)).toISOString(),
    lastSchedulerRunAt: (beforeNextSchedulerRun
      ? colombiaSchedulerRunUtc(-1, now)
      : todayRun).toISOString(),
    lastBatchRunAt: (beforeNextSchedulerRun
      ? colombiaSchedulerRunUtc(-1, now)
      : todayRun).toISOString(),
    upcomingServiceDate: formatColombiaDateKey(colombiaMidnightUtc(upcomingDayOffset, now)),
    lastRunServiceDate: formatColombiaDateKey(colombiaMidnightUtc(lastRunDayOffset, now)),
    beforeNextSchedulerRun,
    upcomingDayOffset,
    lastRunDayOffset,
  };
}
