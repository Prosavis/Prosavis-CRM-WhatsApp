import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import {
  buildCleanerCapacityPayload,
  buildOpsMetricsPayload,
  parseOpsMetricsQuery,
  type CleanerDayFactRow,
  type OpsRollupRow,
  type OpsTeamMemberRow,
} from "../_shared/opsMetrics.ts";
import {
  listMissingCommercialEnv,
  loadAgendaRuntimeConfig,
  resolveEffectiveAutomationLevel,
} from "../_shared/agenda/runtimeConfig.ts";
import { buildOpsV5Activation } from "../_shared/opsV5Readiness.ts";
import { visitsAlertConfigured } from "../_shared/visitAttentionAlert.ts";

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

const CLEANER_DAY_FIELDS = [
  "cleaner_id",
  "operational_date",
  "offered_minutes",
  "accepted_minutes",
  "sold_minutes",
  "lost_minutes",
  "recoverable_minutes",
  "orphan_minutes",
  "equivalent_days",
  "utilization",
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
  const cleanerFactsQuery = context.supabase
    .from("cleaner_day_facts")
    .select(CLEANER_DAY_FIELDS)
    .eq("service_id", range.serviceId)
    .gte("operational_date", range.from)
    .lte("operational_date", range.to);
  const membersQuery = context.supabase
    .from("crm_team_members")
    .select("id,name")
    .eq("service_id", range.serviceId)
    .eq("is_active", true);
  const payrollQuery = context.supabase
    .from("ops_v5_rating_payroll_config")
    .select("is_active")
    .eq("service_id", range.serviceId)
    .maybeSingle();
  const policyQuery = context.supabase
    .from("ops_automation_policies")
    .select("policy_level,level_2_enabled,level_3_human_approved_at")
    .eq("service_id", range.serviceId)
    .maybeSingle();

  const [current, previous, cleanerFacts, members, payroll, policy] =
    await Promise.all([
      currentQuery,
      previousQuery,
      cleanerFactsQuery,
      membersQuery,
      payrollQuery,
      policyQuery,
    ]);
  if (current.error || previous.error || cleanerFacts.error || members.error) {
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
    (current.data ?? []) as unknown as OpsRollupRow[],
    (previous.data ?? []) as unknown as OpsRollupRow[],
  );
  const envRuntime = loadAgendaRuntimeConfig();
  const activation = buildOpsV5Activation({
    automationLevel: resolveEffectiveAutomationLevel({
      envLevel: envRuntime.automationLevel,
      policyLevel: typeof policy.data?.policy_level === "number"
        ? policy.data.policy_level
        : envRuntime.automationLevel,
      level2Enabled: policy.data?.level_2_enabled === true,
      level3Approved: Boolean(policy.data?.level_3_human_approved_at),
    }),
    visitsAlertConfigured: visitsAlertConfigured(),
    payrollConfigActive: payroll.data?.is_active === true
      ? true
      : payroll.data
      ? false
      : null,
    missingCommercialEnv: listMissingCommercialEnv(),
  });
  return strictJsonResponse(request, {
    data: {
      range,
      ...payload,
      activation,
      cleaners: buildCleanerCapacityPayload(
        (cleanerFacts.data ?? []) as unknown as CleanerDayFactRow[],
        (members.data ?? []) as unknown as OpsTeamMemberRow[],
      ),
    },
  });
});
