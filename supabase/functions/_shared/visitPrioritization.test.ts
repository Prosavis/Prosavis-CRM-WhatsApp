import { assertEquals, assertMatch } from "jsr:@std/assert";
import {
  applyDeviceOriginToDraftStops,
  buildVisitRoute,
  normalizeDraftStops,
  type VisitCandidate,
  type VisitRouteStop,
} from "./visitPrioritization.ts";

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
    latitude: overrides.latitude ?? 4.6097,
    longitude: overrides.longitude ?? -74.0817,
    geoQuality: overrides.geoQuality,
    visitNeed: overrides.visitNeed,
    visitReasons: overrides.visitReasons,
    pendingReply: overrides.pendingReply,
    recentServiceAt: overrides.recentServiceAt,
    urgency: overrides.urgency,
    grokDecision: overrides.grokDecision,
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
        visitNeed: "recommended",
      }),
      candidate({
        clientReference: "eligible",
        lastVisitAt: "2026-06-01T15:00:00.000Z",
        visitNeed: "recommended",
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
        visitNeed: "recommended",
      }),
      candidate({
        clientReference: "near",
        quality: "standard",
        lifetimeValueCop: 100_000,
        riskScore: 10,
        latitude: 6.245,
        longitude: -75.575,
        visitNeed: "recommended",
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

Deno.test("missing or ambiguous geo is excluded with a visible reason", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "no-geo",
        latitude: null,
        longitude: null,
        geoQuality: "missing",
      }),
      candidate({
        clientReference: "ambiguous",
        latitude: 4.6,
        longitude: -74.08,
        geoQuality: "ambiguous",
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 8,
      completedThisWeek: 0,
      cooldownDays: 30,
    },
  );

  assertEquals(result.stops, []);
  assertMatch(result.excluded[0].reason, /Geocodificación|Dirección/);
});

Deno.test("visitNeed none stays out while recommended beats optional", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "skip",
        visitNeed: "none",
      }),
      candidate({
        clientReference: "later",
        visitNeed: "optional",
        lifetimeValueCop: 10,
      }),
      candidate({
        clientReference: "first",
        visitNeed: "recommended",
        lifetimeValueCop: 1,
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 8,
      completedThisWeek: 0,
      cooldownDays: 30,
    },
  );

  assertEquals(
    result.stops.map((stop) => stop.clientReference),
    ["first"],
  );
  assertMatch(result.excluded.map((item) => item.reason).join(" "), /no recomienda|Opcional/);
});

Deno.test("travel times replace euclidean when provided", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "near-but-slow",
        quality: "standard",
        lifetimeValueCop: 100_000,
        riskScore: 10,
        latitude: 6.245,
        longitude: -75.575,
        visitNeed: "recommended",
      }),
      candidate({
        clientReference: "far-but-fast",
        quality: "standard",
        lifetimeValueCop: 100_000,
        riskScore: 10,
        latitude: 6.30,
        longitude: -75.60,
        visitNeed: "recommended",
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 5,
      completedThisWeek: 0,
      cooldownDays: 30,
      start: { latitude: 6.244, longitude: -75.574 },
      travelTimeSeconds: (_from, to) => (to.latitude > 6.27 ? 60 : 900),
    },
  );

  assertEquals(
    result.stops.map((stop) => stop.clientReference),
    ["far-but-fast", "near-but-slow"],
  );
  assertEquals(result.travelProvider, "google_routes");
});

Deno.test("recent completed service stays out unless Grok or complaint overrides", () => {
  const result = buildVisitRoute(
    [
      candidate({
        clientReference: "marco",
        visitNeed: "recommended",
        recentServiceAt: "2026-08-05T15:00:00.000Z",
      }),
    ],
    {
      now: NOW,
      weeklyQuota: 8,
      completedThisWeek: 0,
      cooldownDays: 30,
    },
  );
  assertEquals(result.stops, []);
  assertMatch(result.excluded[0].reason, /Servicio reciente/);
});

function stop(
  overrides: Partial<VisitRouteStop> & Pick<VisitRouteStop, "clientReference" | "sequence">,
): VisitRouteStop {
  return {
    ...candidate(overrides),
    sequence: overrides.sequence,
    scheduledFor: overrides.scheduledFor ?? "2026-09-18",
    reasons: overrides.reasons ?? ["Prioridad de relación."],
  };
}

Deno.test("reorders existing equal-urgency stops from the device start", () => {
  const result = applyDeviceOriginToDraftStops({
    stops: [
      stop({
        clientReference: "far",
        urgency: "high",
        latitude: 6.30,
        longitude: -75.60,
        sequence: 1,
      }),
      stop({
        clientReference: "near",
        urgency: "high",
        latitude: 6.245,
        longitude: -75.575,
        sequence: 2,
      }),
    ],
    start: { latitude: 6.244, longitude: -75.574 },
  });

  assertEquals(result.changed, true);
  assertEquals(result.travelProvider, "euclidean_fallback");
  assertEquals(
    result.stops.map((item) => item.clientReference),
    ["near", "far"],
  );
  assertEquals(
    result.stops.map((item) => item.sequence),
    [1, 2],
  );
});

