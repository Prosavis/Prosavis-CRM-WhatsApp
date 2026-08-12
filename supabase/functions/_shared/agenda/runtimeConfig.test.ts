import { assertEquals } from "jsr:@std/assert";
import {
  listMissingCommercialEnv,
  loadAgendaRuntimeConfig,
  resolveEffectiveAutomationLevel,
} from "./runtimeConfig.ts";

function withEnv(
  vars: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("automation defaults to suggestion mode without inventing level 2/3", () => {
  withEnv({
    OPS_V5_AUTOMATION_LEVEL: undefined,
    OPS_V5_AUTOMATION_LEVEL_2_APPROVED: undefined,
    OPS_V5_AUTOMATION_LEVEL_3_APPROVED: undefined,
  }, () => {
    assertEquals(loadAgendaRuntimeConfig().automationLevel, 1);
  });
});

Deno.test("env level 2/3 stays at 1 until approval flags exist", () => {
  withEnv({
    OPS_V5_AUTOMATION_LEVEL: "3",
    OPS_V5_AUTOMATION_LEVEL_2_APPROVED: undefined,
    OPS_V5_AUTOMATION_LEVEL_3_APPROVED: undefined,
  }, () => {
    assertEquals(loadAgendaRuntimeConfig().automationLevel, 1);
  });

  withEnv({
    OPS_V5_AUTOMATION_LEVEL: "2",
    OPS_V5_AUTOMATION_LEVEL_2_APPROVED: "true",
    OPS_V5_AUTOMATION_LEVEL_3_APPROVED: undefined,
  }, () => {
    assertEquals(loadAgendaRuntimeConfig().automationLevel, 2);
  });
});

Deno.test("database policy cannot raise automation above approved env level", () => {
  assertEquals(
    resolveEffectiveAutomationLevel({
      envLevel: 1,
      policyLevel: 3,
      level2Enabled: true,
      level3Approved: true,
    }),
    1,
  );
  assertEquals(
    resolveEffectiveAutomationLevel({
      envLevel: 3,
      policyLevel: 2,
      level2Enabled: true,
      level3Approved: true,
    }),
    2,
  );
  assertEquals(
    resolveEffectiveAutomationLevel({
      envLevel: 2,
      policyLevel: 2,
      level2Enabled: false,
      level3Approved: false,
    }),
    1,
  );
});

Deno.test("missing commercial env lists keys instead of inventing values", () => {
  withEnv({
    OPS_V5_LABOR_HOURLY_COP: undefined,
    OPS_V5_LABOR_DAILY_FLOOR_COP: undefined,
    OPS_V5_EMPLOYER_COST_MULTIPLIER: undefined,
    OPS_V5_TRANSPORT_PER_VISIT_COP: undefined,
    OPS_V5_TRAVEL_FALLBACK_URBAN_KMH: undefined,
    OPS_V5_TRAVEL_MINIMUM_FALLBACK_MINUTES: undefined,
    OPS_V5_ENGINE_WEIGHTS: undefined,
  }, () => {
    assertEquals(listMissingCommercialEnv(), [
      "OPS_V5_LABOR_HOURLY_COP",
      "OPS_V5_LABOR_DAILY_FLOOR_COP",
      "OPS_V5_EMPLOYER_COST_MULTIPLIER",
      "OPS_V5_TRANSPORT_PER_VISIT_COP",
      "OPS_V5_TRAVEL_FALLBACK_URBAN_KMH",
      "OPS_V5_TRAVEL_MINIMUM_FALLBACK_MINUTES",
      "OPS_V5_ENGINE_WEIGHTS",
    ]);
  });
});
