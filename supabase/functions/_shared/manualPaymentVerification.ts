import type { AdminActor } from "./adminAuth.ts";

type UnknownRecord = Record<string, unknown>;

export interface ManualPaymentRequest {
  serviceId: string;
  appointmentId: string;
  paidCOP: number;
  paymentMethod: "QR" | "CASH";
  idempotencyKey: string;
  recordedAt?: Date;
}

interface BuildManualPaymentPatchInput {
  request: ManualPaymentRequest;
  appointment: UnknownRecord;
  actor: AdminActor;
  now: Date;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_PAYMENT_COP = 100_000_000;

function requiredId(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!ID_PATTERN.test(normalized)) {
    throw new Error(`${field} inválido`);
  }
  return normalized;
}

export function parseManualPaymentRequest(
  value: unknown,
): ManualPaymentRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Body inválido");
  }
  const input = value as UnknownRecord;
  const paidCOP = input.paidCOP;
  if (
    typeof paidCOP !== "number" ||
    !Number.isInteger(paidCOP) ||
    paidCOP <= 0 ||
    paidCOP > MAX_PAYMENT_COP
  ) {
    throw new Error("paidCOP inválido");
  }
  if (input.paymentMethod !== "QR" && input.paymentMethod !== "CASH") {
    throw new Error("paymentMethod inválido");
  }
  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error("idempotencyKey inválido");
  }

  let recordedAt: Date | undefined;
  if (input.recordedAt !== undefined) {
    if (typeof input.recordedAt !== "string") {
      throw new Error("recordedAt inválido");
    }
    recordedAt = new Date(input.recordedAt);
    if (!Number.isFinite(recordedAt.getTime())) {
      throw new Error("recordedAt inválido");
    }
  }

  return {
    serviceId: requiredId(input.serviceId, "serviceId"),
    appointmentId: requiredId(input.appointmentId, "appointmentId"),
    paidCOP,
    paymentMethod: input.paymentMethod,
    idempotencyKey,
    ...(recordedAt ? { recordedAt } : {}),
  };
}

export function buildManualPaymentPatch(input: BuildManualPaymentPatchInput) {
  const { request, appointment, actor, now } = input;
  if (String(appointment.serviceId ?? "") !== request.serviceId) {
    throw new Error("La cita no pertenece al servicio.");
  }
  if (appointment.manualPaymentVerificationId === request.idempotencyKey) {
    return { duplicate: true as const, patch: null };
  }

  const total = appointment.totalAmount ?? appointment.price;
  if (
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total <= 0 ||
    request.paidCOP !== total
  ) {
    throw new Error("El pago manual debe coincidir con el total de la cita.");
  }

  return {
    duplicate: false as const,
    patch: {
      paidAmount: request.paidCOP,
      pendingAmount: 0,
      paymentStatus: "PAGO_ACEPTADO",
      paymentMethod: request.paymentMethod,
      paymentRecordedAt: request.recordedAt ?? now,
      manualPaymentVerificationId: request.idempotencyKey,
      manualPaymentVerification: {
        verifiedAt: now,
        actorKind: actor.kind,
        actorUid: actor.uid,
      },
      updatedAt: now,
    },
  };
}
