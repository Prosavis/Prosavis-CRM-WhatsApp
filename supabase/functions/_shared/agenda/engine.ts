import {
  buildFeatureVectorStamp,
  deterministicOptionId,
} from "./featureVector.ts";
import { applyHardFilters, windowsContainingDuration } from "./hardFilters.ts";
import { calculateMarginalCost } from "./marginalCost.ts";
import {
  buildPairRescueCandidates,
  type PairEligibleCleaner,
} from "./pairRescue.ts";
import { scoreAgendaOptions } from "./scoring.ts";
import { getTravelMinutes } from "./travelProviderV1.ts";
import type {
  AgendaEngineInput,
  AgendaEngineResult,
  AgendaFeatureVector,
  AgendaOption,
  CleanerAgendaSnapshot,
  MinuteWindow,
} from "./types.ts";

function finiteAverage(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function travelForCleaner(
  input: AgendaEngineInput,
  cleaner: CleanerAgendaSnapshot,
) {
  const previous = getTravelMinutes(
    {
      origin: cleaner.location,
      destination: input.request.destination,
      departureHour: input.request.departureHour,
      matrix: input.travelMatrix,
    },
    input.travelConfig,
  );
  const next = cleaner.nextLocation
    ? getTravelMinutes(
      {
        origin: input.request.destination,
        destination: cleaner.nextLocation,
        departureHour: input.request.departureHour,
        matrix: input.travelMatrix,
      },
      input.travelConfig,
    )
    : null;
  const totalMinutes = previous.minutes === null ||
      (next && next.minutes === null)
    ? null
    : previous.minutes + (next?.minutes ?? 0);

  return {
    previousMinutes: previous.minutes,
    nextMinutes: next ? next.minutes : 0,
    totalMinutes,
    flags: [...previous.flags, ...(next?.flags ?? [])],
  };
}

function serviceWindowsForCleaner(
  input: AgendaEngineInput,
  cleaner: CleanerAgendaSnapshot,
  durationMinutes: number,
): MinuteWindow[] {
  const travel = travelForCleaner(input, cleaner);
  if (travel.previousMinutes === null || travel.nextMinutes === null) {
    return [];
  }

  return windowsContainingDuration(
    cleaner.availableWindows,
    input.request.clientWindow,
    durationMinutes,
    {
      previousMinutes: travel.previousMinutes,
      nextMinutes: travel.nextMinutes,
    },
  );
}

function optionFromCrew(params: {
  input: AgendaEngineInput;
  cleaners: CleanerAgendaSnapshot[];
  minutesEach: number;
  startMinute: number;
  residualMinutes: number;
  mode: "single" | "composite";
  recommended: boolean;
}): AgendaOption {
  const crew = params.cleaners.map((cleaner) => {
    const cost = calculateMarginalCost(
      {
        minutes: params.minutesEach,
        alreadyWorkedThatDay: cleaner.alreadyWorkedThatDay,
      },
      params.input.costConfig,
    );
    const travel = travelForCleaner(params.input, cleaner);

    return {
      cleaner,
      cost,
      travelMinutes: travel.totalMinutes,
      flags: travel.flags,
    };
  });

  const marginalCosts = crew.map(({ cost }) => cost.costCOP);
  const travelMinutes = crew.map((member) => member.travelMinutes);
  const marginalCostTotalCOP = marginalCosts.every(
      (value): value is number => value !== null,
    )
    ? marginalCosts.reduce((sum, value) => sum + value, 0)
    : null;
  const totalTravelMinutes = travelMinutes.every(
      (value): value is number => value !== null,
    )
    ? travelMinutes.reduce((sum, value) => sum + value, 0)
    : null;

  const complianceFlags = crew.flatMap(({ cost, flags }) => [
    ...cost.flags,
    ...flags,
  ]);
  const grossRevenue = params.input.request.grossRevenueCOP;
  const otherMarginalCost = params.input.request.otherMarginalCostCOP;
  if (
    grossRevenue === undefined ||
    !Number.isFinite(grossRevenue) ||
    grossRevenue < 0
  ) {
    complianceFlags.push("missing_or_invalid_gross_revenue_cop");
  }
  if (
    otherMarginalCost === undefined ||
    !Number.isFinite(otherMarginalCost) ||
    otherMarginalCost < 0
  ) {
    complianceFlags.push("missing_or_invalid_other_marginal_cost_cop");
  }
  const marginEstimateCOP = marginalCostTotalCOP !== null &&
      grossRevenue !== undefined &&
      Number.isFinite(grossRevenue) &&
      grossRevenue >= 0 &&
      otherMarginalCost !== undefined &&
      Number.isFinite(otherMarginalCost) &&
      otherMarginalCost >= 0
    ? Math.round(grossRevenue - marginalCostTotalCOP - otherMarginalCost)
    : null;

  const featureVector: AgendaFeatureVector = {
    marginalCostCOP: marginalCostTotalCOP,
    travelMinutes: totalTravelMinutes,
    rating: finiteAverage(params.cleaners.map((cleaner) => cleaner.rating)),
    clientAffinity: finiteAverage(
      params.cleaners.map((cleaner) => cleaner.clientAffinity),
    ),
    income30dCOP: finiteAverage(
      params.cleaners.map((cleaner) => cleaner.income30dCOP),
    ),
    gapResidualMinutes: params.residualMinutes,
    roundingSlackMinutes: finiteAverage(
      params.cleaners.map((cleaner) => cleaner.roundingSlackMinutes),
    ),
  };
  const hardBlocked = crew.some(({ cost, travelMinutes: minutes }) =>
    cost.status === "blocked" || minutes === null
  );
  const cleanerIds = params.cleaners.map((cleaner) => cleaner.cleanerId);

  return {
    optionId: deterministicOptionId(
      params.mode,
      cleanerIds,
      params.startMinute,
    ),
    mode: params.mode,
    crew: crew.map(({ cleaner, cost, travelMinutes: minutes }) => ({
      cleanerId: cleaner.cleanerId,
      minutes: params.minutesEach,
      alreadyWorkedThatDay: cleaner.alreadyWorkedThatDay,
      marginalCostCOP: cost.costCOP,
      travelMinutes: minutes,
    })),
    scheduledStartMinute: params.startMinute,
    elapsedMinutes: params.minutesEach,
    cleanerMinutes: params.minutesEach * params.cleaners.length,
    score: null,
    marginEstimateCOP,
    marginalCostTotalCOP,
    totalTravelMinutes,
    featureVector,
    complianceFlags: uniqueSorted(complianceFlags),
    hardBlocked,
    recommended: params.recommended && !hardBlocked,
  };
}

function validateInput(input: AgendaEngineInput): string[] {
  const flags: string[] = [];
  if (!input.request.requestId) flags.push("request_id_missing");
  if (!input.request.specVersion) flags.push("spec_version_missing");
  if (
    !Number.isInteger(input.request.automationLevel) ||
    input.request.automationLevel < 0 ||
    input.request.automationLevel > 3
  ) {
    flags.push("automation_level_invalid");
  }
  if (
    !Number.isInteger(input.request.requiredMinutes) ||
    input.request.requiredMinutes <= 0
  ) {
    flags.push("required_minutes_invalid");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.request.operationalDate)) {
    flags.push("operational_date_invalid");
  }
  return flags;
}

