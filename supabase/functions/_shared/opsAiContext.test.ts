import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildDecisionOutcomeRecord,
  buildOpsAiContextPayload,
  buildWeeklyDecisionDigest,
  parseDecisionOutcomeInput,
  parseOpsAiContextQuery,
} from "./opsAiContext.ts";

Deno.test("parseOpsAiContextQuery validates service and target date", () => {
  assertEquals(
    parseOpsAiContextQuery(
      new URL(
        "https://example.test/ai-context?serviceId=service-1&targetDate=2026-08-31",
      ),
    ),
    {
      serviceId: "service-1",
      targetDate: "2026-08-31",
    },
  );
  assertThrows(() =>
    parseOpsAiContextQuery(
      new URL(
        "https://example.test/ai-context?serviceId=bad/value&targetDate=2026-08-31",
      ),
    ),
  );
});

Deno.test(
  "buildOpsAiContextPayload is compact and blocks unknown config",
  () => {
    const payload = buildOpsAiContextPayload({
      serviceId: "service-1",
      targetDate: "2026-08-31",
      policy: null,
      forecast: {
        forecast_date: "2026-08-30",
        horizon_days: 30,
        required_minutes: 10_000,
        available_minutes: 8_000,
        shortfall_minutes: 2_000,
      },
      hiringTriggers: [
        {
          id: "trigger-1",
          trigger_date: "2026-08-30",
          shortfall_minutes: 2_000,
          status: "blocked",
          blocked_reason: "commercial_values_required",
        },
      ],
      holidays: [
        {
          holiday_date: "2026-08-31",
          name: "Día de prueba",
          is_working_day: false,
        },
      ],
      outcomeCount: 5,
    });

    assertEquals(payload.automation, {
      level: 1,
      mode: "suggestion",
      level2Enabled: false,
      level3: {
        eligible: false,
        observedOutcomes: 5,
        requiredOutcomes: null,
        humanApproved: false,
        blockedReasons: [
          "outcome_threshold_not_configured",
          "human_approval_required",
        ],
      },
    });
    assertEquals(payload.forecast?.shortfallMinutes, 2_000);
    assertEquals(payload.hiring[0].blockedReason, "commercial_values_required");
    assertEquals(
      Object.hasOwn(payload, "context") ||
        Object.hasOwn(payload, "rawContext") ||
        Object.hasOwn(payload, "prompt"),
      false,
    );
  },
);

Deno.test("level three eligibility needs threshold and human approval", () => {
  const payload = buildOpsAiContextPayload({
    serviceId: "service-1",
    targetDate: "2026-08-31",
    policy: {
      policy_level: 2,
      level_2_enabled: true,
      minimum_outcomes_for_level_3: 3,
      level_3_human_approved_at: "2026-08-30T12:00:00Z",
    },
    forecast: null,
    hiringTriggers: [],
    holidays: [],
    outcomeCount: 3,
  });

  assertEquals(payload.automation.level3, {
    eligible: true,
    observedOutcomes: 3,
    requiredOutcomes: 3,
    humanApproved: true,
    blockedReasons: [],
  });
});

Deno.test("decision acceptance and override records are deterministic", () => {
  const accepted = parseDecisionOutcomeInput({
    serviceId: "service-1",
    decisionId: "decision-1",
    decisionType: "assignment",
    outcome: "accepted",
  });
  assertEquals(
    buildDecisionOutcomeRecord(
      accepted,
      { kind: "firebase", uid: "admin-1" },
      new Date("2026-08-31T15:00:00Z"),
    ),
    {
      service_id: "service-1",
      decision_id: "decision-1",
      decision_type: "assignment",
      outcome: "accepted",
      override_reason: null,
      decided_by: "admin-1",
      decided_by_kind: "firebase",
      decided_at: "2026-08-31T15:00:00.000Z",
    },
  );

  assertThrows(() =>
    parseDecisionOutcomeInput({
      serviceId: "service-1",
      decisionId: "decision-2",
      decisionType: "assignment",
      outcome: "overridden",
    }),
  );
});

Deno.test("weekly digest aggregates outcomes without sensitive details", () => {
  assertEquals(
    buildWeeklyDecisionDigest([
      {
        decision_type: "assignment",
        outcome: "accepted",
        decided_at: "2026-08-25T12:00:00Z",
      },
      {
        decision_type: "assignment",
        outcome: "overridden",
        decided_at: "2026-08-26T12:00:00Z",
      },
      {
        decision_type: "hiring",
        outcome: "rejected",
        decided_at: "2026-08-27T12:00:00Z",
      },
    ]),
    {
      total: 3,
      accepted: 1,
      overridden: 1,
      rejected: 1,
      acceptanceRate: 1 / 3,
      byType: [
        {
          decisionType: "assignment",
          total: 2,
          accepted: 1,
          overridden: 1,
          rejected: 0,
        },
        {
          decisionType: "hiring",
          total: 1,
          accepted: 0,
          overridden: 0,
          rejected: 1,
        },
      ],
    },
  );
});
