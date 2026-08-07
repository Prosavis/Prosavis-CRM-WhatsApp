# Fase 5B2 — Reporte de ejecución (actions UI + Edge)

**Repo:** `Prosavis-CRM-WhatsApp` (`master`)  
**Fecha:** 2026-08-06  
**Contrato Firebase:** `crmAppointmentActions` (us-central1) + `x-crm-secret` + `operationId = action.id.toLowerCase()`

## Resumen

Ejecución confirmada de `proposedActions[]` con chips en composer (`ChatArea`) y drawer (`BookingAssistantDrawer`), Edge Function autenticada `execute-inbox-ai-action`, bridge Firebase de citas (`postCrmAppointmentAction`), merge de tags, payment link → insert composer (sin auto-send), anti-stale fingerprint y anti doble clic.

## TDD vertical RED → GREEN

| Slice | RED | GREEN |
| --- | --- | --- |
| Helpers (merge tags, fingerprint, stale, Wompi grounded) | `inboxAiActionHelpers.test.ts` | `_shared/inboxAiActionHelpers.ts` |
| Firebase CRM appointment HTTP (≤8s, status/body) | `firebaseHttp.test.ts` | `_shared/firebaseHttp.ts` (`postCrmAppointmentAction`) |
| Execution engine (tag/payment/template/citas) | `inboxAiActionExecution.test.ts` | `_shared/inboxAiActionExecution.ts` + deps |
| Service mapping | `whatsappService.types.test.ts` | `executeInboxAiAction()` + `historyMeta`/`conversationTags` |
| Chip guards (confirm copy + pending) | `proposedActionChips.test.ts` | `ProposedActionChips` + handlers UI |
| Gate: stale assert wired (client+Edge) | helpers + execution source-sensitive | `prepareConfirmed…` + `assertSuggestionNotStale` in `executeInboxAiAction` |
| Gate: ignore in-flight UI after re-suggest | `shouldApplyInboxAiActionUiEffects` | ChatArea captura fingerprint al confirmar; skip snack/composer/tags |

No se usó RTL (el repo no tiene `@testing-library/react`); cobertura UI vía helpers + servicio + componente presentacional.

## Implementación

### Shared / Edge

- `supabase/functions/_shared/firebaseHttp.ts`
  - Mantiene `postFirebaseJson` (slots, ≤4s).
  - Añade `DEFAULT_FIREBASE_CRM_APPOINTMENT_ACTIONS_URL`, `postCrmAppointmentAction` (≤8s), `FirebaseCrmBridgeHttpError` con status/body.
- `supabase/functions/_shared/inboxAiActionHelpers.ts` — merge tags, fingerprint, stale guard, Wompi grounded, template body components.
- `supabase/functions/_shared/inboxAiActionExecution.ts` — lógica testeable por tipo.
- `supabase/functions/_shared/inboxAiActionExecutionDeps.ts` — wiring Supabase/Meta/Firebase.
- `supabase/functions/execute-inbox-ai-action/index.ts` — `requireCrmAdmin`, sin logs de PII/secretos.
- `supabase/config.toml` — `verify_jwt = false` (auth interna).

### Cliente / UI

- `whatsappService.executeInboxAiAction(stableKey, action, meta?)`
- `SuggestReplyResult` expone `historyMeta` y `conversationTags` (prep 5C).
- Chips en `ChatArea` (bajo composer) y `BookingAssistantDrawer`.
- Confirmación obligatoria: `window.confirm('¿Ejecutar: {label}?')`.
- Pending por `action.id`; nueva sugerencia invalida actions previas; cambio de conversación limpia estado.
- `send_payment_link` → inserta URL en composer (no auto-envía).
- Tags → merge append; `onTagsChanged` tras éxito.

### Comportamiento por tipo

1. **apply_tag** — match case-insensitive + Unicode normalize en `whatsapp_chat_tags`; merge `tag_ids`.
2. **send_payment_link** — revalida URL vs catálogo Wompi grounded por monto; responde `{ mode: 'insert_composer', text }`.
3. **send_template** — match exacto name+language APPROVED en Meta; envía vía outbound.
4. **create/reschedule_appointment** — directory por teléfono; bridge con `operationId` lowercase; mapea 401/409/422.

## Gate 5B2 — fixes Important

1. **`assertSuggestionNotStale` cableado**
   - Cliente: `prepareConfirmedInboxAiActionFingerprints` (llama assert) antes de `executeInboxAiAction`.
   - Edge/`executeInboxAiAction`: si viene `suggestionFingerprint`, llama `assertSuggestionNotStale` vs `currentSuggestionFingerprint` (409 `stale_suggestion`).
   - Tests source-sensitive fallan si se omite el call.
2. **In-flight tras re-sugerencia**
   - `suggestionFingerprintRef` + fingerprint capturado al confirmar.
   - Al resolver: `shouldApplyInboxAiActionUiEffects` — si el fingerprint actual cambió, no snack / insert composer / `onTagsChanged`.
   - No se cancelan mutaciones remotas ya ejecutadas.

## Verificaciones

- Enfoque gate-fix 5B2: **36 passed** (helpers/execution/firebaseHttp/chips/service)
- `npm run type-check` → OK
- ESLint enfocado → OK
- `graphify update .` desde `GitHub/` → ejecutado (fase inicial)

## Commits locales

| Hash | Mensaje |
| --- | --- |
| `1e8fdf3` | feat(inbox-ai): add confirmed action execution edge and Firebase bridge |
| `ce19ecd` | feat(inbox-ai): add proposed action chips with confirmation UX |
| `6818cc9` | docs(sdd): add Fase 5B2 actions UI execution report |
| `d29d937` | docs(sdd): record Fase 5B2 local commit hashes in report |
| _(gate)_ | fix(inbox-ai): wire stale assert and ignore in-flight UI effects |

Solo archivos 5B2; no push/deploy/secrets. `fase5c-*` brief quedó sin commit.

## Fuera de alcance (respetado)

- 5C telemetría UI completa
- Deploy Edge / secretos / migraciones remotas
- Auto-ejecución sin confirmación
- Edición Firebase (solo lectura del contrato)

## Preocupaciones

1. **WABA ID en Edge:** `findApprovedTemplate` usa `body.wabaId` del cliente o `WHATSAPP_WABA_ID` env. Si falta, `send_template` falla 404 (no inventa plantilla).
2. **Payment grounding:** revalida contra catálogo estático Wompi por monto (misma fuente que suggest), no re-corre el extractor IA completo.
3. **RTL ausente:** no hay test de componente montado; guards cubiertos con helpers.
4. **WIP ajeno:** no se tocó V5 ni el brief `fase5c-*`; sin reset/stash/checkout.
5. **Deploy pendiente:** la Edge `execute-inbox-ai-action` requiere deploy Supabase + secret `FIREBASE_CRM_BRIDGE_SECRET` / URL opcional ya existentes en entorno.
6. **Stale Edge sin `currentSuggestionFingerprint`:** si el cliente envía solo `suggestionFingerprint`, `assertSuggestionNotStale` no-op (ambos lados requeridos para comparar). El cliente 5B2 siempre envía ambos vía `prepareConfirmed…`.
