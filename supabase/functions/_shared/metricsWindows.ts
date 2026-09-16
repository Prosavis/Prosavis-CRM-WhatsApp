import {
  addDaysToKey,
  bogotaDayKey,
  buildComparison,
  eachDayInclusive,
  monthKeyFromDay,
  sumCompletedInRange,
  weekKeyFromDay,
} from './completedServicesCore.ts';
import type {
  CompletedDayPoint,
  HistoricalMetricsBootstrap,
  InboundWindowTotals,
  MetricsWindowKey,
  MetricsWindowSpan,
  OutboundBucket,
  OutboundFactRow,
  OutboundWindowTotals,
  PeopleBucketPoint,
} from './metricsContract.ts';
import { METRICS_WINDOW_SPANS } from './metricsContract.ts';

export type MetricsDays = number | 'all';

export interface InboundContactDayRow {
  bucket_day: string;
  stable_key: string | null;
  first_contact_day: string | null;
  messages: number;
}

export interface PeopleBucket {
  messagesReceived: number;
  people: Set<string>;
  newPeople: Set<string>;
  existingPeople: Set<string>;
}

function emptyPeople(): PeopleBucket {
  return {
    messagesReceived: 0,
    people: new Set(),
    newPeople: new Set(),
    existingPeople: new Set(),
  };
}

function ensurePeople(map: Map<string, PeopleBucket>, key: string): PeopleBucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = emptyPeople();
    map.set(key, bucket);
  }
  return bucket;
}

export function emptyOutboundBucket(): OutboundBucket {
  return { sent: 0, delivered: 0, read: 0, failed: 0, outboundOk: 0, total: 0 };
}

export function accumulateOutbound(bucket: OutboundBucket, status: string, count: number): void {
  bucket.total += count;
  if (status === 'failed') bucket.failed += count;
  if (status === 'read') bucket.read += count;
  if (status === 'delivered') bucket.delivered += count;
  if (status === 'sent' || status === 'delivered' || status === 'read') {
    bucket.sent += count;
    bucket.outboundOk += count;
  }
}

export function serializePeopleBuckets(
  map: Map<string, PeopleBucket>,
  orderedKeys: string[],
): PeopleBucketPoint[] {
  return orderedKeys.map((key) => {
    const bucket = map.get(key);
    return {
      bucket: key,
      messagesReceived: bucket?.messagesReceived ?? 0,
      uniquePeople: bucket?.people.size ?? 0,
      newPeople: bucket?.newPeople.size ?? 0,
      existingPeople: bucket?.existingPeople.size ?? 0,
    };
  });
}

export function windowKey(days: MetricsDays): MetricsWindowKey {
  if (days === 'all') return 'all';
  return String(days) as MetricsWindowKey;
}

export function windowRange(
  days: MetricsDays,
  todayKey: string,
): { start: string; end: string } | null {
  if (days === 'all') return null;
  const span = Math.max(1, days);
  return { start: addDaysToKey(todayKey, -(span - 1)), end: todayKey };
}

export function inWindow(bucket: string, range: { start: string; end: string } | null): boolean {
  if (!range) return true;
  return bucket >= range.start && bucket <= range.end;
}

