import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildManualPaymentPatch,
  parseManualPaymentRequest,
} from "./manualPaymentVerification.ts";

Deno.test("parseManualPaymentRequest validates the fallback contract", () => {
  assertEquals(
    parseManualPaymentRequest({
      serviceId: "service-1",
      appointmentId: "appointment-1",
      paidCOP: 120000,
      paymentMethod: "QR",
      idempotencyKey: "manual-20260806-001",
      recordedAt: "2026-08-06T18:30:00.000Z",
    }),
    {
      serviceId: "service-1",
      appointmentId: "appointment-1",
      paidCOP: 120000,
      paymentMethod: "QR",
      idempotencyKey: "manual-20260806-001",
      recordedAt: new Date("2026-08-06T18:30:00.000Z"),
    },
  );
  assertThrows(() =>
    parseManualPaymentRequest({
      serviceId: "service-1",
      appointmentId: "appointment-1",
      paidCOP: -1,
      paymentMethod: "CARD",
      idempotencyKey: "x",
    }),
  );
});

Deno.test("buildManualPaymentPatch records actor and full payment", () => {
  const now = new Date("2026-08-06T18:31:00.000Z");
  const request = parseManualPaymentRequest({
    serviceId: "service-1",
    appointmentId: "appointment-1",
    paidCOP: 120000,
    paymentMethod: "CASH",
    idempotencyKey: "manual-20260806-002",
    recordedAt: "2026-08-06T18:30:00.000Z",
  });
  const result = buildManualPaymentPatch({
    request,
    appointment: {
      serviceId: "service-1",
      totalAmount: 120000,
    },
    actor: {
      kind: "firebase",
      uid: "admin-1",
      email: "admin@example.test",
    },
    now,
  });

  assertEquals(result, {
    duplicate: false,
    patch: {
      paidAmount: 120000,
      pendingAmount: 0,
      paymentStatus: "PAGO_ACEPTADO",
      paymentMethod: "CASH",
      paymentRecordedAt: new Date("2026-08-06T18:30:00.000Z"),
      manualPaymentVerificationId: "manual-20260806-002",
      manualPaymentVerification: {
        verifiedAt: now,
        actorKind: "firebase",
        actorUid: "admin-1",
      },
      updatedAt: now,
    },
  });
});

Deno.test(
  "buildManualPaymentPatch is idempotent and rejects wrong totals",
  () => {
    const request = parseManualPaymentRequest({
      serviceId: "service-1",
      appointmentId: "appointment-1",
      paidCOP: 120000,
      paymentMethod: "QR",
      idempotencyKey: "manual-20260806-003",
    });

    assertEquals(
      buildManualPaymentPatch({
        request,
        appointment: {
          serviceId: "service-1",
          totalAmount: 120000,
          manualPaymentVerificationId: "manual-20260806-003",
        },
        actor: { kind: "supabase", uid: "admin-2" },
        now: new Date("2026-08-06T18:31:00.000Z"),
      }),
      { duplicate: true, patch: null },
    );

    assertThrows(() =>
      buildManualPaymentPatch({
        request: { ...request, paidCOP: 100000 },
        appointment: {
          serviceId: "service-1",
          totalAmount: 120000,
        },
        actor: { kind: "supabase", uid: "admin-2" },
        now: new Date("2026-08-06T18:31:00.000Z"),
      }),
    );
  },
);
