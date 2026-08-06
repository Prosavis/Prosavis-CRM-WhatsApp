# Fase 5B1 — Puentes Firebase para crear y reagendar citas

Repositorios:

- `C:\Users\Prosavis\Documents\GitHub\prosavis-firebase` (`main`)
- `C:\Users\Prosavis\Documents\GitHub\Prosavis-CRM-WhatsApp` (`master`, solo reporte/brief)

## Objetivo

Exponer dos endpoints HTTP server-to-server protegidos por `FIREBASE_CRM_BRIDGE_SECRET` que permitan ejecutar, tras confirmación humana en el CRM, acciones `create_appointment` y `reschedule_appointment`. Deben reutilizar la lógica canónica actual de citas; no duplicar transacciones, conflictos, cobertura, asignación, side effects ni Cloud Tasks.

## Contratos HTTP

### `crmCreateAppointment`

POST JSON:

```json
{
  "actionId": "uuid-v4",
  "clientId": "id canónico/directorio o app user",
  "scheduledDate": "ISO datetime exacto",
  "duration": 240,
  "address": "dirección no vacía",
  "wantsKit": false
}
```

Respuesta 200:

```json
{
  "success": true,
  "appointmentId": "firestore-id",
  "status": "CONFIRMED",
  "availabilityWarnings": []
}
```

### `crmRescheduleAppointmentHttp`

POST JSON:

```json
{
  "actionId": "uuid-v4",
  "appointmentId": "firestore-id",
  "scheduledDate": "ISO datetime exacto"
}
```

Respuesta 200:

```json
{
  "success": true,
  "appointmentId": "firestore-id",
  "availabilityWarnings": []
}
```

## Seguridad y validación

1. Functions v2 `onRequest`, región `us-central1`, `cors: false`, POST-only.
2. `defineSecret('FIREBASE_CRM_BRIDGE_SECRET')`, header `x-crm-secret`, comparación constante compartida; nunca loguear secreto/body completo/PII.
3. Validar UUID v4 de `actionId`, ISO datetime canónico/futuro, duración oficial `120|180|240|360|480`, IDs y dirección con límites razonables.
4. Rechazar explícitamente campos controlables no permitidos: `serviceId`, `providerId`, `price`, `isConfirmed`, overrides de cobertura/fecha/equipo, estados o payment fields.
5. Servicio fijo `PROSAVIS_LIMPIEZA_SERVICE_ID`; precio base calculado desde `APPOINTMENT_PRICES_BY_DURATION`; kit solo por booleano.
6. Mapear errores de cliente/auth a 4xx/409; fallos internos a `{ error: 'internal' }` sin filtrar detalles.

## Reutilización canónica

1. Extraer handlers internos testeables de `createAppointment` y `crmRescheduleAppointment` con cambio mecánico mínimo. Los callables existentes deben conservar exactamente auth, contrato y comportamiento.
2. El bridge invoca esos handlers con un actor sintético `crm-ai-bridge`, sin claims admin. El handler puede recibir un origen interno explícito `crm_bridge` para autorizar únicamente crear/reagendar tras validar el secreto; ese origen no activa bypasses de fecha, cobertura, precio o equipo. El bridge nunca permite `allowPastDate`, coverage override ni manual team override.
3. Creación:
   - antes de crear, resolver un profesional real disponible para el slot exacto dentro del equipo oficial;
   - refactorizar/reutilizar la enumeración de miembros y el cálculo de slots de `getAvailableSlots`, sin duplicar reglas;
   - pasar provider resuelto al handler canónico;
   - pasar `isConfirmed: true`, dirección como `serviceAddress.addressLine`, notas de origen sin PII y precio oficial;
   - exigir `clientId` no vacío; no crear cita manual sin identidad.
4. Reagenda:
   - cargar cita existente y rechazar estados finales mediante handler canónico;
   - resolver un profesional del equipo disponible para el nuevo slot exacto y pasarlo al handler para revalidación/reasignación;
   - no aceptar provider desde caller.
5. Doble ejecución:
   - usar `actionId` como idempotency key persistida server-side;
   - dos requests concurrentes/repetidos no pueden crear dos citas ni repetir side effects;
   - un retry completado devuelve el mismo resultado;
   - un fallo permite retry seguro o devuelve estado inequívoco, sin sobrescribir citas existentes.
   Implementar con una colección interna y transacción/lease, o un mecanismo equivalente probado.

## TDD y verificación

Pruebas RED→GREEN para:

- POST/secret constante y campos prohibidos;
- validación UUID/ISO/futuro/duración/dirección;
- precio/servicio/kit grounded;
- selección de provider real para slot exacto y rechazo si ya no está disponible;
- handlers callables existentes conservan auth/contrato;
- create/reschedule llaman una sola vez al núcleo canónico;
- idempotencia secuencial y concurrente;
- mapping 4xx/409/500 sin exposición;
- reschedule no acepta appointment/provider inventados.

Ejecutar Jest enfocado, suite Functions completa práctica, `npm run build`, lint/diagnósticos disponibles y `graphify update .`.

Crear commits locales aislados:

- Firebase: solo código/tests/índices necesarios de Fase 5B1.
- CRM: reporte `.superpowers/sdd/fase5b1-appointment-bridges-report.md` si no queda absorbido por actividad concurrente.

No push, deploy ni mutación de secretos. Preservar WIP V5; no reset/stash/checkout ni reescritura.
