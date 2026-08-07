# Fase 5B2 — Ejecución confirmada + chips UI

Repos: `Prosavis-CRM-WhatsApp` (`master`). Firebase ya expone `crmAppointmentActions`.

## Contrato Firebase vigente (no reinventar)

Endpoint único: `POST https://us-central1-prosavis.cloudfunctions.net/crmAppointmentActions`

Headers: `Content-Type: application/json`, `x-crm-secret: FIREBASE_CRM_BRIDGE_SECRET`

Create body:

```json
{
  "operationId": "<uuid lowercase>",
  "crmAdminId": "<uid del admin CRM>",
  "type": "create_appointment",
  "directoryId": "<crm_directory.id>",
  "scheduledDate": "<ISO canónico futuro>",
  "duration": 240,
  "wantsKit": false
}
```

Reschedule body:

```json
{
  "operationId": "<uuid lowercase>",
  "crmAdminId": "<uid del admin CRM>",
  "type": "reschedule_appointment",
  "directoryId": "<crm_directory.id>",
  "appointmentId": "<firestore id>",
  "scheduledDate": "<ISO canónico futuro>"
}
```

Notas: el bridge ignora address/provider/price del caller; groundea desde directorio. Usar `action.id` de `proposedActions` como `operationId`.

## Objetivo

Ejecutar `proposedActions[]` solo tras confirmación humana, con chips en drawer y composer, anti-stale y anti doble clic. Nada se autoejecuta.

## Alcance técnico

### 1. Extender `firebaseHttp.ts`

- Mantener `postFirebaseJson` para slots.
- Añadir `postFirebaseCrmBridge(urlOrEnvKey, body, options)` o `postCrmAppointmentAction(body)` que lea:
  - `FIREBASE_CRM_BRIDGE_SECRET`
  - `FIREBASE_CRM_APPOINTMENT_ACTIONS_URL` con default `.../crmAppointmentActions`
- Timeout corto (≤8s para citas; slots siguen ≤4s).
- Propagar status/error body sin filtrar secretos.

### 2. Edge Function `execute-inbox-ai-action`

Nueva función autenticada con `requireCrmAdmin`:

Request:

```json
{
  "stableKey": "...",
  "action": { "...InboxAiProposedAction completo..." },
  "suggestionFingerprint": "hash opcional de sugerencia+actions"
}
```

Comportamiento por tipo:

1. `apply_tag`
   - Resolver tag por nombre (case-insensitive, Unicode normalize) en catálogo `whatsapp_tags` (o tabla real del repo).
   - Cargar `tag_ids` actuales de la conversación.
   - Merge (append si falta), nunca overwrite destructivo.
   - Persistir vía update directo service-role o invocando la misma lógica que `patch-whatsapp-conversation`.

2. `send_payment_link`
   - Revalidar que `payload.url` coincide con un link Wompi grounded recalculado del booking context actual (o de la sugerencia persistida si se guarda).
   - Preferido: insertar el link en la respuesta para que el cliente lo ponga en composer; si el plan pide "enviar", enviar texto con el link vía canal outbound existente solo tras confirmación.
   - Decisión vinculante: **insertar en composer** (no auto-enviar mensaje), para que el agente vea el texto antes de enviar. Responder `{ mode: 'insert_composer', text: url }`.

3. `send_template`
   - Match exacto de `templateName` + `languageCode` contra plantillas Meta vigentes (reutilizar helpers/listado existentes).
   - Enviar con `send-whatsapp-template-message` / helper interno equivalente.
   - Rechazar si no hay match.

4. `create_appointment` / `reschedule_appointment`
   - Resolver `directoryId` canónico del contacto (phone → `crm_directory`).
   - Llamar `crmAppointmentActions` con `operationId = action.id.toLowerCase()`, `crmAdminId` del admin autenticado.
   - Mapear 409/422/401 a errores claros para UI.
   - No aceptar provider/price/address del payload para mutar Firebase (solo scheduledDate/duration/wantsKit/appointmentId).

Validaciones comunes:

- `action.requiresConfirmation === true` (si falta, 400).
- Revalidar payload shapes contra tipos de `_shared/inboxAiActions.ts`.
- Anti-stale: si se pasa `suggestionFingerprint`, comparar con el último fingerprint almacenado en memoria de request o rechazar si el cliente indica mismatch; como mínimo, UI envía fingerprint y Edge lo acepta/echo para auditoría.
- No logs de PII/body completo/secreto.

### 3. Cliente `whatsappService.ts`

- Tipar y conservar `proposedActions` (ya existe).
- Añadir `executeInboxAiAction(stableKey, action, meta?)`.
- Exponer en resultado de suggest también `historyMeta`/`propertySummary`/`conversationTags` si ya vienen (preparar 5C; no UI completa aún salvo que sea trivial).

### 4. UI

`ChatArea.tsx`:

- Estado `proposedActions` + `suggestionFingerprint` (hash estable de suggestion+actions).
- Al sugerir, guardar actions; al cambiar conversación, limpiar.
- Chips bajo composer (misma lista).
- Confirmación: `window.confirm` o Dialog MUI existente: "¿Ejecutar: {label}?".
- Pending por `action.id`; deshabilitar chips mientras pending.
- Anti-stale: si llega nueva sugerencia, invalidar actions previas.
- Anti doble clic: ignore clicks si `executingActionId` set.
- Tras éxito:
  - tag: toast/snackbar + refresh tags si aplica;
  - payment: insertar URL en composer (`suggestionDraft` o input de mensaje);
  - template: snackbar ok;
  - citas: snackbar con appointmentId.

`BookingAssistantDrawer.tsx`:

- Props `proposedActions`, `onConfirmAction`, `executingActionId`.
- Chips/botones con `label` y tooltip `reason`.

### 5. Tests (TDD)

- Helper puro: merge tags, fingerprint, stale guard.
- Edge handler testeable (extraer lógica de `_shared/inboxAiActionExecution.ts`).
- Service mapping.
- Component test mínimo de chips + confirmación + disabled pending (RTL si el repo ya lo usa; si no, tests de helper + servicio).
- RED→GREEN documentado en reporte.

### 6. Verificación

- `npm test` enfocado + suite práctica CRM
- type-check
- lint enfocado
- `graphify update .` desde GitHub/
- Commit(s) locales aislados; no push/deploy/secrets
- Preservar WIP V5 ajeno
- Reporte: `.superpowers/sdd/fase5b2-actions-ui-execution-report.md`

## Fuera de alcance

- 5C telemetría completa (salvo tipado historyMeta si cae gratis)
- Deploy/secretos/migraciones remotas
- Auto-ejecución sin confirmación