export function buildAgendaOptions(
  input: AgendaEngineInput,
): AgendaEngineResult {
  const globalFlags = validateInput(input);
  const featureVectorStamp = buildFeatureVectorStamp(input);
  if (globalFlags.length > 0) {
    return {
      options: [],
      suggestedOptionId: null,
      featureVectorStamp,
      globalFlags,
    };
  }

  const evaluated = input.cleaners
    .map((cleaner) => ({
      cleaner,
      hardFilter: applyHardFilters(
        cleaner,
        input.request,
        input.compliance,
      ),
    }));
  globalFlags.push(
    ...evaluated.flatMap(({ hardFilter }) =>
      hardFilter.eligible ? [] : hardFilter.flags
    ),
  );
  const eligible = evaluated
    .filter(({ hardFilter }) => hardFilter.eligible)
    .sort((a, b) => a.cleaner.cleanerId.localeCompare(b.cleaner.cleanerId));

  const singleOptions = eligible.flatMap(({ cleaner }) => {
    const unbufferedWindows = windowsContainingDuration(
      cleaner.availableWindows,
      input.request.clientWindow,
      input.request.requiredMinutes,
    );
    const windows = serviceWindowsForCleaner(
      input,
      cleaner,
      input.request.requiredMinutes,
    );
    const bestWindow = windows[0];
    if (!bestWindow && unbufferedWindows.length > 0) {
      globalFlags.push("insufficient_window_including_travel");
    }
    if (!bestWindow) return [];
    return [
      optionFromCrew({
        input,
        cleaners: [cleaner],
        minutesEach: input.request.requiredMinutes,
        startMinute: bestWindow.startMinute,
        residualMinutes: bestWindow.endMinute - bestWindow.startMinute -
          input.request.requiredMinutes,
        mode: "single",
        recommended: true,
      }),
    ];
  });
  const hasViableSingle = singleOptions.some((option) => !option.hardBlocked);

  let compositeOptions: AgendaOption[] = [];
  const compositeMinutes = input.request.compositeMemberMinutes;
  if (
    compositeMinutes !== undefined &&
    Number.isInteger(compositeMinutes) &&
    compositeMinutes > 0 &&
    compositeMinutes * 2 === input.request.requiredMinutes
  ) {
    const pairEligible: PairEligibleCleaner[] = eligible.map(({ cleaner }) => ({
      cleaner,
      windows: serviceWindowsForCleaner(
        input,
        cleaner,
        compositeMinutes,
      ),
    })).filter(({ windows }) => windows.length > 0);
    const byId = new Map(
      pairEligible.map(({ cleaner }) => [cleaner.cleanerId, cleaner]),
    );
    compositeOptions = buildPairRescueCandidates(
      pairEligible,
      compositeMinutes,
    ).map((pair) =>
      optionFromCrew({
        input,
        cleaners: pair.cleanerIds.map((cleanerId) => {
          const cleaner = byId.get(cleanerId);
          if (!cleaner) throw new Error("pair_cleaner_missing");
          return cleaner;
        }),
        minutesEach: compositeMinutes,
        startMinute: pair.startMinute,
        residualMinutes: pair.residualMinutes,
        mode: "composite",
        recommended: !hasViableSingle,
      })
    );
  } else if (compositeMinutes !== undefined) {
    globalFlags.push("composite_minutes_invalid");
  }

  const scored = scoreAgendaOptions(
    [...singleOptions, ...compositeOptions],
    input.weights,
  );
  globalFlags.push(...scored.flags);
  const options = scored.options.sort((a, b) => {
    if (hasViableSingle && a.mode !== b.mode) {
      return a.mode === "single" ? -1 : 1;
    }
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    const scoreDifference = (b.score ?? -1) - (a.score ?? -1);
    return scoreDifference || a.optionId.localeCompare(b.optionId);
  });
  const suggested = options.find((option) =>
    option.recommended && !option.hardBlocked && option.score !== null
  );

  return {
    options,
    suggestedOptionId: suggested?.optionId ?? null,
    featureVectorStamp,
    globalFlags: uniqueSorted(globalFlags),
  };
}
