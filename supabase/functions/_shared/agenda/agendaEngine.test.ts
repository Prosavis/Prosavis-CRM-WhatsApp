import { assert, assertEquals } from "jsr:@std/assert";
import { buildAgendaOptions } from "./engine.ts";
import { calculateMarginalCost } from "./marginalCost.ts";
import {
  applyTravelObservation,
  getTravelMinutes,
} from "./travelProviderV1.ts";

const COST_CONFIG = {
  hourlyNetCOP: 10_000,
  dailyFloorCOP: 50_000,
  employerCostMultiplier: 1.5,
  transportPerVisitCOP: 8_000,
  version: "labor-test-v1",
};

const WEIGHTS = {
  marginalCost: 0.25,
  travelMinutes: 0.2,
  rating: 0.15,
  clientAffinity: 0.15,
  incomeEquity: 0.15,
  gapFit: 0.1,
};

const TRAVEL_CONFIG = {
  learnedSampleThreshold: 3,
  fallbackUrbanKmh: 18,
  minimumFallbackMinutes: 10,
  ewmaAlpha: 0.2,
  version: "travel-test-v1",
};

const BASE_INPUT = {
  request: {
    requestId: "10000000-0000-0000-0000-000000000001",
    specVersion: "5.0.0",
    automationLevel: 1,
    operationalDate: "2026-08-07",
    requiredMinutes: 480,
    compositeMemberMinutes: 240,
    clientWindow: { startMinute: 8 * 60, endMinute: 16 * 60 },
    serviceType: "standard",
    requiresAlturas: false,
    grossRevenueCOP: 148_000,
    destination: {
      comuna: "Centro",
      lat: 4.814,
      lng: -75.694,
    },
    departureHour: 8,
  },
  compliance: {
    criticalEquivalentDays: 18,
    rcInsurancePolicyActive: true,
  },
  costConfig: COST_CONFIG,
  travelConfig: TRAVEL_CONFIG,
  weights: WEIGHTS,
  travelMatrix: [],
};

function cleaner(
  cleanerId: string,
  endMinute: number,
  extra: Record<string, unknown> = {},
) {
  return {
    cleanerId,
    active: true,
    acceptsComposite: true,
    serviceSkills: ["standard"],
    equivalentDays: 8,
    alreadyWorkedThatDay: true,
    availableWindows: [{ startMinute: 8 * 60, endMinute }],
    location: {
      comuna: "Cuba",
      lat: 4.805,
      lng: -75.72,
    },
    rating: 4.7,
    clientAffinity: 0.8,
    income30dCOP: 900_000,
    ...extra,
  };
}

Deno.test("missing commercial cost inputs block instead of inventing values", () => {
  const result = calculateMarginalCost(
    {
      minutes: 240,
      alreadyWorkedThatDay: false,
    },
    {
      hourlyNetCOP: undefined,
      dailyFloorCOP: undefined,
      employerCostMultiplier: undefined,
      transportPerVisitCOP: undefined,
      version: "missing",
    },
  );

  assertEquals(result.status, "blocked");
  assertEquals(result.costCOP, null);
  assertEquals(result.flags.sort(), [
    "missing_daily_floor_cop",
    "missing_employer_cost_multiplier",
    "missing_hourly_net_cop",
    "missing_transport_per_visit_cop",
  ]);
});

Deno.test("two overlapping four-hour cleaners rescue T8 when no single exists", () => {
  const bufferedWindow = [{
    startMinute: 7 * 60 + 30,
    endMinute: 12 * 60 + 30,
  }];
  const result = buildAgendaOptions({
    ...BASE_INPUT,
    cleaners: [
      cleaner("ana", 12 * 60 + 30, { availableWindows: bufferedWindow }),
      cleaner("bea", 12 * 60 + 30, { availableWindows: bufferedWindow }),
    ],
  });

  assertEquals(result.options.length, 1);
  assertEquals(result.options[0].mode, "composite");
  assertEquals(result.options[0].crew.map((member) => member.cleanerId), [
    "ana",
    "bea",
  ]);
  assertEquals(result.options[0].elapsedMinutes, 240);
  assertEquals(result.options[0].cleanerMinutes, 480);
  assertEquals(result.options[0].recommended, true);
  assertEquals(result.suggestedOptionId, result.options[0].optionId);
});

