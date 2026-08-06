# Fase 3 — Disponibilidad real

Repositories:

- `C:\Users\Prosavis\Documents\GitHub\prosavis-firebase`
- `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp`

Firestore `(default)` is Standard/Native in `southamerica-east1`. Cloud Functions remain in the repository's established region.

## Firebase bridge

1. Add `functions/src/calendar/crmGetAvailableSlots.ts`.
2. Export a v2 `onRequest` function named `crmGetAvailableSlots` from `functions/src/index.ts`.
3. Protect it with `defineSecret('FIREBASE_CRM_BRIDGE_SECRET')` and header `x-crm-secret`.
   - POST only.
   - constant-time secret comparison.
   - no browser CORS requirement.
   - never log the secret.
4. Validate body:
   - ISO date-only `startDate` and `endDate`;
   - inclusive range, maximum 7 days;
   - official duration in `120 | 180 | 240 | 360 | 480`;
   - service is fixed to `PROSAVIS_LIMPIEZA_SERVICE_ID`;
   - caller cannot select provider or arbitrary service.
5. Call `getAvailableSlotsInternal` with `checkEntireTeam: true`; do not duplicate calendar/conflict/holiday logic.
6. Return only real available ISO datetimes in a typed `{ slots: string[] }` payload.
7. Map validation/auth errors to 4xx and internal failures to a generic 500.
8. Unit-test validation, auth, fixed service/team mode, and response mapping.

## CRM consumer

1. Add `_shared/firebaseHttp.ts`:
   - server-side POST helper;
   - `FIREBASE_CRM_BRIDGE_SECRET`;
   - `FIREBASE_CRM_BRIDGE_URL`, defaulting to the canonical `prosavis/us-central1/crmGetAvailableSlots` URL;
   - AbortController timeout of at most 4 seconds;
   - no secret exposure outside Edge runtime.
2. Add `_shared/availability.ts`:
   - Bogota date keys;
   - 7-day inclusive horizon;
   - known official duration or 240-minute fallback;
   - validate/dedupe/sort returned ISO slots;
   - degradation to `[]` with structured warning.
3. After Gemini extracts booking facts, load real availability in both:
   - `suggest-whatsapp-agent-reply`
   - `get-whatsapp-booking-context`
4. Overwrite `bookingContext.availableSlots` unconditionally with real data or `[]`; never retain model-provided slots.
5. Add the exact section `=== Disponibilidad real (próximos días) ===` to the grounded context used for final suggestion generation. Preserve the 78,000-character total ceiling from Fase 2.
6. Keep the safety instruction: never select an exact time at which the home will be empty; only offer returned real slots and prefer the grounded earlier-arrival time.
7. Expose ISO strings to the existing frontend contract.
8. TDD for date horizon, duration fallback, timeout/degradation, invalid/duplicate slots, model overwrite, section formatting/ceiling, and Firebase request validation.

## Verification and commits

- Firebase: focused Jest, full Functions tests where practical, `npm run build`.
- CRM: focused Vitest, full suite, type-check, focused lint.
- Preserve all concurrent V5 WIP.
- Create one local commit per repository with only Fase 3 files.
- No push, secret mutation, or deploy.
