# Fase 5B1 — Reporte de puentes Firebase para citas

## Estado

`DONE_WITH_CONCERNS`

Se implementaron `crmCreateAppointment` y
`crmRescheduleAppointmentHttp` como Functions v2 `onRequest` en
`us-central1`, `cors: false`, protegidas por
`FIREBASE_CRM_BRIDGE_SECRET`.

## Implementación

- Se extrajeron handlers internos de `createAppointment` y
  `crmRescheduleAppointment` manteniendo los wrappers callables, su
  autenticación, opciones y contratos.
- El bridge usa el actor sintético `crm-ai-bridge` sin claims de admin.
  `crm_bridge` solo habilita la autorización interna de reagenda; no concede
  `allowPastDate`, cobertura, precio ni equipo manual.
- Servicio, precio, kit, confirmación y proveedor se construyen en servidor.
  Todo campo no perteneciente al contrato HTTP se rechaza.
- La selección de proveedor reutiliza la enumeración de equipo y el cálculo
  canónico de slots de `getAvailableSlots`; exige coincidencia con el instante
  exacto y excluye la cita actual al reagendar.
- La idempotencia usa `_crm_bridge_actions/{actionId}` con transacciones,
  lease token, hash de operación/payload y estados
  `processing|completed|failed`. Solo se persiste el hash, no el body ni PII.
  Reintentos completados devuelven el resultado persistido; ejecuciones
  concurrentes esperan el mismo resultado. Un fallo queda terminal para evitar
  repetir side effects o crear citas duplicadas.
- La comparación constante de secreto y el mapping HTTP se compartieron con
  `crmGetAvailableSlots`.

## Evidencia TDD RED → GREEN

RED:

1. `npm test -- --runInBand src/calendar/crmAppointmentBridges.test.ts`
   falló con `TS2307 Cannot find module './crmAppointmentBridges'`.
2. El siguiente ciclo falló porque no existía
   `validateCrmCreateAppointmentRequest` ni las dependencias grounded.
3. El ciclo de idempotencia falló porque aún no existían
   `createCrmBridgeIdempotencyRunner`, `CrmBridgeActionRecord` y
   `CrmBridgeActionStore`.
4. El ciclo de reagenda falló porque aún no existían
   `handleCrmRescheduleAppointment` ni
   `validateCrmRescheduleAppointmentRequest`.

GREEN final enfocado:

```text
npm test -- --runInBand \
  src/calendar/crmAppointmentBridges.test.ts \
  src/calendar/crmGetAvailableSlots.test.ts \
  src/calendar/getAvailableSlots.test.ts \
  src/calendar/appointmentCanonicalHandlers.test.ts

Test Suites: 4 passed, 4 total
Tests:       49 passed, 49 total
```

Cobertura enfocada:

- POST-only y secreto constante en ambos endpoints.
- UUID v4, ISO canónico/futuro, duración, IDs, dirección y booleano de kit.
- Rechazo de provider/service/precio/estado/pago y cualquier override.
- Servicio/precio/kit grounded y una sola llamada al núcleo canónico.
- Selección exacta de profesional real, slot ocupado y exclusión en reagenda.
- Idempotencia secuencial, concurrente, conflicto de payload y fallo terminal.
- Mapping 400/401/404/409/500 sin filtrar errores internos.
- Auth de ambos handlers callables existentes.

## Verificación

- Suite Functions completa:
  `npm test -- --runInBand` → **70 suites, 570 tests y 1 snapshot pasaron**.
- Build:
  `npm run build` → **exit 0** (`tsc` + `copy:prompts`).
- Diagnósticos IDE sobre archivos modificados → **sin errores**.
- `npm run lint` → no pudo ejecutarse: el repositorio no contiene
  configuración ESLint detectable.
- `npm run scan:secrets` → no pudo ejecutarse: falta
  `functions/scripts/scan-secrets.js`, aunque el script está declarado.
- `graphify update .` → **exit 0**, 46.156 nodos / 99.563 edges; conservó
  warnings existentes por `tree_sitter_sql` ausente y archivos de cero nodos.
- `git diff --check` se ejecutó; un newline extra detectado tras el primer
  commit se corrigió en un segundo commit aislado.

## Commits Firebase

- `022aef0` — `feat: add CRM appointment bridges`
- `1d2dc3c` — `style: normalize bridge file ending`

No hubo push, deploy, mutación de secretos ni acceso/mutación de datos remotos.

## Archivos Firebase

- `functions/src/calendar/appointmentCanonicalHandlers.test.ts`
- `functions/src/calendar/createAppointment.ts`
- `functions/src/calendar/crmAppointmentBridgeFunctions.ts`
- `functions/src/calendar/crmAppointmentBridges.test.ts`
- `functions/src/calendar/crmAppointmentBridges.ts`
- `functions/src/calendar/crmBridgeHttp.ts`
- `functions/src/calendar/crmGetAvailableSlots.ts`
- `functions/src/calendar/crmRescheduleAppointment.ts`
- `functions/src/calendar/getAvailableSlots.test.ts`
- `functions/src/calendar/getAvailableSlots.ts`
- `functions/src/index.ts`

## Auto-revisión

No se encontraron defectos funcionales o de seguridad bloqueantes en el diff
5B1. Se confirmó que no hay imports inline, body/secreto/PII completo en logs
del bridge, campos caller-controlled, bypasses administrativos ni duplicación
de las reglas de disponibilidad.

El WIP concurrente ajeno se preservó y no se incluyó en los commits 5B1.

## Preocupaciones

1. El lint configurado no es ejecutable porque falta una configuración ESLint.
2. El script de escaneo de secretos declarado apunta a un archivo inexistente.
3. Graphify terminó correctamente, pero reportó warnings preexistentes de
   extracción SQL/cero nodos.
