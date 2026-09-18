export const VISIT_PAYMENT_HEADLINES = [
  "AL_DIA",
  "COBRO_PENDIENTE",
  "PAGO_PARCIAL",
  "PAGO_RECHAZADO",
] as const;

export type VisitPaymentHeadline = (typeof VISIT_PAYMENT_HEADLINES)[number];

export const VISIT_PAYMENT_LABELS: Record<VisitPaymentHeadline, string> = {
  AL_DIA: "Al día con los pagos",
  COBRO_PENDIENTE: "Cobro pendiente",
  PAGO_PARCIAL: "Pago parcial",
  PAGO_RECHAZADO: "Pago rechazado",
};

export function presentVisitPayment(input: {
  outstandingTotalCOP: number;
  pendingCount?: number;
  partialCount?: number;
  rejectedCount?: number;
  rawStatus?: string | null;
  headline?: string | null;
}): { headline: VisitPaymentHeadline; headlineLabel: string } {
  const outstanding = Number.isFinite(input.outstandingTotalCOP)
    ? Math.max(0, input.outstandingTotalCOP)
    : 0;
  if (outstanding <= 0) {
    return { headline: "AL_DIA", headlineLabel: VISIT_PAYMENT_LABELS.AL_DIA };
  }
  const canonical = String(input.headline || "").toUpperCase();
  if (VISIT_PAYMENT_HEADLINES.includes(canonical as VisitPaymentHeadline)) {
    const headline = canonical as VisitPaymentHeadline;
    return { headline, headlineLabel: VISIT_PAYMENT_LABELS[headline] };
  }
  const raw = String(input.rawStatus || "").trim().toUpperCase();
  if (raw === "PAGO_RECHAZADO") {
    return { headline: "PAGO_RECHAZADO", headlineLabel: VISIT_PAYMENT_LABELS.PAGO_RECHAZADO };
  }
  if (raw === "PAGO_EN_PROCESO" || (input.partialCount ?? 0) > 0) {
    return { headline: "PAGO_PARCIAL", headlineLabel: VISIT_PAYMENT_LABELS.PAGO_PARCIAL };
  }
  return { headline: "COBRO_PENDIENTE", headlineLabel: VISIT_PAYMENT_LABELS.COBRO_PENDIENTE };
}
