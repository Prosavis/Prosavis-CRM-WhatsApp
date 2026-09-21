import { assertEquals, assertMatch } from "jsr:@std/assert";
import {
  applyDeviceOriginToDraftStops,
  applyGeocodeToDirectoryAddresses,
  buildVisitRoute,
  euclideanDirectionsOverlay,
  existingDirectionsOverlay,
  hydrateStopCoordinates,
  hydrateStopsFromKnownSources,
  hydrateStopsWithGeocode,
  isZeroCoordNavUrl,
  normalizeDraftStops,
  parseLatLngFromNavUrl,
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
    latitude: "latitude" in overrides ? overrides.latitude ?? null : 4.6097,
    longitude: "longitude" in overrides ? overrides.longitude ?? null : -74.0817,
    geoQuality: overrides.geoQuality,
    visitNeed: overrides.visitNeed,
    visitReasons: overrides.visitReasons,
    pendingReply: overrides.pendingReply,
    recentServiceAt: overrides.recentServiceAt,
    urgency: overrides.urgency,
    grokDecision: overrides.grokDecision,
    googleMapsUrl: overrides.googleMapsUrl ?? null,
    wazeUrl: overrides.wazeUrl ?? null,
    addressLine: overrides.addressLine ?? null,
    addressHint: overrides.addressHint ?? null,
    directoryId: overrides.directoryId ?? null,
    locationSource: overrides.locationSource ?? null,
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

Deno.test("extracts coordinates from Maps and Waze URLs and rejects 0,0", () => {
  assertEquals(
    parseLatLngFromNavUrl("https://waze.com/ul?ll=4.814812,-75.694005&navigate=yes"),
    { latitude: 4.814812, longitude: -75.694005 },
  );
  assertEquals(
    parseLatLngFromNavUrl("https://www.google.com/maps?q=4.8052261,-75.7204113"),
    { latitude: 4.8052261, longitude: -75.7204113 },
  );
  assertEquals(parseLatLngFromNavUrl("https://waze.com/ul?ll=0,0&navigate=yes"), null);
});

Deno.test("hydrates a 0,0 stop from its Maps URL when it is inside coverage", () => {
  const hydrated = hydrateStopCoordinates(stop({
    clientReference: "kua",
    sequence: 2,
    latitude: 0,
    longitude: 0,
    geoQuality: "exact",
    addressLine: "MZ D CS 4",
    googleMapsUrl: "https://www.google.com/maps?q=4.8052261,-75.7204113",
  }));
  assertEquals(hydrated.latitude, 4.8052261);
  assertEquals(hydrated.longitude, -75.7204113);
  assertEquals(hydrated.geoQuality, "exact");
});

Deno.test("clears 0,0 when the URL and address cannot yield a covered point", () => {
  const hydrated = hydrateStopCoordinates(stop({
    clientReference: "ghost",
    sequence: 3,
    latitude: 0,
    longitude: 0,
    geoQuality: "exact",
    addressLine: null,
    googleMapsUrl: "https://maps.app.goo.gl/short",
    wazeUrl: "https://waze.com/ul?ll=0,0&navigate=yes",
  }));
  assertEquals(hydrated.latitude, null);
  assertEquals(hydrated.longitude, null);
  assertEquals(hydrated.geoQuality, "missing");
});

Deno.test("uses a geocoded address inside coverage and keeps list order", () => {
  const { stops, changed } = hydrateStopsFromKnownSources([
    stop({
      clientReference: "marco",
      sequence: 1,
      latitude: 4.814812,
      longitude: -75.694005,
    }),
    stop({
      clientReference: "nando",
      sequence: 2,
      latitude: 0,
      longitude: 0,
      addressLine: "calle 106 # 13-75 apto 3057",
    }),
  ], {
    "calle 106 # 13-75 apto 3057": { latitude: 4.82, longitude: -75.69 },
  });
  assertEquals(changed, true);
  assertEquals(stops.map((item) => item.clientReference), ["marco", "nando"]);
  assertEquals(stops[1].latitude, 4.82);
  assertEquals(stops[1].longitude, -75.69);
});

Deno.test("builds euclidean legs without mixing missing destinations into the polyline", () => {
  const overlay = euclideanDirectionsOverlay(
    { latitude: 4.813, longitude: -75.694 },
    [
      stop({
        clientReference: "usable",
        sequence: 1,
        latitude: 4.8063654,
        longitude: -75.8029909,
      }),
      stop({
        clientReference: "no-geo",
        sequence: 2,
        latitude: null,
        longitude: null,
      }),
    ],
  );
  assertEquals(overlay.legs.length, 1);
  assertEquals(overlay.travelProvider, "euclidean_fallback");
  assertEquals(overlay.legs[0].distanceMeters > 0, true);
});

Deno.test("reuses a persisted directions overlay without inventing a start point", () => {
  const overlay = existingDirectionsOverlay({
    travelProvider: "google_routes",
    overviewPolyline: "abcd",
    legs: [{ distanceMeters: 12500, durationSeconds: 900 }],
    totalDistanceMeters: 12500,
    totalDurationSeconds: 900,
    start: { latitude: 4.813, longitude: -75.694 },
  });
  assertEquals(overlay?.travelProvider, "google_routes");
  assertEquals(overlay?.overviewPolyline, "abcd");
  assertEquals(overlay?.legs.length, 1);
  assertEquals(existingDirectionsOverlay({ legs: [] }), null);
});

Deno.test("geocodes a missing stop that still has an address and rewrites 0,0 links", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({
        results: [{ geometry: { location: { lat: 4.82, lng: -75.69 } } }],
      })),
    );
  try {
    const { stops, changed } = await hydrateStopsWithGeocode([
      stop({
        clientReference: "nando",
        sequence: 5,
        latitude: null,
        longitude: null,
        geoQuality: "missing",
        addressLine: "calle 106 # 13-75 apto 3057",
        addressHint: "Senderos de San Silvestre",
        googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=0,0",
        wazeUrl: "https://waze.com/ul?ll=0,0&navigate=yes",
      }),
    ], "test-key");
    assertEquals(changed, true);
    assertEquals(stops[0].latitude, 4.82);
    assertEquals(stops[0].longitude, -75.69);
    assertEquals(stops[0].geoQuality, "approximate");
    assertEquals(stops[0].locationSource, "geocode");
    assertEquals(stops[0].googleMapsUrl?.includes("4.82"), true);
    assertEquals(isZeroCoordNavUrl(stops[0].googleMapsUrl), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("does not retry an unresolved address on later refetches", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ results: [] })));
  };
  try {
    const { stops } = await hydrateStopsWithGeocode([
      stop({
        clientReference: "carmenza",
        sequence: 4,
        latitude: null,
        longitude: null,
        geoQuality: "unresolved",
        addressLine: "Calle 3b #13-20 Edificio Laura apto 701",
      }),
    ], "test-key");
    assertEquals(calls, 0);
    assertEquals(stops[0].geoQuality, "unresolved");
    assertEquals(stops[0].latitude, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("marks a failed geocode as unresolved so (0,0) stays out of the overlay", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ results: [] })));
  try {
    const { stops } = await hydrateStopsWithGeocode([
      stop({
        clientReference: "ghost",
        sequence: 9,
        latitude: null,
        longitude: null,
        geoQuality: "missing",
        addressLine: "direccion inventada 999",
      }),
    ], "test-key");
    assertEquals(stops[0].geoQuality, "unresolved");
    const overlay = euclideanDirectionsOverlay(null, stops);
    assertEquals(overlay.legs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("writes geocoded coords back onto the matching directory address", () => {
  const patched = applyGeocodeToDirectoryAddresses(
    [{
      id: "addr-1",
      addressLine: "calle 106 # 13-75 apto 3057",
      isDefault: true,
      reference: "Senderos de San Silvestre",
    }],
    stop({
      clientReference: "nando",
      directoryId: "6bca1e61-151e-4e3e-86ab-615cf60ebf90",
      sequence: 5,
      latitude: 4.82,
      longitude: -75.69,
      addressLine: "calle 106 # 13-75 apto 3057",
      locationSource: "geocode",
    }),
  );
  assertEquals(patched?.serviceAddresses[0].lat, 4.82);
  assertEquals(patched?.preferredWazeUrl.includes("-75.69"), true);
});

