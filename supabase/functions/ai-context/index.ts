import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  buildOpsAiContextPayload,
  parseOpsAiContextQuery,
  type OpsAiContextForecastRow,
  type OpsAiContextHiringTriggerRow,
  type OpsAiContextHolidayRow,
  type OpsAiContextPolicyRow,
} from "../_shared/opsAiContext.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";

const QUERY_DEADLINE_MS = 1_500;
const POLICY_FIELDS = [
  "policy_level",
  "level_2_enabled",
  "minimum_outcomes_for_level_3",
  "level_3_human_approved_at",
].join(",");
const FORECAST_FIELDS = [
  "forecast_date",
  "horizon_days",
  "required_minutes",
  "available_minutes",
  "shortfall_minutes",
].join(",");
const HIRING_FIELDS = [
  "id",
  "trigger_date",
  "shortfall_minutes",
  "status",
  "blocked_reason",
].join(",");

class QueryDeadlineError extends Error {
  constructor() {
    super("La consulta excedió el tiempo objetivo.");
    this.name = "QueryDeadlineError";
  }
}

function withDeadline<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new QueryDeadlineError()),
      QUERY_DEADLINE_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return strictPreflightResponse(request);
  }
  if (request.method !== "GET") {
    return strictJsonResponse(request, { error: "Método no permitido." }, 405);
  }

  let context;
  try {
    context = await requireAdmin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(
      request,
      { error: "Usuario no autenticado." },
      401,
    );
  }

  let query;
  try {
    query = parseOpsAiContextQuery(new URL(request.url));
  } catch (error) {
    return strictJsonResponse(
      request,
      {
        error: error instanceof Error ? error.message : "Parámetros inválidos.",
      },
      400,
    );
  }

  const policyQuery = context.supabase
    .from("ops_automation_policies")
    .select(POLICY_FIELDS)
    .eq("service_id", query.serviceId)
    .limit(1);
  const forecastQuery = context.supabase
    .from("ops_forecasts")
    .select(FORECAST_FIELDS)
    .eq("service_id", query.serviceId)
    .lte("forecast_date", query.targetDate)
    .order("forecast_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const hiringQuery = context.supabase
    .from("ops_hiring_triggers")
    .select(HIRING_FIELDS)
    .eq("service_id", query.serviceId)
    .in("status", ["open", "blocked"])
    .order("trigger_date", { ascending: false })
    .limit(10);
  const holidaysQuery = context.supabase
    .from("ops_holiday_calendars")
    .select("ops_holidays!inner(holiday_date,name,is_working_day)")
    .eq("service_id", query.serviceId)
    .eq("status", "active")
    .lte("valid_from", query.targetDate)
    .or(`valid_to.is.null,valid_to.gte.${query.targetDate}`)
    .eq("ops_holidays.holiday_date", query.targetDate)
    .limit(1);
  const outcomesQuery = context.supabase
    .from("ops_decision_outcomes")
    .select("id", { count: "exact", head: true })
    .eq("service_id", query.serviceId)
    .in("outcome", ["accepted", "overridden", "rejected"]);

  let results;
  const queryStartedAt = performance.now();
  try {
    results = await withDeadline(
      Promise.all([
        policyQuery,
        forecastQuery,
        hiringQuery,
        holidaysQuery,
        outcomesQuery,
      ]),
    );
  } catch (error) {
    const deadlineExceeded = error instanceof QueryDeadlineError;
    console.error("[ai-context] Bounded query failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: deadlineExceeded ? "query_deadline" : "query_error",
    });
    return strictJsonResponse(
      request,
      {
        error: deadlineExceeded
          ? "La consulta excedió el tiempo objetivo."
          : "No fue posible construir el contexto operacional.",
      },
      deadlineExceeded ? 504 : 500,
    );
  }

  const [policy, forecast, hiring, holidayCalendars, outcomes] = results;
  if (
    policy.error ||
    forecast.error ||
    hiring.error ||
    holidayCalendars.error ||
    outcomes.error
  ) {
    console.error("[ai-context] Facts query failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "facts_query_error",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible construir el contexto operacional." },
      500,
    );
  }

  const holidayRows = (holidayCalendars.data ?? []).flatMap((calendar) =>
    Array.isArray(calendar.ops_holidays) ? calendar.ops_holidays : [],
  ) as unknown as OpsAiContextHolidayRow[];
  const payload = buildOpsAiContextPayload({
    serviceId: query.serviceId,
    targetDate: query.targetDate,
    policy: (policy.data?.[0] ??
      null) as unknown as OpsAiContextPolicyRow | null,
    forecast: (forecast.data?.[0] ??
      null) as unknown as OpsAiContextForecastRow | null,
    hiringTriggers: (hiring.data ??
      []) as unknown as OpsAiContextHiringTriggerRow[],
    holidays: holidayRows,
    outcomeCount: outcomes.count ?? 0,
  });
  const response = strictJsonResponse(request, { data: payload });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set(
    "Server-Timing",
    `db;dur=${(performance.now() - queryStartedAt).toFixed(1)}`,
  );
  return response;
});