export function assembleInboundTimeseries(
  rows: InboundContactDayRow[],
  todayKey: string,
): {
  day: PeopleBucketPoint[];
  week: PeopleBucketPoint[];
  month: PeopleBucketPoint[];
  firstDay: string | null;
} {
  const byDay = new Map<string, PeopleBucket>();
  const byWeek = new Map<string, PeopleBucket>();
  const byMonth = new Map<string, PeopleBucket>();

  for (const row of rows) {
    const day = row.bucket_day?.slice(0, 10);
    if (!day) continue;
    const week = weekKeyFromDay(day);
    const month = monthKeyFromDay(day);
    const messages = Number(row.messages) || 0;
    ensurePeople(byDay, day).messagesReceived += messages;
    ensurePeople(byWeek, week).messagesReceived += messages;
    ensurePeople(byMonth, month).messagesReceived += messages;

    const stableKey = row.stable_key;
    if (!stableKey) continue;

    const classify = (map: Map<string, PeopleBucket>, key: string, kind: 'day' | 'week' | 'month') => {
      const bucket = ensurePeople(map, key);
      if (bucket.people.has(stableKey)) return;
      bucket.people.add(stableKey);
      const firstDay = row.first_contact_day?.slice(0, 10) ?? null;
      let isNew = true;
      if (firstDay) {
        if (kind === 'day') isNew = firstDay === key;
        else if (kind === 'week') isNew = weekKeyFromDay(firstDay) === key;
        else isNew = monthKeyFromDay(firstDay) === key;
      }
      if (isNew) bucket.newPeople.add(stableKey);
      else bucket.existingPeople.add(stableKey);
    };

    classify(byDay, day, 'day');
    classify(byWeek, week, 'week');
    classify(byMonth, month, 'month');
  }

  const dayKeys = [...byDay.keys()].sort();
  const firstDay = dayKeys[0] ?? null;
  const allDays = firstDay ? eachDayInclusive(firstDay, todayKey) : [todayKey];
  const allWeeks = [...new Set(allDays.map(weekKeyFromDay))].sort();
  const allMonths = [...new Set(allDays.map(monthKeyFromDay))].sort();

  return {
    day: serializePeopleBuckets(byDay, dayKeys),
    week: serializePeopleBuckets(byWeek, allWeeks),
    month: serializePeopleBuckets(byMonth, allMonths),
    firstDay,
  };
}

export function inboundTotalsForRange(
  rows: InboundContactDayRow[],
  range: { start: string; end: string } | null,
): InboundWindowTotals {
  const people = new Set<string>();
  const newPeople = new Set<string>();
  const existingPeople = new Set<string>();
  let messagesReceived = 0;

  for (const row of rows) {
    const day = row.bucket_day?.slice(0, 10);
    if (!day || !inWindow(day, range)) continue;
    messagesReceived += Number(row.messages) || 0;
    const key = row.stable_key;
    if (!key || people.has(key)) continue;
    people.add(key);
    const firstDay = row.first_contact_day?.slice(0, 10) ?? null;
    const joinedDuringPeriod =
      firstDay === null ||
      (range
        ? firstDay >= range.start && firstDay <= range.end
        : true);
    if (joinedDuringPeriod) newPeople.add(key);
    else existingPeople.add(key);
  }

  return {
    messagesReceived,
    uniquePeople: people.size,
    newPeople: newPeople.size,
    existingPeople: existingPeople.size,
  };
}

export function buildInboundWindowTotals(
  rows: InboundContactDayRow[],
  todayKey: string,
): Record<MetricsWindowKey, InboundWindowTotals> {
  const totals = {
    all: inboundTotalsForRange(rows, null),
  } as Record<MetricsWindowKey, InboundWindowTotals>;
  for (const span of METRICS_WINDOW_SPANS) {
    totals[String(span) as MetricsWindowKey] = inboundTotalsForRange(
      rows,
      windowRange(span, todayKey),
    );
  }
  return totals;
}

