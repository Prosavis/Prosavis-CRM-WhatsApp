const SERVICE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECISION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/;
const DECISION_TYPES = new Set([
  "assignment",
  "capacity",
  "forecast",
  "hiring",
  "automation",
]);
const DECISION_OUTCOMES = new Set(["accepted", "overridden", "rejected"]);

export interface OpsAiContextPolicyRow {
  policy_level?: number | null;
  level_2_enabled?: boolean | null;
  minimum_outcomes_for_level_3?: number | null;
  level_3_human_approved_at?: string | null;
}

export interface OpsAiContextForecastRow {
  forecast_date: string;
  horizon_days: number;
  required_minutes: number;
  available_minutes: number;
  shortfall_minutes: number;
}

export interface OpsAiContextHiringTriggerRow {
  id: string;
  trigger_date: string;
  shortfall_minutes: number;
  status: string;
  blocked_reason?: string | null;
}

export interface OpsAiContextHolidayRow {
  holiday_date: string;
  name: string;
  is_working_day: boolean;
}

export interface BuildOpsAiContextInput {
  serviceId: string;
  targetDate: string;
  policy: OpsAiContextPolicyRow | null;
  forecast: OpsAiContextForecastRow | null;
  hiringTriggers: readonly OpsAiContextHiringTriggerRow[];
  holidays: readonly OpsAiContextHolidayRow[];
  outcomeCount: number;
}

export interface DecisionOutcomeInput {
  serviceId: string;
  decisionId: string;
  decisionType: string;
  outcome: "accepted" | "overridden" | "rejected";
  overrideReason: string | null;
}

export interface DecisionActor {
  kind: "firebase" | "supabase";
  uid: string;
}

