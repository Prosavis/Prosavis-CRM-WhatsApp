# V5 Fase 0A — Foundation schema

## Contexto

Este es el primer bloque del plan V5. Firestore `appointments` continúa como
SSOT transaccional. Supabase recibe una proyección operacional y analítica.
No existe una tabla `cleaners`: las operarias son `public.crm_team_members`,
cuya PK actual es `(service_id text, id text)`.

Trabaja en `Prosavis-CRM-WhatsApp` sobre la rama única `master`. No crees ramas
ni worktrees. Conserva sin modificar los cambios no relacionados que ya están
en el working tree.

## Alcance

1. Corregir la colisión local de migraciones `20260803120000`:
   - `20260803120000_repair_reminder_crossed_cleaner_names.sql` fue creado
     primero y conserva esa versión.
   - Renombrar `20260803120000_crm_electronic_invoices.sql` a
     `20260803143500_crm_electronic_invoices.sql`.
   - El DDL de facturas ya existe remotamente y es idempotente. No ejecutar
     `migration repair`, `db push`, `apply_migration` ni ninguna mutación remota.
   - Actualizar `supabase/MIGRATIONS.md` para documentar la colisión y que el
     historial remoto sigue pendiente de reconciliación separada.

2. Crear la migración local
   `supabase/migrations/20260805120000_ops_v5_foundation.sql`.
   Ejecuta primero `npx supabase migration new ops_v5_foundation`, según el
   flujo del CLI, y después ajusta el nombre al timestamp contractual si el CLI
   generó otro.

3. Crear el mínimo esquema reproducible para Fases 0B–1:
   - `public.buildings`
   - `public.bookings`
   - `public.booking_crew`
   - `public.booking_addons`
   - `public.booking_events`
   - `public.cleaner_availability`
   - extensiones V5 de `public.crm_team_members`

4. Añadir pruebas SQL bajo `supabase/tests/` para constraints y RLS.

## Contratos vinculantes

- Toda tabla nueva incluye `service_id text not null`.
- Dinero: enteros COP no negativos (`bigint` o `integer` según corresponda).
- Duración/capacidad: minutos enteros no negativos. Las horas son derivadas.
- Fechas operativas usan `date`; instantes usan `timestamptz`.
- IDs Firestore (`appointment_id`, `cleaner_id`, `client_id`) son `text`.
- `cleaner_id` referencia `(service_id, id)` de `crm_team_members`.
- Cada tabla nueva activa RLS y permite CRUD únicamente a `authenticated`
  cuando `app_private.is_crm_admin()` sea verdadero. `anon` no recibe acceso.
- Agregar grants explícitos para `authenticated`; no exponer a `anon`.
- Policies `UPDATE` deben tener `USING` y `WITH CHECK`.
- Checks de estados deben ser exhaustivos:
  - booking status: `PENDING`, `PENDING_RESCHEDULE`, `CONFIRMED`, `EN_ROUTE`,
    `IN_PROGRESS`, `COMPLETED`, `CANCELED`, `REJECTED`
  - payment status: `PAGO_PENDIENTE`, `PAGO_EN_PROCESO`, `PAGO_ACEPTADO`
  - payment method: `WOMPI`, `QR`, `CASH`
  - fulfillment: `single`, `composite`
  - assignment source: `manual`, `suggested_accepted`,
    `suggested_overridden`, `auto`
  - availability reason: `none`, `incapacidad`, `vacaciones`, `personal`,
    `no_demand`, `no_response`
  - availability source: `manual`, `whatsapp`, `app`
  - addon sold_at: `checkout`, `onsite`, `rebook`
  - booking event: `creado`, `confirmado`, `reagendado`, `reasignado`,
    `en_proceso`, `finalizado`, `cancelado_cliente`, `cancelado_operaria`,
    `no_pudo_ingresar`
  - building type: `conjunto`, `edificio`, `casa`, `comercial`, `hotel`,
    `airbnb`

## Columnas mínimas

`buildings`: UUID PK, service scope, name/type, unit_count, admin contact,
barrio/comuna, lat/lng, common-area flag, average actual service minutes,
created/updated timestamps.

`bookings`: UUID PK, unique `(service_id, appointment_id)`, source revision/hash
and source timestamps, lifecycle status, tier, required cleaner minutes,
scheduled range, fulfillment/crew size, building/location, client identifiers,
window, payment fields, COP amounts, first-booking/acquisition/CAC/addon flags,
cancellation fee, assignment source/decision ID, soft source deletion marker,
created/updated timestamps.

`booking_crew`: booking and cleaner composite FKs with service scope, assigned
minutes, lead flag, scheduled/actual ranges, `ya_trabajaba_ese_dia`, estimated
marginal COP cost, timestamps, unique crew member per booking.

`booking_addons`: booking FK with service scope, addon ID, minutes, COP price,
sale point and timestamps.

`booking_events`: booking FK with service scope, event, payload JSONB, actor and
created timestamp.

`cleaner_availability`: cleaner composite FK with service scope, operational
date, offered/accepted minutes, window, unavailable reason/source, timestamps,
unique `(service_id, cleaner_id, operational_date)`.

Extender `crm_team_members` sin romper `contract_type` existente:
`hire_date`, `labor_regime` (default `decreto_2616`), home comuna/coordinates,
addon/service skills arrays, alturas certification/expiry, ARL risk class,
accepts composite, preferred max travel minutes, operations status, termination
date/reason. No reemplazar la PK existente.

## Constraints e índices

- Duraciones, importes, conteos y coordenadas válidos.
- `crew_size >= 1`; `composite` requiere al menos 2, `single` requiere 1.
- Rangos con inicio menor al fin cuando ambos existan.
- Accepted availability no excede offered; si accepted > 0, requiere ventana.
- Un solo lead por booking mediante índice único parcial.
- Índices para consultas por servicio+fecha/status, cleaner+fecha/rango,
booking events, client, comuna y joins de booking.
- FKs compuestas deben impedir cruces entre servicios.

## TDD y verificación

Seams ya aprobados por el plan:

1. SQL público del esquema: constraints rechazan estados, duraciones,
   service scopes y rangos inválidos.
2. RLS: `anon` y usuario autenticado no admin no leen/escriben; admin activo sí.

Trabaja verticalmente red → green. Usa pruebas pgTAP compatibles con
`npx supabase test db`. Ejecuta, si el entorno lo permite:

- `npx supabase db reset`
- `npx supabase test db`
- `npx supabase migration list --local`

Si Docker/local Supabase no está disponible, conserva las pruebas y reporta el
bloqueo exacto; no uses producción como sustituto.

## Fuera de alcance

- Proyección Firebase, backfill, facts, jobs, Edge Functions y UI.
- Reparar o desplegar el historial remoto.
- Copiar valores comerciales del spec privado.
- Modificar los archivos no relacionados actualmente sucios.

## Entrega

Escribe el reporte en
`.superpowers/sdd/v5-phase-0a-foundation-report.md` con:

- estado `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` o `BLOCKED`
- archivos cambiados
- ciclos red/green y pruebas/comandos con salida
- commit(s), incluyendo solo archivos de este task
- riesgos o preocupaciones pendientes
