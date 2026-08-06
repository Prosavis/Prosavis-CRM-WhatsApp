import { assertEquals, assertMatch } from "jsr:@std/assert";
import { buildVisitRoute, type VisitCandidate } from "./visitPrioritization.ts";

const NOW = new Date("2026-08-06T15:00:00.000Z");

function candidate(
  overrides: Partial<VisitCandidate> & Pick<VisitCandidate, "clientReference">,
): VisitCandidate {
  return {
    clientReference: overrides.clientReference,
    displayName: overrides.displayName ?? overrides.clientReference,
    quality: overrides.quality ?? "standard",
    lifetimeValueCop: overrides.lifetimeValueCop ?? 0,
    riskScore: overrides.riskScore ?? 0,
    openComplaint: overrides.openComplaint ?? false,
    optOut: overrides.optOut ?? false,
    lastVisitAt: overrides.lastVisitAt ?? null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
  };
}

Deno.test("open complaint escalates today even when quota and cooldown are full", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "complaint-client",
        openComplaint: true,
        lastVisitAt: "2026-08-05T15:00:00.000Z",
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 2,
      completedThisWeek: 2,
      cooldownDays: 30,
    },
  );

  assertEquals(result.effectiveQuota, 0);
  assertEquals(result.stops.length, 1);
  assertEquals(result.stops[0].clientReference, "complaint-client");
  assertEquals(result.stops[0].scheduledFor, "2026-08-06");
  assertMatch(result.stops[0].reasons.join(" "), /Queja abierta/);
});

Deno.test("opt-out excludes a client even when there is an open complaint", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "opted-out",
        openComplaint: true,
        optOut: true,
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 10,
      completedThisWeek: 0,
      cooldownDays: 30,
    },
  );

  assertEquals(result.stops, []);
  assertEquals(result.excluded, [
    {
      clientReference: "opted-out",
      reason: "Cliente excluido por opt-out.",
    },
  ]);
});

Deno.test("normal candidates use effective quota and quality then value then risk", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "good-high-value",
        quality: "good",
        lifetimeValueCop: 900_000,
        riskScore: 90,
      }),
      candidate({
        clientReference: "bad-low-value",
        quality: "bad",
        lifetimeValueCop: 100_000,
        riskScore: 20,
      }),
      candidate({
        clientReference: "bad-high-value-low-risk",
        quality: "bad",
        lifetimeValueCop: 500_000,
        riskScore: 10,
      }),
      candidate({
        clientReference: "bad-high-value-high-risk",
        quality: "bad",
        lifetimeValueCop: 500_000,
        riskScore: 80,
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 4,
      completedThisWeek: 1,
      cooldownDays: 30,
    },
  );

  assertEquals(result.effectiveQuota, 3);
  assertEquals(
    result.stops.map((stop) => stop.clientReference),
    [
      "bad-high-value-high-risk",
      "bad-high-value-low-risk",
      "bad-low-value",
    ],
  );
});

Deno.test("cooldown excludes recent normal visits", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "recent",
        lastVisitAt: "2026-07-20T15:00:00.000Z",
      }),
      candidate({
        clientReference: "eligible",
        lastVisitAt: "2026-06-01T15:00:00.000Z",
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 5,
      completedThisWeek: 0,
      cooldownDays: 30,
    },
  );

  assertEquals(
    result.stops.map((stop) => stop.clientReference),
    ["eligible"],
  );
  assertMatch(result.excluded[0].reason, /cooldown/i);
});

Deno.test("equal-priority candidates route nearest to the starting point", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "far",
        quality: "standard",
        lifetimeValueCop: 100_000,
        riskScore: 10,
        latitude: 6.30,
        longitude: -75.60,
      }),
      candidate({
        clientReference: "near",
        quality: "standard",
        lifetimeValueCop: 100_000,
        riskScore: 10,
        latitude: 6.245,
        longitude: -75.575,
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 5,
      completedThisWeek: 0,
      cooldownDays: 30,
      start: { latitude: 6.244, longitude: -75.574 },
    },
  );

  assertEquals(
    result.stops.map((stop) => stop.clientReference),
    ["near", "far"],
  );
});