export interface DecisionDigestRow {
  decision_type: string;
  outcome: string;
  decided_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} inválido.`);
  }
  return normalized;
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function bogotaIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function parseOpsAiContextQuery(url: URL): {
  serviceId: string;
  targetDate: string;
} {
  const serviceId = url.searchParams.get("serviceId")?.trim() ?? "";
  const targetDate =
    url.searchParams.get("targetDate")?.trim() ?? bogotaIsoDate();
  if (!SERVICE_PATTERN.test(serviceId)) {
    throw new Error("serviceId inválido.");
  }
  if (!isIsoDate(targetDate)) {
    throw new Error("targetDate inválido.");
  }
  return { serviceId, targetDate };
}

export function buildOpsAiContextPayload(input: BuildOpsAiContextInput) {
  const policyLevel = Number.isInteger(input.policy?.policy_level)
    ? Math.min(Math.max(Number(input.policy?.policy_level), 1), 3)
    : 1;
  const level2Enabled = input.policy?.level_2_enabled === true;
  const requiredOutcomes =
    typeof input.policy?.minimum_outcomes_for_level_3 === "number" &&
    Number.isInteger(input.policy.minimum_outcomes_for_level_3) &&
    input.policy.minimum_outcomes_for_level_3 > 0
      ? input.policy.minimum_outcomes_for_level_3
      : null;
  const humanApproved =
    typeof input.policy?.level_3_human_approved_at === "string" &&
    input.policy.level_3_human_approved_at.length > 0;
  const blockedReasons: string[] = [];
  if (requiredOutcomes === null) {
    blockedReasons.push("outcome_threshold_not_configured");
  } else if (input.outcomeCount < requiredOutcomes) {
    blockedReasons.push("insufficient_outcomes");
  }
  if (!humanApproved) blockedReasons.push("human_approval_required");

  return {
    serviceId: input.serviceId,
    targetDate: input.targetDate,
    automation: {
      level: policyLevel,
      mode:
        policyLevel === 1
          ? "suggestion"
          : policyLevel === 2
            ? "supervised_execution"
            : "approved_automation",
      level2Enabled,
      level3: {
        eligible: blockedReasons.length === 0 && level2Enabled,
        observedOutcomes: input.outcomeCount,
        requiredOutcomes,
        humanApproved,
        blockedReasons,
      },
    },
    forecast: input.forecast
      ? {
          date: input.forecast.forecast_date,
          horizonDays: input.forecast.horizon_days,
          requiredMinutes: input.forecast.required_minutes,
          availableMinutes: input.forecast.available_minutes,
          shortfallMinutes: input.forecast.shortfall_minutes,
        }
      : null,
    hiring: input.hiringTriggers.slice(0, 10).map((trigger) => ({
      id: trigger.id,
      date: trigger.trigger_date,
      shortfallMinutes: trigger.shortfall_minutes,
      status: trigger.status,
      blockedReason: trigger.blocked_reason ?? null,
    })),
    holidays: input.holidays.slice(0, 32).map((holiday) => ({
      date: holiday.holiday_date,
      name: holiday.name,
      isWorkingDay: holiday.is_working_day,
    })),
  };
}

export function parseDecisionOutcomeInput(raw: unknown): DecisionOutcomeInput {
  if (!isRecord(raw)) throw new Error("Body inválido.");
  const serviceId = requiredText(raw.serviceId, "serviceId", 128);
  const decisionId = requiredText(raw.decisionId, "decisionId", 160);
  const decisionType = requiredText(raw.decisionType, "decisionType", 40);
  const outcome = requiredText(raw.outcome, "outcome", 24);
  const overrideReason =
    typeof raw.overrideReason === "string" ? raw.overrideReason.trim() : "";

  if (!SERVICE_PATTERN.test(serviceId)) throw new Error("serviceId inválido.");
  if (!DECISION_ID_PATTERN.test(decisionId)) {
    throw new Error("decisionId inválido.");
  }
  if (!DECISION_TYPES.has(decisionType)) {
    throw new Error("decisionType inválido.");
  }
  if (!DECISION_OUTCOMES.has(outcome)) throw new Error("outcome inválido.");
  if (outcome === "overridden" && !overrideReason) {
    throw new Error("overrideReason es requerido.");
  }
  if (overrideReason.length > 500) {
    throw new Error("overrideReason demasiado largo.");
  }

  return {
    serviceId,
    decisionId,
    decisionType,
    outcome: outcome as DecisionOutcomeInput["outcome"],
    overrideReason: outcome === "overridden" ? overrideReason : null,
  };
}

export function buildDecisionOutcomeRecord(
  input: DecisionOutcomeInput,
  actor: DecisionActor,
  decidedAt: Date,
) {
  if (Number.isNaN(decidedAt.getTime())) throw new Error("Fecha inválida.");
  return {
    service_id: input.serviceId,
    decision_id: input.decisionId,
    decision_type: input.decisionType,
    outcome: input.outcome,
    override_reason: input.overrideReason,
    decided_by: actor.uid,
    decided_by_kind: actor.kind,
    decided_at: decidedAt.toISOString(),
  };
}

export function buildWeeklyDecisionDigest(rows: readonly DecisionDigestRow[]) {
  const summary = {
    total: 0,
    accepted: 0,
    overridden: 0,
    rejected: 0,
  };
  const byType = new Map<string, typeof summary>();

  for (const row of rows) {
    if (!DECISION_OUTCOMES.has(row.outcome)) continue;
    summary.total += 1;
    summary[row.outcome as keyof Omit<typeof summary, "total">] += 1;
    const current = byType.get(row.decision_type) ?? {
      total: 0,
      accepted: 0,
      overridden: 0,
      rejected: 0,
    };
    current.total += 1;
    current[row.outcome as keyof Omit<typeof current, "total">] += 1;
    byType.set(row.decision_type, current);
  }

  return {
    ...summary,
    acceptanceRate:
      summary.total === 0 ? null : summary.accepted / summary.total,
    byType: [...byType.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([decisionType, counts]) => ({ decisionType, ...counts })),
  };
}