Deno.test("a viable single is sorted first and pair rescue is not recommended", () => {
  const singleWindow = [{
    startMinute: 7 * 60 + 30,
    endMinute: 16 * 60 + 30,
  }];
  const pairWindow = [{
    startMinute: 7 * 60 + 30,
    endMinute: 12 * 60 + 30,
  }];
  const result = buildAgendaOptions({
    ...BASE_INPUT,
    cleaners: [
      cleaner("ana", 16 * 60 + 30, { availableWindows: singleWindow }),
      cleaner("bea", 12 * 60 + 30, { availableWindows: pairWindow }),
      cleaner("carla", 12 * 60 + 30, { availableWindows: pairWindow }),
    ],
  });

  assertEquals(result.options[0].mode, "single");
  assertEquals(result.options[0].crew[0].cleanerId, "ana");
  assertEquals(
    result.options
      .filter((option) => option.mode === "composite")
      .every((option) => !option.recommended),
    true,
  );
});

Deno.test("travel provider uses learned matrix and configurable fallback", () => {
  const learned = getTravelMinutes(
    {
      origin: { comuna: "Cuba" },
      destination: { comuna: "Centro" },
      departureHour: 8,
      matrix: [{
        originComuna: "Cuba",
        destinationComuna: "Centro",
        hourBucket: 8,
        minutesEstimate: 27,
        sampleCount: 3,
      }],
    },
    TRAVEL_CONFIG,
  );
  assertEquals(learned, {
    status: "ready",
    minutes: 27,
    source: "matrix_learned",
    flags: [],
  });

  const fallback = getTravelMinutes(
    {
      origin: { comuna: "Cuba", lat: 4.805, lng: -75.72 },
      destination: { comuna: "Centro", lat: 4.814, lng: -75.694 },
      departureHour: 8,
      matrix: [],
    },
    TRAVEL_CONFIG,
  );
  assertEquals(fallback.status, "ready");
  assertEquals(fallback.source, "haversine");
  assert((fallback.minutes ?? 0) >= 10);
});

Deno.test("travel EWMA uses supplied alpha and increments samples", () => {
  assertEquals(
    applyTravelObservation(
      { minutesEstimate: 30, sampleCount: 1 },
      50,
      0.2,
    ),
    { minutesEstimate: 34, sampleCount: 2 },
  );
});

Deno.test("same input creates deterministic ordering and feature stamps", () => {
  const input = {
    ...BASE_INPUT,
    cleaners: [cleaner("bea", 12 * 60), cleaner("ana", 12 * 60)],
  };
  const first = buildAgendaOptions(input);
  const second = buildAgendaOptions(input);

  assertEquals(first, second);
  assertEquals(first.featureVectorStamp, {
    specVersion: "5.0.0",
    automationLevel: 1,
    engineWeights: WEIGHTS,
    costConfigVersion: "labor-test-v1",
    travelConfigVersion: "travel-test-v1",
  });
});

Deno.test("an exact service gap is rejected when travel does not fit", () => {
  const result = buildAgendaOptions({
    ...BASE_INPUT,
    cleaners: [cleaner("ana", 16 * 60)],
  });

  assertEquals(result.options, []);
  assertEquals(result.suggestedOptionId, null);
  assert(result.globalFlags.includes("insufficient_window_including_travel"));
});

Deno.test("travel buffers shift service inside the cleaner availability", () => {
  const result = buildAgendaOptions({
    ...BASE_INPUT,
    cleaners: [
      cleaner("ana", 16 * 60 + 30, {
        availableWindows: [{
          startMinute: 7 * 60 + 30,
          endMinute: 16 * 60 + 30,
        }],
        roundingSlackMinutes: 30,
      }),
    ],
  });

  assertEquals(result.options.length, 1);
  assertEquals(result.options[0].scheduledStartMinute, 8 * 60);
  assertEquals(result.options[0].elapsedMinutes, 480);
});

Deno.test("incomplete productive vector stays visible but is not recommended", () => {
  const result = buildAgendaOptions({
    ...BASE_INPUT,
    request: {
      ...BASE_INPUT.request,
      requiredMinutes: 120,
      compositeMemberMinutes: undefined,
      clientWindow: { startMinute: 8 * 60, endMinute: 12 * 60 },
    },
    cleaners: [
      cleaner("ana", 13 * 60, {
        rating: undefined,
        clientAffinity: undefined,
        income30dCOP: undefined,
      }),
    ],
  });

  assertEquals(result.options.length, 1);
  assertEquals(result.options[0].score, null);
  assertEquals(result.options[0].recommended, false);
  assert(
    result.options[0].complianceFlags.includes(
      "incomplete_productivity_vector",
    ),
  );
  assertEquals(result.suggestedOptionId, null);
});
