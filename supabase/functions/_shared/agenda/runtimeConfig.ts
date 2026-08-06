import type { AgendaRuntimeConfig } from "./api.ts";
import type { AgendaEngineWeights } from "./types.ts";

function optionalNumber(name: string): number | undefined {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(name: string): boolean | undefined {
  const raw = Deno.env.get(name)?.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function configuredWeights(): AgendaEngineWeights {
  const empty: AgendaEngineWeights = {
    marginalCost: 0,
    travelMinutes: 0,
    rating: 0,
    clientAffinity: 0,
    incomeEquity: 0,
    gapFit: 0,
  };
  const raw = Deno.env.get("OPS_V5_ENGINE_WEIGHTS")?.trim();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<AgendaEngineWeights>;
    return {
      marginalCost: Number(parsed.marginalCost),
      travelMinutes: Number(parsed.travelMinutes),
      rating: Number(parsed.rating),
      clientAffinity: Number(parsed.clientAffinity),
      incomeEquity: Number(parsed.incomeEquity),
      gapFit: Number(parsed.gapFit),
    };
  } catch {
    return empty;
  }
}

export function loadAgendaRuntimeConfig(): AgendaRuntimeConfig {
  const automationLevel = optionalNumber("OPS_V5_AUTOMATION_LEVEL");
  return {
    specVersion: Deno.env.get("OPS_V5_SPEC_VERSION")?.trim() || "5.0.0",
    automationLevel:
      automationLevel !== undefined && Number.isInteger(automationLevel)
        ? automationLevel
        : 1,
    compliance: {
      criticalEquivalentDays: optionalNumber(
        "OPS_V5_CRITICAL_EQUIVALENT_DAYS",
      ),
      rcInsurancePolicyActive: optionalBoolean(
        "OPS_V5_RC_INSURANCE_POLICY_ACTIVE",
      ),
    },
    costConfig: {
      hourlyNetCOP: optionalNumber("OPS_V5_LABOR_HOURLY_COP"),
      dailyFloorCOP: optionalNumber("OPS_V5_LABOR_DAILY_FLOOR_COP"),
      employerCostMultiplier: optionalNumber(
        "OPS_V5_EMPLOYER_COST_MULTIPLIER",
      ),
      transportPerVisitCOP: optionalNumber(
        "OPS_V5_TRANSPORT_PER_VISIT_COP",
      ),
      version: Deno.env.get("OPS_V5_LABOR_CONFIG_VERSION")?.trim() ||
        "unconfigured",
    },
    travelConfig: {
      learnedSampleThreshold: optionalNumber(
        "OPS_V5_TRAVEL_LEARNED_SAMPLE_THRESHOLD",
      ),
      fallbackUrbanKmh: optionalNumber("OPS_V5_TRAVEL_FALLBACK_URBAN_KMH"),
      minimumFallbackMinutes: optionalNumber(
        "OPS_V5_TRAVEL_MINIMUM_FALLBACK_MINUTES",
      ),
      ewmaAlpha: optionalNumber("OPS_V5_TRAVEL_EWMA_ALPHA"),
      version: Deno.env.get("OPS_V5_TRAVEL_CONFIG_VERSION")?.trim() ||
        "unconfigured",
    },
    weights: configuredWeights(),
  };
}
