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

const COMMERCIAL_ENV_KEYS = [
  "OPS_V5_LABOR_HOURLY_COP",
  "OPS_V5_LABOR_DAILY_FLOOR_COP",
  "OPS_V5_EMPLOYER_COST_MULTIPLIER",
  "OPS_V5_TRANSPORT_PER_VISIT_COP",
  "OPS_V5_TRAVEL_FALLBACK_URBAN_KMH",
  "OPS_V5_TRAVEL_MINIMUM_FALLBACK_MINUTES",
  "OPS_V5_ENGINE_WEIGHTS",
] as const;

export interface AutomationPolicySnapshot {
  envLevel: number;
  policyLevel?: number | null;
  level2Enabled?: boolean | null;
  level3Approved?: boolean | null;
}

function envFlagEnabled(name: string): boolean {
  return optionalBoolean(name) === true;
}

function requestedAutomationLevel(): number {
  const automationLevel = optionalNumber("OPS_V5_AUTOMATION_LEVEL");
  if (
    automationLevel === undefined ||
    !Number.isInteger(automationLevel) ||
    automationLevel < 1 ||
    automationLevel > 3
  ) {
    return 1;
  }
  return automationLevel;
}

export function resolveEffectiveAutomationLevel(
  input: AutomationPolicySnapshot,
): number {
  const envLevel = Number.isInteger(input.envLevel) &&
      input.envLevel >= 1 &&
      input.envLevel <= 3
    ? input.envLevel
    : 1;
  const policyLevel = Number.isInteger(input.policyLevel)
    ? Number(input.policyLevel)
    : envLevel;
  let level = Math.min(envLevel, policyLevel);
  if (level >= 3 && input.level3Approved !== true) {
    level = 2;
  }
  if (level >= 2 && input.level2Enabled !== true) {
    level = 1;
  }
  return level;
}

export function listMissingCommercialEnv(): string[] {
  return COMMERCIAL_ENV_KEYS.filter((key) => {
    const raw = Deno.env.get(key)?.trim();
    if (!raw) return true;
    if (key !== "OPS_V5_ENGINE_WEIGHTS") return false;
    const weights = configuredWeights();
    return weights.marginalCost +
        weights.travelMinutes +
        weights.rating +
        weights.clientAffinity +
        weights.incomeEquity +
        weights.gapFit <= 0;
  });
}

export function loadAgendaRuntimeConfig(): AgendaRuntimeConfig {
  const requested = requestedAutomationLevel();
  return {
    specVersion: Deno.env.get("OPS_V5_SPEC_VERSION")?.trim() || "5.0.0",
    automationLevel: resolveEffectiveAutomationLevel({
      envLevel: requested,
      policyLevel: requested,
      level2Enabled: envFlagEnabled("OPS_V5_AUTOMATION_LEVEL_2_APPROVED"),
      level3Approved: envFlagEnabled("OPS_V5_AUTOMATION_LEVEL_3_APPROVED"),
    }),
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
