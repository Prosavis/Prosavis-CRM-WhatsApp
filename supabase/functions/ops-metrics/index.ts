import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import {
  buildOpsMetricsPayload,
  parseOpsMetricsQuery,
  type OpsRollupRow,
} from "../_shared/opsMetrics.ts";

const ROLLUP_FIELDS = [
  "operational_date",
  "bookings_count",
  "completed_count",
  "sold_minutes",
  "offered_minutes",
  "accepted_minutes",
  "lost_minutes",
  "recoverable_minutes",
  "billed_cop",
  "collected_cop",
  "overdue_cop",
  "upcoming_cop",
  "contribution_before_cac_cop",
  "contribution_after_cac_cop",
  "cash_margin_cop",
].join(",");

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

  let range;
  try {
    range = parseOpsMetricsQuery(new URL(request.url));
  } catch (error) {
    return strictJsonResponse(
      request,
      {
        error: error instanceof Error ? error.message : "Parámetros inválidos.",
      },
      400,
    );
  }

  const currentQuery = context.supabase
    .from("daily_ops_rollup")
    .select(ROLLUP_FIELDS)
    .eq("service_id", range.serviceId)
    .gte("operational_date", range.from)
    .lte("operational_date", range.to)
    .order("operational_date", { ascending: true });
  const previousQuery = context.supabase
    .from("daily_ops_rollup")
    .select(ROLLUP_FIELDS)
    .eq("service_id", range.serviceId)
    .gte("operational_date", range.previousFrom)
    .lte("operational_date", range.previousTo)
    .order("operational_date", { ascending: true });

  const [current, previous] = await Promise.all([currentQuery, previousQuery]);
  if (current.error || previous.error) {
    console.error("[ops-metrics] Query failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "facts_query_error",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible consultar las métricas." },
      500,
    );
  }

  const payload = buildOpsMetricsPayload(
    (current.data ?? []) as OpsRollupRow[],
    (previous.data ?? []) as OpsRollupRow[],
  );
  return strictJsonResponse(request, {
    data: {
      range,
      ...payload,
    },
  });
});