export function rollupOutboundFacts(
  facts: OutboundFactRow[],
  range: { start: string; end: string } | null,
): {
  byCampaign: Record<string, OutboundBucket>;
  byTemplate: Record<string, OutboundBucket>;
  byKind: { session: OutboundBucket; template: OutboundBucket };
  totals: Omit<OutboundWindowTotals, 'uniqueMessaged' | 'uniqueResponded' | 'responseRate' | 'rawResponseRate'>;
} {
  const byCampaign: Record<string, OutboundBucket> = {};
  const byTemplate: Record<string, OutboundBucket> = {};
  const byKind = { session: emptyOutboundBucket(), template: emptyOutboundBucket() };
  const totals = {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    reachedDevice: 0,
    responses: 0,
  };

  for (const fact of facts) {
    if (!inWindow(fact.bucket, range)) continue;
    const count = Number(fact.messageCount) || 0;
    if (fact.status === 'inbound') {
      totals.responses += count;
      continue;
    }
    const campaignKey = fact.campaignType || 'OTHER';
    byCampaign[campaignKey] ??= emptyOutboundBucket();
    accumulateOutbound(byCampaign[campaignKey], fact.status, count);
    if (fact.templateName) {
      byTemplate[fact.templateName] ??= emptyOutboundBucket();
      accumulateOutbound(byTemplate[fact.templateName], fact.status, count);
      accumulateOutbound(byKind.template, fact.status, count);
    } else {
      accumulateOutbound(byKind.session, fact.status, count);
    }
    if (fact.status === 'failed') totals.failed += count;
    if (fact.status === 'read') totals.read += count;
    if (fact.status === 'delivered') totals.delivered += count;
    if (fact.status === 'sent' || fact.status === 'delivered' || fact.status === 'read') {
      totals.sent += count;
    }
    if (fact.status === 'delivered' || fact.status === 'read') {
      totals.reachedDevice += count;
    }
  }

  return { byCampaign, byTemplate, byKind, totals };
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function outboundWindowFromSql(row: {
  sent?: number;
  delivered?: number;
  read?: number;
  failed?: number;
  responses?: number;
  unique_messaged?: number;
  unique_responded?: number;
}): OutboundWindowTotals {
  const sent = Number(row.sent) || 0;
  const responses = Number(row.responses) || 0;
  const uniqueMessaged = Number(row.unique_messaged) || 0;
  const uniqueResponded = Number(row.unique_responded) || 0;
  return {
    sent,
    delivered: Number(row.delivered) || 0,
    read: Number(row.read) || 0,
    failed: Number(row.failed) || 0,
    reachedDevice: (Number(row.delivered) || 0) + (Number(row.read) || 0),
    responses,
    uniqueMessaged,
    uniqueResponded,
    responseRate: percentage(uniqueResponded, uniqueMessaged),
    rawResponseRate: percentage(responses, sent),
  };
}

export function completedTotalsForRange(
  daily: CompletedDayPoint[],
  range: { start: string; end: string } | null,
): number {
  let total = 0;
  for (const point of daily) {
    if (inWindow(point.bucket, range)) total += point.completed;
  }
  return total;
}

export function buildCompletedWindowTotals(
  daily: CompletedDayPoint[],
  todayKey: string,
): Record<MetricsWindowKey, number> {
  const totals = { all: completedTotalsForRange(daily, null) } as Record<MetricsWindowKey, number>;
  for (const span of METRICS_WINDOW_SPANS) {
    totals[String(span) as MetricsWindowKey] = completedTotalsForRange(
      daily,
      windowRange(span, todayKey),
    );
  }
  return totals;
}

export function completedTimeseriesFromDaily(daily: CompletedDayPoint[], todayKey: string) {
  const byDay = new Map(daily.map((point) => [point.bucket, point.completed]));
  const firstDay = daily[0]?.bucket ?? todayKey;
  const days = eachDayInclusive(firstDay, todayKey);
  const weeks = [...new Set(days.map(weekKeyFromDay))].sort();
  const months = [...new Set(days.map(monthKeyFromDay))].sort();
  const byWeek = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const point of daily) {
    const week = weekKeyFromDay(point.bucket);
    const month = monthKeyFromDay(point.bucket);
    byWeek.set(week, (byWeek.get(week) ?? 0) + point.completed);
    byMonth.set(month, (byMonth.get(month) ?? 0) + point.completed);
  }
  return {
    day: daily.filter((point) => point.completed > 0),
    week: weeks.map((bucket) => ({ bucket, completed: byWeek.get(bucket) ?? 0 })),
    month: months.map((bucket) => ({ bucket, completed: byMonth.get(bucket) ?? 0 })),
  };
}

