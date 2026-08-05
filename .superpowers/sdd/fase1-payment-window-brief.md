# Fase 1B — Payment grounding and Meta session window

Repository: `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp`

## Goal

Ground booking payment data in Firestore/CRM records and make the WhatsApp 24-hour session window explicit to the model and UI.

## Requirements

1. Extend appointment mapping and `InboxAiAppointment` with:
   - `paymentStatus`
   - `totalAmount`
   - `paymentMethod`
   - `wompiReference`
2. Include `payment_status` in the `crm_directory` query and formatted directory context.
3. Add a pure `groundBookingPayment()` in `inboxAiContextFormat.ts`. It must overwrite model-provided `paymentStatus`/`paymentAmount` from the closest relevant upcoming real appointment. If no authoritative appointment payment exists, it must not assert a paid state or retain an invented amount/status.
4. Add a pure shared module `supabase/functions/_shared/metaSessionWindow.ts` and make the frontend utility use the same implementation rather than divergent duplicate logic.
5. Model the window explicitly with enough data for UI and prompt:
   - `status`: `open | closed | unknown`
   - `lastInboundAt`
   - `expiresAt`
   - `requiresTemplate`
6. Determine `lastInboundAt` from the complete merged conversation messages before transcript character truncation. Only inbound/customer messages count. Use the newest valid timestamp.
7. Add `sessionWindow` to `InboxAiContext`, include a section exactly headed `=== Canal / ventana WhatsApp ===`, and return it from both booking/suggestion Edge responses where appropriate.
8. Strengthen `INBOX_AI_SYSTEM_INSTRUCTION`:
   - prices only from the grounded catalog;
   - never assert payment without authoritative data;
   - never invent available slots;
   - when the Meta window is closed, propose a template instead of free text.
9. Preserve the existing safety/early-arrival policy and all pricing changes.
10. Update frontend result/types and current window consumers so they use the shared contract safely.
11. TDD:
   - appointment payment fields map/format correctly;
   - real payment overwrites invented model values;
   - no authoritative payment clears invented paid/amount claims;
   - boundary behavior around 24 hours is deterministic;
   - only inbound messages establish the window;
   - unknown when no valid inbound exists;
   - formatted context and system instruction contain the required safeguards;
   - response types expose `sessionWindow`.
12. Run focused tests, full CRM tests, and type-check. Do not deploy.

## Constraints

- Preserve all pre-existing uncommitted work.
- Do not create branches/worktrees or commit/stash/reset/checkout.
- No inline imports.
- Shared helpers must stay Deno Edge-compatible and frontend-test compatible.
- Do not modify database schema in this task.
- Report RED/GREEN evidence and concerns.
