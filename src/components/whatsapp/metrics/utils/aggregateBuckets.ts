import type { CompletedAppointmentDetail } from '@/types/whatsapp';

export type MetricsGranularity = 'day' | 'week' | 'month';

export interface InboundBucketPoint {
  bucket: string;
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}

export interface CompletedBucketPoint {
  bucket: string;
  completed: number;
}

export interface GranularTimeseries<T> {
  day: T[];
  week: T[];
  month: T[];
}

export interface AggregatedInboundPoint extends InboundBucketPoint {
  label: string;
}

export interface AggregatedCompletedPoint extends CompletedBucketPoint {
  label: string;
  growth: number | null;
  /** El bucket contiene "hoy" (día/semana/mes en curso) → periodo incompleto. */
  isPartial: boolean;
}

function parseBucketDate(bucket: string): Date {
  if (bucket.includes('-W')) {
    const [yearStr, weekStr] = bucket.split('-W');
    const year = Number(yearStr);
    const week = Number(weekStr);
    // Approximate label date: Jan 4 + (week-1)*7 (ISO week contains Jan 4)
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    return monday;
  }
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const [y, m] = bucket.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }
  const [y, m, d] = bucket.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatLabel(bucket: string, granularity: MetricsGranularity): string {
  if (granularity === 'week') {
    return bucket.replace('-W', ' S');
  }
  const date = parseBucketDate(bucket);
  if (granularity === 'month') {
    return date.toLocaleDateString('es-CO', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    });
  }
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Keep completed series aligned to the metrics period (drop lookback months if needed). */
export function filterCompletedToPeriod(
  points: CompletedBucketPoint[],
  periodFromIso: string,
  granularity: MetricsGranularity,
): CompletedBucketPoint[] {
  const fromDate = new Date(periodFromIso);
  const bogotaMs = fromDate.getTime() - 5 * 60 * 60 * 1000;
  const startDay = new Date(bogotaMs).toISOString().slice(0, 10);

  if (granularity === 'day') {
    return points.filter((p) => p.bucket >= startDay);
  }
  if (granularity === 'month') {
    const startMonth = startDay.slice(0, 7);
    return points.filter((p) => p.bucket >= startMonth);
  }
  // week: keep last points that overlap period — filter by comparing week of startDay
  const [y, m, d] = startDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const startWeek = `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  return points.filter((p) => p.bucket >= startWeek);
}

export function labelInboundSeries(
  series: InboundBucketPoint[],
  granularity: MetricsGranularity,
): AggregatedInboundPoint[] {
  return series.map((p) => ({
    ...p,
    label: formatLabel(p.bucket, granularity),
  }));
}

export function labelCompletedSeries(
  series: CompletedBucketPoint[],
  granularity: MetricsGranularity,
  currentBucketKey?: string | null,
): AggregatedCompletedPoint[] {
  return series.map((point, index) => {
    const prev = index > 0 ? series[index - 1].completed : null;
    let growth: number | null = null;
    if (prev !== null && prev > 0) {
      growth = Math.round(((point.completed - prev) / prev) * 1000) / 10;
    } else if (prev === 0 && point.completed > 0) {
      // Primer mes con datos tras un cero, o salto desde 0 → +100% (igual User Console)
      growth = 100;
    } else if (prev === null && point.completed > 0) {
      // Primer bucket de la serie con datos → +100% (alineado con MonthlyGrowthChart)
      growth = 100;
    }
    return {
      ...point,
      label: formatLabel(point.bucket, granularity),
      growth,
      isPartial: currentBucketKey != null && point.bucket === currentBucketKey,
    };
  });
}

/** Día Bogotá (UTC-5, sin DST) de un ISO. Espejo de `bogotaDayKey` del edge. */
export function bogotaDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const bogotaMs = d.getTime() - 5 * 60 * 60 * 1000;
  const bogota = new Date(bogotaMs);
  if (Number.isNaN(bogota.getTime())) return null;
  return bogota.toISOString().slice(0, 10);
}

/** Clave de semana ISO (`YYYY-Www`) de un día. Espejo de `weekKeyFromDay` del edge. */
function weekKeyFromDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Clave de bucket (día/semana/mes) para un día Bogotá dado. */
export function bucketKeyForDay(
  dayKey: string,
  granularity: MetricsGranularity,
): string {
  if (granularity === 'day') return dayKey;
  if (granularity === 'month') return dayKey.slice(0, 7);
  return weekKeyFromDayKey(dayKey);
}

/** Bucket "en curso" (contiene hoy) para marcar la serie como parcial. */
export function currentBucketKeyForToday(
  granularity: MetricsGranularity,
  todayKey?: string | null,
): string | null {
  const day = todayKey ?? bogotaDayKeyFromIso(new Date().toISOString());
  if (!day) return null;
  return bucketKeyForDay(day, granularity);
}

/** Citas cuyo día Bogotá cae dentro del bucket seleccionado. */
export function filterAppointmentsToBucket(
  appointments: CompletedAppointmentDetail[],
  bucket: string,
  granularity: MetricsGranularity,
): CompletedAppointmentDetail[] {
  return appointments.filter((appt) => {
    const dayKey = bogotaDayKeyFromIso(appt.scheduledDate);
    if (!dayKey) return false;
    return bucketKeyForDay(dayKey, granularity) === bucket;
  });
}