export function completedMetaFromDaily(
  daily: CompletedDayPoint[],
  todayKey: string,
  periodStartKey: string,
  periodEndKey: string,
  windowFromIso: string,
  windowToIso: string,
) {
  const byDay = new Map(daily.map((point) => [point.bucket, point.completed]));
  const lastCompletedDate = [...daily].reverse().find((point) => point.completed > 0)?.bucket ?? null;
  const [todayYear, todayMonth, todayDom] = todayKey.split('-').map(Number);
  const currentMonthKey = `${todayYear}-${String(todayMonth).padStart(2, '0')}`;
  const currentMonthStart = `${currentMonthKey}-01`;
  const prevMonth = new Date(Date.UTC(todayYear, todayMonth - 2, 1));
  const prevMonthKey = `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevMonthDayCount = new Date(Date.UTC(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth() + 1, 0))
    .getUTCDate();
  const prevMonthSameDom = Math.min(todayDom, prevMonthDayCount);
  const rolling30Start = addDaysToKey(todayKey, -29);
  const prev30End = addDaysToKey(rolling30Start, -1);
  const prev30Start = addDaysToKey(prev30End, -29);
  const lastClosedMonthKey = prevMonthKey;
  const prevClosed = new Date(Date.UTC(todayYear, todayMonth - 3, 1));
  const prevClosedMonthKey = `${prevClosed.getUTCFullYear()}-${String(prevClosed.getUTCMonth() + 1).padStart(2, '0')}`;

  return {
    windowMonths: 0,
    windowFrom: windowFromIso,
    windowTo: windowToIso,
    totalCompleted: completedTotalsForRange(daily, null),
    inSelectedPeriod: completedTotalsForRange(daily, { start: periodStartKey, end: periodEndKey }),
    lastCompletedDate,
    today: todayKey,
    currentMonth: currentMonthKey,
    comparisons: {
      mtd: buildComparison(
        sumCompletedInRange(byDay, currentMonthStart, todayKey),
        sumCompletedInRange(
          byDay,
          `${prevMonthKey}-01`,
          `${prevMonthKey}-${String(prevMonthSameDom).padStart(2, '0')}`,
        ),
      ),
      rolling30d: buildComparison(
        sumCompletedInRange(byDay, rolling30Start, todayKey),
        sumCompletedInRange(byDay, prev30Start, prev30End),
      ),
      lastClosedMonth: {
        month: lastClosedMonthKey,
        ...buildComparison(
          daily.filter((point) => point.bucket.startsWith(lastClosedMonthKey))
            .reduce((sum, point) => sum + point.completed, 0),
          daily.filter((point) => point.bucket.startsWith(prevClosedMonthKey))
            .reduce((sum, point) => sum + point.completed, 0),
        ),
      },
    },
  };
}

export function filterSeriesByWindow<T extends { bucket: string }>(
  series: T[] | undefined,
  days: MetricsDays,
  todayKey: string,
): T[] {
  const range = windowRange(days, todayKey);
  return (series ?? []).filter((point) => inWindow(point.bucket, range));
}

export function selectInboundWindow(
  bootstrap: Pick<HistoricalMetricsBootstrap, 'inboundTimeseries' | 'inboundWindowTotals' | 'today'>,
  days: MetricsDays,
) {
  const key = windowKey(days);
  const range = windowRange(days, bootstrap.today);
  return {
    totals: bootstrap.inboundWindowTotals[key] ?? bootstrap.inboundWindowTotals.all,
    series: {
      day: filterSeriesByWindow(bootstrap.inboundTimeseries.day, days, bootstrap.today),
      week: (bootstrap.inboundTimeseries.week ?? []).filter((point) => {
        if (!range) return true;
        return point.bucket >= weekKeyFromDay(range.start) && point.bucket <= weekKeyFromDay(range.end);
      }),
      month: (bootstrap.inboundTimeseries.month ?? []).filter((point) => {
        if (!range) return true;
        return point.bucket >= range.start.slice(0, 7) && point.bucket <= range.end.slice(0, 7);
      }),
    },
  };
}

export function selectCompletedWindow(
  bootstrap: Pick<HistoricalMetricsBootstrap, 'completedDaily' | 'completedWindowTotals' | 'today'>,
  days: MetricsDays,
) {
  const key = windowKey(days);
  return {
    total: bootstrap.completedWindowTotals[key] ?? bootstrap.completedWindowTotals.all,
    series: completedTimeseriesFromDaily(
      filterSeriesByWindow(bootstrap.completedDaily, days, bootstrap.today),
      bootstrap.today,
    ),
  };
}

export function selectOutboundWindow(
  bootstrap: Pick<
    HistoricalMetricsBootstrap,
    'outboundFacts' | 'outboundWindowTotals' | 'today' | 'byCampaign' | 'byTemplate' | 'byKind'
  >,
  days: MetricsDays,
) {
  const key = windowKey(days);
  const range = windowRange(days, bootstrap.today);
  const rolled = days === 'all'
    ? {
      byCampaign: bootstrap.byCampaign,
      byTemplate: bootstrap.byTemplate,
      byKind: bootstrap.byKind,
    }
    : rollupOutboundFacts(bootstrap.outboundFacts, range);
  return {
    ...rolled,
    totals: bootstrap.outboundWindowTotals[key] ?? bootstrap.outboundWindowTotals.all,
  };
}

export function todayBogotaKey(now = new Date()): string {
  return bogotaDayKey(now.toISOString()) ?? now.toISOString().slice(0, 10);
}

export type { MetricsWindowSpan };