Deno.test("does not mix different urgencies when applying device start", () => {
  const result = applyDeviceOriginToDraftStops({
    stops: [
      stop({
        clientReference: "critical-far",
        urgency: "critical",
        latitude: 6.40,
        longitude: -75.70,
        sequence: 1,
      }),
      stop({
        clientReference: "high-near",
        urgency: "high",
        latitude: 6.245,
        longitude: -75.575,
        sequence: 2,
      }),
      stop({
        clientReference: "high-far",
        urgency: "high",
        latitude: 6.30,
        longitude: -75.60,
        sequence: 3,
      }),
    ],
    start: { latitude: 6.244, longitude: -75.574 },
  });

  assertEquals(result.stops[0].clientReference, "critical-far");
  assertEquals(result.stops[0].urgency, "critical");
  assertEquals(
    result.stops.slice(1).map((item) => item.urgency),
    ["high", "high"],
  );
  assertEquals(
    result.stops.map((item) => item.clientReference),
    ["critical-far", "high-far", "high-near"],
  );
});

Deno.test("returns the draft unchanged for (0,0) or unusable destinations", () => {
  const original = [
    stop({
      clientReference: "far",
      urgency: "high",
      latitude: 6.30,
      longitude: -75.60,
      sequence: 1,
    }),
    stop({
      clientReference: "near",
      urgency: "high",
      latitude: 6.245,
      longitude: -75.575,
      sequence: 2,
    }),
  ];
  const rejectedStart = applyDeviceOriginToDraftStops({
    stops: original,
    start: { latitude: 0, longitude: 0 },
  });
  assertEquals(rejectedStart.changed, false);
  assertEquals(rejectedStart.originApplied, false);
  assertEquals(
    rejectedStart.stops.map((item) => item.clientReference),
    ["far", "near"],
  );

  const noDestinations = applyDeviceOriginToDraftStops({
    stops: [
      stop({
        clientReference: "null-island",
        urgency: "high",
        latitude: 0,
        longitude: 0,
        sequence: 1,
      }),
      stop({
        clientReference: "missing",
        urgency: "high",
        latitude: null,
        longitude: null,
        geoQuality: "missing",
        sequence: 2,
      }),
    ],
    start: { latitude: 6.244, longitude: -75.574 },
  });
  assertEquals(noDestinations.changed, false);
  assertEquals(noDestinations.originApplied, false);
});

Deno.test("applying the same start twice is idempotent", () => {
  const start = { latitude: 6.244, longitude: -75.574 };
  const first = applyDeviceOriginToDraftStops({
    stops: [
      stop({
        clientReference: "far",
        urgency: "high",
        latitude: 6.30,
        longitude: -75.60,
        sequence: 1,
      }),
      stop({
        clientReference: "near",
        urgency: "high",
        latitude: 6.245,
        longitude: -75.575,
        sequence: 2,
      }),
    ],
    start,
  });
  const second = applyDeviceOriginToDraftStops({
    stops: first.stops,
    start,
  });
  assertEquals(
    second.stops.map((item) => item.clientReference),
    first.stops.map((item) => item.clientReference),
  );
  assertEquals(second.changed, false);
  assertEquals(second.originApplied, true);
});

Deno.test("normalizes draft JSON stops before applying a device origin", () => {
  const result = applyDeviceOriginToDraftStops({
    stops: normalizeDraftStops([
      {
        client_reference: "far",
        displayName: "Far",
        urgency: "high",
        latitude: 6.30,
        longitude: -75.60,
        sequence: 1,
      },
      {
        clientReference: "near",
        urgency: "high",
        latitude: 6.245,
        longitude: -75.575,
        sequence: 2,
      },
    ]),
    start: { latitude: 6.244, longitude: -75.574 },
  });
  assertEquals(
    result.stops.map((item) => item.clientReference),
    ["near", "far"],
  );
});

Deno.test("prefers supplied Google travel times when reordering a draft", () => {
  const result = applyDeviceOriginToDraftStops({
    stops: [
      stop({
        clientReference: "near-but-slow",
        urgency: "high",
        latitude: 6.245,
        longitude: -75.575,
        sequence: 1,
      }),
      stop({
        clientReference: "far-but-fast",
        urgency: "high",
        latitude: 6.30,
        longitude: -75.60,
        sequence: 2,
      }),
    ],
    start: { latitude: 6.244, longitude: -75.574 },
    travelTimeSeconds: (_from, to) => (to.latitude > 6.27 ? 60 : 900),
  });
  assertEquals(result.travelProvider, "google_routes");
  assertEquals(
    result.stops.map((item) => item.clientReference),
    ["far-but-fast", "near-but-slow"],
  );
});
