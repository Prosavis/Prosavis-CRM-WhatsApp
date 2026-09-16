import type { AppointmentStatusCounts, AppointmentStatusDayPoint } from '@/types/whatsapp';

export type AppointmentStatusGranularity = 'day' | 'week' | 'month';

export const APPOINTMENT_STATUS_GROUP_KEYS = [
  'scheduled',
  'inProgress',
  'completed',
  'canceled',
  'rejected',
] as const;

export type AppointmentStatusGroupKey = (typeof APPOINTMENT_STATUS_GROUP_KEYS)[number];

export const APPOINTMENT_STATUS_GROUP_VALUES: Record<AppointmentStatusGroupKey, readonly string[]> = {
  scheduled: ['PENDING', 'PENDING_RESCHEDULE', 'CONFIRMED'],
  inProgress: ['EN_ROUTE', 'IN_PROGRESS'],
  completed: ['COMPLETED'],
  canceled: ['CANCELED'],
  rejected: ['REJECTED'],
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PENDING_RESCHEDULE: 'Por reprogramar',
  CONFIRMED: 'Confirmada',
  EN_ROUTE: 'En ruta',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELED: 'Cancelada',
  REJECTED: 'Rechazada',
};

export const APPOINTMENT_GROUP_LABELS: Record<AppointmentStatusGroupKey, string> = {
  scheduled: 'Agendados',
  inProgress: 'En ejecución',
  completed: 'Completados',
  canceled: 'Cancelados',
  rejected: 'Rechazados',
};

export interface AppointmentStatusGroups {
  scheduled: number;
  inProgress: number;
  completed: number;
  canceled: number;
  rejected: number;
}

export interface LabeledAppointmentStatusPoint extends AppointmentStatusDayPoint {
  label: string;
  growth: number | null;
  completionRate: number;
  notCompleted: number;
  isPartial: boolean;
  stackedScheduled: number;
  stackedInProgress: number;
}

export function emptyAppointmentStatusCounts(): AppointmentStatusCounts {
  return {
    pending: 0,
    pendingReschedule: 0,
    confirmed: 0,
    enRoute: 0,
    inProgress: 0,
    completed: 0,
    canceled: 0,
    rejected: 0,
    total: 0,
  };
}

export function addAppointmentStatusCounts(
  left: AppointmentStatusCounts,
  right: AppointmentStatusCounts,
): AppointmentStatusCounts {
  return {
    pending: left.pending + right.pending,
    pendingReschedule: left.pendingReschedule + right.pendingReschedule,
    confirmed: left.confirmed + right.confirmed,
    enRoute: left.enRoute + right.enRoute,
    inProgress: left.inProgress + right.inProgress,
    completed: left.completed + right.completed,
    canceled: left.canceled + right.canceled,
    rejected: left.rejected + right.rejected,
    total: left.total + right.total,
  };
}

export function groupAppointmentStatuses(point: AppointmentStatusCounts): AppointmentStatusGroups {
  return {
    scheduled: point.pending + point.pendingReschedule + point.confirmed,
    inProgress: point.enRoute + point.inProgress,
    completed: point.completed,
    canceled: point.canceled,
    rejected: point.rejected,
  };
}

export function completionRate(point: Pick<AppointmentStatusCounts, 'completed' | 'total'>): number {
  if (point.total <= 0) return 0;
  return Math.round((point.completed / point.total) * 1000) / 10;
}

export function fromCompletedOnlyPoint(point: { bucket: string; completed: number }): AppointmentStatusDayPoint {
  return {
    ...emptyAppointmentStatusCounts(),
    bucket: point.bucket,
    completed: point.completed,
    total: point.completed,
  };
}

export function sumAppointmentStatus(points: AppointmentStatusCounts[]): AppointmentStatusCounts {
  return points.reduce(addAppointmentStatusCounts, emptyAppointmentStatusCounts());
}

function parseBucketDate(bucket: string): Date {
  if (bucket.includes('-W')) {
    const [yearStr, weekStr] = bucket.split('-W');
    const year = Number(yearStr);
    const week = Number(weekStr);
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

export function formatAppointmentBucketLabel(
  bucket: string,
  granularity: AppointmentStatusGranularity,
): string {
  if (granularity === 'week') return bucket.replace('-W', ' S');
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

export function bucketToDateRange(
  bucket: string,
  granularity: AppointmentStatusGranularity,
): { from: string; to: string } {
  if (granularity === 'day') return { from: bucket, to: bucket };
  if (granularity === 'month') {
    const [y, m] = bucket.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      from: `${bucket}-01`,
      to: `${bucket}-${String(last).padStart(2, '0')}`,
    };
  }
  const monday = parseBucketDate(bucket);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

export function labelAppointmentStatusSeries(
  series: AppointmentStatusDayPoint[],
  granularity: AppointmentStatusGranularity,
  currentBucketKey?: string | null,
): LabeledAppointmentStatusPoint[] {
  return series.map((point, index) => {
    const prev = index > 0 ? series[index - 1].completed : null;
    let growth: number | null = null;
    if (prev !== null && prev > 0) {
      growth = Math.round(((point.completed - prev) / prev) * 1000) / 10;
    } else if (prev === 0 && point.completed > 0) {
      growth = 100;
    } else if (prev === null && point.completed > 0) {
      growth = 100;
    }
    const groups = groupAppointmentStatuses(point);
    return {
      ...point,
      label: formatAppointmentBucketLabel(point.bucket, granularity),
      growth,
      completionRate: completionRate(point),
      notCompleted: groups.scheduled + groups.inProgress,
      isPartial: currentBucketKey != null && point.bucket === currentBucketKey,
      stackedScheduled: groups.scheduled,
      stackedInProgress: groups.inProgress,
    };
  });
}

export function trimEmptyAppointmentEdges(
  points: LabeledAppointmentStatusPoint[],
): LabeledAppointmentStatusPoint[] {
  const first = points.findIndex((row) => row.total > 0);
  if (first < 0) return points;
  let last = points.length - 1;
  while (last > first && points[last].total === 0) last -= 1;
  return points.slice(first, last + 1);
}

export function appointmentStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return APPOINTMENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}
