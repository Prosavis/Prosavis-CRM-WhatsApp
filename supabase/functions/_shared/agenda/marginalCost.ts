import type { MarginalCostConfig } from "./types.ts";

export interface MarginalCostInput {
  minutes: number;
  alreadyWorkedThatDay: boolean;
}

export interface MarginalCostResult {
  status: "ready" | "blocked";
  costCOP: number | null;
  flags: string[];
}

function requiredPositive(
  value: number | undefined,
  missingFlag: string,
  invalidFlag: string,
  flags: string[],
): value is number {
  if (value === undefined) {
    flags.push(missingFlag);
    return false;
  }
  if (!Number.isFinite(value) || value < 0) {
    flags.push(invalidFlag);
    return false;
  }
  return true;
}

export function calculateMarginalCost(
  input: MarginalCostInput,
  config: MarginalCostConfig,
): MarginalCostResult {
  const flags: string[] = [];
  const hourlyReady = requiredPositive(
    config.hourlyNetCOP,
    "missing_hourly_net_cop",
    "invalid_hourly_net_cop",
    flags,
  );
  const floorReady = requiredPositive(
    config.dailyFloorCOP,
    "missing_daily_floor_cop",
    "invalid_daily_floor_cop",
    flags,
  );
  const multiplierReady = requiredPositive(
    config.employerCostMultiplier,
    "missing_employer_cost_multiplier",
    "invalid_employer_cost_multiplier",
    flags,
  );
  const transportReady = requiredPositive(
    config.transportPerVisitCOP,
    "missing_transport_per_visit_cop",
    "invalid_transport_per_visit_cop",
    flags,
  );

  if (
    !Number.isInteger(input.minutes) ||
    input.minutes <= 0
  ) {
    flags.push("invalid_assigned_minutes");
  }

  if (
    !hourlyReady ||
    !floorReady ||
    !multiplierReady ||
    !transportReady ||
    flags.length > 0
  ) {
    return { status: "blocked", costCOP: null, flags };
  }

  const readyConfig = config as Required<MarginalCostConfig>;
  const hourlyNet = (input.minutes / 60) * readyConfig.hourlyNetCOP;
  const netLabor = input.alreadyWorkedThatDay
    ? hourlyNet
    : Math.max(hourlyNet, readyConfig.dailyFloorCOP);
  const costCOP = Math.round(
    netLabor * readyConfig.employerCostMultiplier +
      readyConfig.transportPerVisitCOP,
  );

  return { status: "ready", costCOP, flags: [] };
}
