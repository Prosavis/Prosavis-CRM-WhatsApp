/** America/Bogota is UTC-5 year-round (no DST). */
export function bogotaDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const bogotaMs = d.getTime() - 5 * 60 * 60 * 1000;
  const bogota = new Date(bogotaMs);
  if (Number.isNaN(bogota.getTime())) return null;
  return bogota.toISOString().slice(0, 10);
}

export function parseDayKey(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekKeyFromDay(day: string): string {
  const date = parseDayKey(day);
  const dow = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function monthKeyFromDay(day: string): string {
  return day.slice(0, 7);
}

export function eachDayInclusive(
  startKey: string,
  endKey: string,
  maxDays = 400,
): string[] {
  if (startKey > endKey) return [];
  const days: string[] = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < maxDays) {
    days.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    guard += 1;
  }
  return days;
}

export function addDaysToKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function sumCompletedInRange(
  byDay: Map<string, number>,
  startKey: string,
  endKey: string,
): number {
  if (startKey > endKey) return 0;
  let total = 0;
  for (const [day, count] of byDay) {
    if (day >= startKey && day <= endKey) total += count;
  }
  return total;
}

export function buildComparison(
  current: number,
  previous: number,
): { current: number; previous: number; growth: number | null } {
  let growth: number | null = null;
  if (previous > 0) {
    growth = Math.round(((current - previous) / previous) * 1000) / 10;
  } else if (previous === 0 && current > 0) {
    growth = 100;
  }
  return { current, previous, growth };
}

function getFiniteAmount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Misma definición que User Console / getCrmLifetimeCollectedRevenue. */
export function appointmentTotalCop(data: Record<string, unknown>): number {
  const snap = data.bookingSnapshot as
    | { totalAmount?: unknown; price?: unknown }
    | undefined;
  return Math.max(
    0,
    Math.round(
      getFiniteAmount(
        data.totalAmount,
        getFiniteAmount(
          data.price,
          getFiniteAmount(snap?.totalAmount, getFiniteAmount(snap?.price)),
        ),
      ),
    ),
  );
}

export function sumLifetimeCollected(
  rows: Array<Record<string, unknown>>,
): { lifetimeCollectedTotal: number; lifetimePaidAppointmentCount: number } {
  let lifetimeCollectedTotal = 0;
  let lifetimePaidAppointmentCount = 0;
  for (const row of rows) {
    if (row.paymentStatus !== 'PAGO_ACEPTADO') continue;
    lifetimeCollectedTotal += appointmentTotalCop(row);
    lifetimePaidAppointmentCount += 1;
  }
  return { lifetimeCollectedTotal, lifetimePaidAppointmentCount };
}

export interface CompletedServicesTimeseriesPoint {
  bucket: string;
  completed: number;
}

export interface CompletedServicesCoreInput {
  scheduledIsos: Array<string | null | undefined>;
  windowFromIso: string;
  windowToIso: string;
  periodStartKey: string;
  periodEndKey: string;
}

export function buildCompletedServicesCore(input: CompletedServicesCoreInput) {
  const completedByDay = new Map<string, number>();
  const completedByWeek = new Map<string, number>();
  const completedByMonth = new Map<string, number>();
  for (const iso of input.scheduledIsos) {
    const day = bogotaDayKey(iso);
    if (!day) continue;
    const week = weekKeyFromDay(day);
    const month = monthKeyFromDay(day);
    completedByDay.set(day, (completedByDay.get(day) ?? 0) + 1);
    completedByWeek.set(week, (completedByWeek.get(week) ?? 0) + 1);
    completedByMonth.set(month, (completedByMonth.get(month) ?? 0) + 1);
  }

  const completedStartKey =
    bogotaDayKey(input.windowFromIso) ?? input.windowFromIso.slice(0, 10);
  const completedEndKey =
    bogotaDayKey(input.windowToIso) ?? input.windowToIso.slice(0, 10);
  const completedDays = eachDayInclusive(completedStartKey, completedEndKey);
  const completedWeeks = [...new Set(completedDays.map(weekKeyFromDay))].sort();
  const completedMonths = [...new Set(completedDays.map(monthKeyFromDay))].sort();

  const completedDayPoints = [...completedByDay.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, completed]) => ({ bucket, completed }));

  const timeseries = {
    day: completedDayPoints,
    week: completedWeeks.map((bucket) => ({
      bucket,
      completed: completedByWeek.get(bucket) ?? 0,
    })),
    month: completedMonths.map((bucket) => ({
      bucket,
      completed: completedByMonth.get(bucket) ?? 0,
    })),
  };

  const lastCompletedDate =
    completedDayPoints.length > 0
      ? completedDayPoints[completedDayPoints.length - 1].bucket
      : null;

  const inSelectedPeriod = input.scheduledIsos.filter((iso) => {
    const day = bogotaDayKey(iso);
    return day != null && day >= input.periodStartKey && day <= input.periodEndKey;
  }).length;

  const todayKey = input.periodEndKey;
  const [todayYear, todayMonth, todayDom] = todayKey.split('-').map(Number);
  const currentMonthKey = `${todayYear}-${String(todayMonth).padStart(2, '0')}`;
  const currentMonthStart = `${currentMonthKey}-01`;

  const prevMonthKey = addMonthsToKey(currentMonthKey, -1);
  const [prevMonthYear, prevMonthNum] = prevMonthKey.split('-').map(Number);
  const prevMonthDayCount = new Date(Date.UTC(prevMonthYear, prevMonthNum, 0))
    .getUTCDate();
  const prevMonthSameDom = Math.min(todayDom, prevMonthDayCount);
  const mtd = buildComparison(
    sumCompletedInRange(completedByDay, currentMonthStart, todayKey),
    sumCompletedInRange(
      completedByDay,
      `${prevMonthKey}-01`,
      `${prevMonthKey}-${String(prevMonthSameDom).padStart(2, '0')}`,
    ),
  );

  const rolling30Start = addDaysToKey(todayKey, -29);
  const prev30End = addDaysToKey(rolling30Start, -1);
  const prev30Start = addDaysToKey(prev30End, -29);
  const rolling30d = buildComparison(
    sumCompletedInRange(completedByDay, rolling30Start, todayKey),
    sumCompletedInRange(completedByDay, prev30Start, prev30End),
  );

  const windowStartMonth = completedStartKey.slice(0, 7);
  const lastClosedMonthKey = addMonthsToKey(currentMonthKey, -1);
  const prevClosedMonthKey = addMonthsToKey(currentMonthKey, -2);
  const lastClosedMonth =
    prevClosedMonthKey > windowStartMonth
      ? {
        month: lastClosedMonthKey,
        ...buildComparison(
          completedByMonth.get(lastClosedMonthKey) ?? 0,
          completedByMonth.get(prevClosedMonthKey) ?? 0,
        ),
      }
      : null;

  return {
    timeseries,
    meta: {
      windowMonths: 6,
      windowFrom: input.windowFromIso,
      windowTo: input.windowToIso,
      totalCompleted: input.scheduledIsos.filter((iso) => Boolean(bogotaDayKey(iso)))
        .length,
      inSelectedPeriod,
      lastCompletedDate,
      today: todayKey,
      currentMonth: currentMonthKey,
      comparisons: {
        mtd,
        rolling30d,
        lastClosedMonth,
      },
    },
  };
}

export function buildPaidAppointmentsQuery(serviceId: string): Record<string, unknown> {
  return {
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'serviceId' },
              op: 'EQUAL',
              value: { stringValue: serviceId },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'paymentStatus' },
              op: 'EQUAL',
              value: { stringValue: 'PAGO_ACEPTADO' },
            },
          },
        ],
      },
    },
  };
}
