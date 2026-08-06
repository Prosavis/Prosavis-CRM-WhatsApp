import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseVisitRegistration } from "./visitRegistration.ts";

Deno.test("mobile registration accepts satisfaction-only outcome", () => {
  assertEquals(
    parseVisitRegistration({
      serviceId: "service-cleaning",
      clientReference: "client-123",
      satisfaction: 4,
      idempotencyKey: "visit:client-123:2026-08-06T10:00",
    }),
    {
      serviceId: "service-cleaning",
      clientReference: "client-123",
      directoryId: null,
      routeId: null,
      routeSequence: null,
      satisfaction: 4,
      notes: null,
      idempotencyKey: "visit:client-123:2026-08-06T10:00",
      referral: null,
      opportunity: null,
    },
  );
});

Deno.test("registration validates satisfaction and referral contact", () => {
  assertThrows(() =>
    parseVisitRegistration({
      serviceId: "service-cleaning",
      clientReference: "client-123",
      satisfaction: 0,
      idempotencyKey: "visit:invalid-satisfaction",
    })
  );

  assertThrows(() =>
    parseVisitRegistration({
      serviceId: "service-cleaning",
      clientReference: "client-123",
      satisfaction: 5,
      idempotencyKey: "visit:invalid-referral",
      referral: { name: "Referido" },
    })
  );
});
