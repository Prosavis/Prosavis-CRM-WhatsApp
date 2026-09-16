import type { AppointmentStatusDayPoint, WhatsAppMetrics } from '@/types/whatsapp';
import {
  addAppointmentStatusCounts,
  completionRate,
  emptyAppointmentStatusCounts,
  fromCompletedOnlyPoint,
  groupAppointmentStatuses,
} from '@/utils/appointmentStatusMetrics';
import type { MetricsDays } from '@/utils/metricsVistas';

function addDaysToKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function windowKey(days: MetricsDays): string {
  return days === 'all' ? 'all' : String(days);
}

export function windowRange(days: MetricsDays, todayKey: string): { start: string; end: string } | null {
  if (days === 'all') return null;
  return { start: addDaysToKey(todayKey, -(Math.max(1, days) - 1)), end: todayKey };
}

export function inWindow(bucket: string, range: { start: string; end: string } | null): boolean {
  if (!range) return true;
  return bucket >= range.start && bucket <= range.end;
}

export function filterSeries<T extends { bucket: string }>(
  series: T[] | undefined,
  days: MetricsDays,
  todayKey: string,
): T[] {
  const range = windowRange(days, todayKey);
  return (series ?? []).filter((point) => inWindow(point.bucket, range));
}

export function filterHeatmapPoints<T extends { scheduledStart?: string | null }>(
  points: T[] | undefined,
  days: MetricsDays,
  todayKey: string,
): T[] {
  const range = windowRange(days, todayKey);
  return (points ?? []).filter((point) => {
    if (!point.scheduledStart) return days === 'all';
    return inWindow(point.scheduledStart.slice(0, 10), range);
  });
}

export function selectInboundWindow(metrics: WhatsAppMetrics, days: MetricsDays) {
  const today = metrics.today ?? metrics.period.to.slice(0, 10);
  const key = windowKey(days);
  return {
    totals: metrics.inboundWindowTotals?.[key] ?? metrics.inboundTotals,
    series: {
      day: filterSeries(metrics.inboundTimeseries?.day, days, today),
      week: metrics.inboundTimeseries?.week ?? [],
      month: metrics.inboundTimeseries?.month ?? [],
    },
  };
}

export function selectCompletedWindow(metrics: WhatsAppMetrics, days: MetricsDays) {
  const today = metrics.today ?? metrics.period.to.slice(0, 10);
  const key = windowKey(days);
  const daily = filterSeries(metrics.completedDaily ?? metrics.completedServicesTimeseries?.day, days, today);
  return {
    total: metrics.completedWindowTotals?.[key] ?? daily.reduce((sum, point) => sum + point.completed, 0),
    series: {
      day: daily,
      week: metrics.completedServicesTimeseries?.week ?? [],
      month: metrics.completedServicesTimeseries?.month ?? [],
    },
  };
}

function fallbackAppointmentDaily(metrics: WhatsAppMetrics): AppointmentStatusDayPoint[] {
  if (metrics.appointmentDaily?.length) return metrics.appointmentDaily;
  const completed = metrics.completedDaily ?? metrics.completedServicesTimeseries?.day ?? [];
  return completed.map(fromCompletedOnlyPoint);
}

function rollupAppointmentSeries(
  daily: AppointmentStatusDayPoint[],
): { day: AppointmentStatusDayPoint[]; week: AppointmentStatusDayPoint[]; month: AppointmentStatusDayPoint[] } {
  const byMonth = new Map<string, AppointmentStatusDayPoint>();
  for (const point of daily) {
    const month = point.bucket.slice(0, 7);
    const monthPoint = byMonth.get(month) ?? { bucket: month, ...emptyAppointmentStatusCounts() };
    byMonth.set(month, { bucket: month, ...addAppointmentStatusCounts(monthPoint, point) });
  }
  return {
    day: daily.filter((point) => point.total > 0 || point.completed > 0),
    week: metricsWeekFromDaily(daily),
    month: [...byMonth.values()].filter((point) => point.total > 0 || point.completed > 0),
  };
}

function isoWeekKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function metricsWeekFromDaily(daily: AppointmentStatusDayPoint[]): AppointmentStatusDayPoint[] {
  const byWeek = new Map<string, AppointmentStatusDayPoint>();
  for (const point of daily) {
    const week = point.bucket.includes('-W') ? point.bucket : isoWeekKey(point.bucket);
    const current = byWeek.get(week) ?? { bucket: week, ...emptyAppointmentStatusCounts() };
    byWeek.set(week, { bucket: week, ...addAppointmentStatusCounts(current, point) });
  }
  return [...byWeek.values()].filter((point) => point.total > 0 || point.completed > 0);
}

export function selectAppointmentStatusWindow(metrics: WhatsAppMetrics, days: MetricsDays) {
  const today = metrics.today ?? metrics.period.to.slice(0, 10);
  const key = windowKey(days);
  const daily = filterSeries(fallbackAppointmentDaily(metrics), days, today);
  const totals = metrics.appointmentWindowTotals?.[key] ?? daily.reduce(
    addAppointmentStatusCounts,
    emptyAppointmentStatusCounts(),
  );
  const precomputed = metrics.appointmentTimeseries;
  const series = days === 'all' && precomputed
    ? {
      day: precomputed.day?.length ? precomputed.day : rollupAppointmentSeries(daily).day,
      week: precomputed.week?.length ? precomputed.week : rollupAppointmentSeries(daily).week,
      month: precomputed.month?.length ? precomputed.month : rollupAppointmentSeries(daily).month,
    }
    : rollupAppointmentSeries(daily);
  return {
    totals,
    groups: groupAppointmentStatuses(totals),
    completionRate: completionRate(totals),
    series,
  };
}

export function selectOutboundWindow(metrics: WhatsAppMetrics, days: MetricsDays) {
  const key = windowKey(days);
  const windowTotals = metrics.outboundWindowTotals?.[key];
  return {
    totals: windowTotals ?? {
      sent: metrics.totalSent,
      delivered: metrics.totalDelivered,
      read: metrics.totalRead,
      failed: metrics.totalFailed,
      reachedDevice: metrics.reachedDevice,
      responses: metrics.totalResponses,
      uniqueMessaged: metrics.outboundTotals.uniqueContacts.messaged,
      uniqueResponded: metrics.outboundTotals.uniqueContacts.responded,
      responseRate: metrics.responseRate,
      rawResponseRate: metrics.rawResponseRate,
    },
    byCampaign: metrics.byCampaign,
    byTemplate: metrics.byTemplate,
    byKind: metrics.byKind,
  };
}

export function applyOutboundWindow(metrics: WhatsAppMetrics, days: MetricsDays): WhatsAppMetrics {
  const selected = selectOutboundWindow(metrics, days);
  return {
    ...metrics,
    totalSent: selected.totals.sent,
    totalDelivered: selected.totals.delivered,
    totalRead: selected.totals.read,
    totalFailed: selected.totals.failed,
    reachedDevice: selected.totals.reachedDevice,
    totalResponses: selected.totals.responses,
    responseRate: selected.totals.responseRate,
    rawResponseRate: selected.totals.rawResponseRate,
    uniqueContactsMessaged: selected.totals.uniqueMessaged,
    uniqueContactsResponded: selected.totals.uniqueResponded,
    outboundTotals: {
      messageCounts: {
        sent: selected.totals.sent,
        delivered: selected.totals.delivered,
        read: selected.totals.read,
        reachedDevice: selected.totals.reachedDevice,
        failed: selected.totals.failed,
        responsesReceived: selected.totals.responses,
      },
      uniqueContacts: {
        messaged: selected.totals.uniqueMessaged,
        responded: selected.totals.uniqueResponded,
      },
    },
  };
}
