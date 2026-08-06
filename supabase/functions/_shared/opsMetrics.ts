export interface OpsMetricsRange {
  serviceId: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
}

export interface OpsRollupRow {
  operational_date: string;
  bookings_count?: number | null;
  completed_count?: number | null;
  sold_minutes?: number | null;
  offered_minutes?: number | null;
  accepted_minutes?: number | null;
  lost_minutes?: number | null;
  recoverable_minutes?: number | null;
  billed_cop?: number | null;
  collected_cop?: number | null;
  overdue_cop?: number | null;
  upcoming_cop?: number | null;
  contribution_before_cac_cop?: number | null;
  contribution_after_cac_cop?: number | null;
  cash_margin_cop?: number | null;
}

export interface CleanerDayFactRow {
  cleaner_id: string;
  operational_date: string;
  offered_minutes?: number | null;
  accepted_minutes?: number | null;
  sold_minutes?: number | null;
  lost_minutes?: number | null;
  recoverable_minutes?: number | null;
  orphan_minutes?: number | null;
  equivalent_days?: number | null;
  utilization?: number | null;
}

export interface OpsTeamMemberRow {
  id: string;
  name: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SERVICE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

function parseDate(value: string | null, field: string): Date {
  if (!value || !DATE_PATTERN.test(value)) {
    throw new Error(`${field} inválido`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} inválido`);
  }
  return date;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseOpsMetricsQuery(url: URL): OpsMetricsRange {
  const serviceId = url.searchParams.get("serviceId")?.trim() ?? "";
  if (!SERVICE_PATTERN.test(serviceId)) {
    throw new Error("serviceId inválido");
  }
  const fromDate = parseDate(url.searchParams.get("from"), "from");
  const toDate = parseDate(url.searchParams.get("to"), "to");
  const rangeDays =
    Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
  if (rangeDays <= 0 || rangeDays > MAX_RANGE_DAYS) {
    throw new Error("Rango de fechas inválido");
  }
  const previousTo = new Date(fromDate.getTime() - DAY_MS);
  const previousFrom = new Date(
    previousTo.getTime() - (rangeDays - 1) * DAY_MS,
  );
  return {
    serviceId,
    from: formatDate(fromDate),
    to: formatDate(toDate),
    previousFrom: formatDate(previousFrom),
    previousTo: formatDate(previousTo),
  };
}

function sum(rows: readonly OpsRollupRow[], key: keyof OpsRollupRow): number {
  return rows.reduce((total, row) => {
    const value = row[key];
    return (
      total + (typeof value === "number" && Number.isFinite(value) ? value : 0)
    );
  }, 0);
}

function comparison(current: number, previous: number) {
  const absoluteChange = current - previous;
  return {
    current,
    previous,
    absoluteChange,
    percentChange: previous === 0 ? null : (absoluteChange / previous) * 100,
  };
}

export function buildCleanerCapacityPayload(
  rows: readonly CleanerDayFactRow[],
  members: readonly OpsTeamMemberRow[],
) {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return rows
    .map((row) => ({
      ...row,
      cleaner_name: names.get(row.cleaner_id) ?? "Operaria",
    }))
    .sort(
      (left, right) =>
        left.operational_date.localeCompare(right.operational_date) ||
        left.cleaner_name.localeCompare(right.cleaner_name) ||
        left.cleaner_id.localeCompare(right.cleaner_id),
    );
}

export function buildOpsMetricsPayload(
  currentRows: readonly OpsRollupRow[],
  previousRows: readonly OpsRollupRow[] = [],
) {
  const billedCOP = sum(currentRows, "billed_cop");
  const collectedCOP = sum(currentRows, "collected_cop");
  const overdueCOP = sum(currentRows, "overdue_cop");
  const upcomingCOP = sum(currentRows, "upcoming_cop");
  const offeredMinutes = sum(currentRows, "offered_minutes");
  const acceptedMinutes = sum(currentRows, "accepted_minutes");
  const soldMinutes = sum(currentRows, "sold_minutes");

  return {
    cards: {
      billedCOP,
      collectedCOP,
      overdueCOP,
      upcomingCOP,
    },
    margin: {
      cashCOP: sum(currentRows, "cash_margin_cop"),
      contributionBeforeCacCOP: sum(currentRows, "contribution_before_cac_cop"),
      contributionAfterCacCOP: sum(currentRows, "contribution_after_cac_cop"),
    },
    capacity: {
      offeredMinutes,
      acceptedMinutes,
      soldMinutes,
      lostMinutes: sum(currentRows, "lost_minutes"),
      recoverableMinutes: sum(currentRows, "recoverable_minutes"),
      utilization: acceptedMinutes === 0 ? null : soldMinutes / acceptedMinutes,
      equivalentDays: soldMinutes / 480,
    },
    counts: {
      bookings: sum(currentRows, "bookings_count"),
      completed: sum(currentRows, "completed_count"),
    },
    comparison: {
      billedCOP: comparison(billedCOP, sum(previousRows, "billed_cop")),
      collectedCOP: comparison(
        collectedCOP,
        sum(previousRows, "collected_cop"),
      ),
    },
    daily: currentRows,
  };
}
