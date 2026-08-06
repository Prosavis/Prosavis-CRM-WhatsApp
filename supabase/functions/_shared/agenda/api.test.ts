import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  parseAgendaLostRequest,
  parseAgendaOptionsRequest,
} from "./api.ts";

Deno.test("agenda options parser seals runtime version and normalizes window", () => {
  const parsed = parseAgendaOptionsRequest(
    {
      serviceId: "service-1",
      appointmentId: "appointment-1",
      requestId: "10000000-0000-4000-8000-000000000001",
      tier: "T8",
      date: "2026-08-07",
      windowStart: "08:00",
      windowEnd: "16:00",
      requiredMinutes: 480,
      compositeMemberMinutes: 240,
      serviceType: "standard",
      requiresAlturas: false,
      grossRevenueCOP: 148_000,
      otherMarginalCostCOP: 4_000,
      destination: { comuna: "Centro", lat: 4.814, lng: -75.694 },
    },
    { specVersion: "5.0.0", automationLevel: 1 },
  );

  assertEquals(parsed.request.specVersion, "5.0.0");
  assertEquals(parsed.request.automationLevel, 1);
  assertEquals(parsed.request.clientWindow, {
    startMinute: 480,
    endMinute: 960,
  });
});

Deno.test("agenda options parser rejects caller-controlled unknown durations", () => {
  assertThrows(() =>
    parseAgendaOptionsRequest(
      {
        serviceId: "service-1",
        requestId: "10000000-0000-4000-8000-000000000001",
        tier: "T8",
        date: "2026-08-07",
        windowStart: "08:00",
        windowEnd: "16:00",
        requiredMinutes: -1,
        requiresAlturas: false,
        destination: { comuna: "Centro" },
      },
      { specVersion: "5.0.0", automationLevel: 1 },
    )
  );
});

Deno.test("lost request parser validates exhaustive reasons", () => {
  const parsed = parseAgendaLostRequest({
    serviceId: "service-1",
    requestId: "10000000-0000-4000-8000-000000000002",
    requestedTier: "T8",
    requestedDate: "2026-08-07",
    windowStart: "08:00",
    windowEnd: "16:00",
    reason: "sin_capacidad",
    alternativesOffered: [{ optionId: "pair-a-b" }],
    compositeOffered: true,
    compositeAccepted: false,
  });
  assertEquals(parsed.reason, "sin_capacidad");

  assertThrows(() =>
    parseAgendaLostRequest({
      serviceId: "service-1",
      requestId: "10000000-0000-4000-8000-000000000002",
      requestedTier: "T8",
      requestedDate: "2026-08-07",
      windowStart: "08:00",
      windowEnd: "16:00",
      reason: "invented",
      compositeOffered: false,
    })
  );
});
