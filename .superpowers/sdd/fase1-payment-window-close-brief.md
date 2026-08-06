# Fase 1B — Closure findings

Repository: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp`

Close the remaining review findings without widening scope.

## Confirmed root causes

1. `WhatsAppLayout.tsx` passes `lastInboundAt` only when the conversation's latest message is inbound. A later outbound sets it to `null`, so the template panel can reuse an obsolete snapshot even though a newer inbound exists in the loaded conversation.
2. `groundBookingPayment()` filters appointments matching a partial target and then finds the first appointment with authoritative payment. This can skip the nearest matching appointment without payment and borrow payment from a later matching appointment.
3. `formatAppointmentLine()` renders finite `totalAmount` values even when they are zero or negative.

## Required behavior

1. Pass the newest valid inbound timestamp available from the complete loaded conversation to `TemplatesSidePanel`; an outbound after that inbound must not erase it. Reuse the existing shared/history helper and memoize as appropriate.
2. For an explicit full or partial target, select the nearest matching appointment first, then validate only that appointment's payment. If it has no authoritative payment, clear invented payment claims.
3. Render appointment amount only when it is finite and strictly positive.
4. Add failing tests first for:
   - inbound followed by outbound;
   - partial target with nearest matching appointment unpaid and later matching appointment paid;
   - zero and negative totals omitted from formatted context.
5. Preserve current Meta live-clock behavior and all existing tests.
6. Run focused tests, full CRM tests, type-check, and focused lint.
7. Commit only task files to `master`; do not push or deploy.
