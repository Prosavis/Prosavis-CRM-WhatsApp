# V5 Fase 0A — Foundation schema report

## Estado

`DONE_WITH_CONCERNS`

El esquema foundation, sus constraints, índices, RLS, grants y pruebas pgTAP
quedaron implementados localmente en `master`. La verificación dinámica no pudo
ejecutarse porque Docker Desktop/Podman no está instalado o disponible en
`PATH`; no se usó el proyecto remoto como sustituto.

## Archivos cambiados

- `supabase/MIGRATIONS.md`
- `supabase/migrations/20260803143500_crm_electronic_invoices.sql`
  (renombrado desde `20260803120000_crm_electronic_invoices.sql`)
- `supabase/migrations/20260805120000_ops_v5_foundation.sql`
- `supabase/tests/ops_v5_foundation_schema.test.sql`
- `supabase/tests/ops_v5_foundation_rls.test.sql`
- `.superpowers/sdd/v5-phase-0a-foundation-report.md`

No se modificaron ni incluyeron en commits los cambios preexistentes ajenos al
task.

## Implementación

- Se conservó `20260803120000_repair_reminder_crossed_cleaner_names.sql` y se
  movió la migración de facturación a la versión contractual
  `20260803143500`.
- Se ejecutó primero `npx supabase migration new ops_v5_foundation`; el CLI
  generó `20260805214253_ops_v5_foundation.sql` y luego se ajustó al timestamp
  contractual `20260805120000`.
- Se crearon `buildings`, `bookings`, `booking_crew`, `booking_addons`,
  `booking_events` y `cleaner_availability`.
- Se extendió `crm_team_members` sin reemplazar su PK compuesta ni
  `contract_type`.
- Se añadieron checks exhaustivos, importes/minutos no negativos, validación de
  rangos y coordenadas, FKs compuestas por servicio, índices operacionales y un
  índice único parcial para el lead.
- Las seis tablas nuevas tienen RLS y una policy CRUD para `authenticated`
  condicionada por `app_private.is_crm_admin()`, con `USING` y `WITH CHECK`.
  Los grants CRUD son explícitos para `authenticated` y se revocó todo acceso
  de `anon`/`public`.
- No se ejecutó `migration repair`, `db push`, `apply_migration` ni ninguna
  mutación remota.

## Ciclos red → green

### Seam 1: constraints y service scope

1. **Red preparado:** se escribió primero
   `supabase/tests/ops_v5_foundation_schema.test.sql`, cubriendo tablas,
   extensiones de operarias, estados, importes, minutos, rangos, FKs
   multi-servicio y lead único.
2. **Red intentado:** `npx supabase db reset --local` no llegó a aplicar las
   migraciones ni a ejecutar pgTAP:

   ```text
   LegacyDbBootstrapError: failed to inspect service
   ```

3. **Green implementado:** se añadió el DDL mínimo en
   `20260805120000_ops_v5_foundation.sql`.
4. **Green dinámico pendiente:** no verificable sin el runtime local de Docker.

### Seam 2: RLS

1. **Red preparado:** se escribió
   `supabase/tests/ops_v5_foundation_rls.test.sql` para comprobar RLS en las
   seis tablas, grants, ausencia de acceso `anon`, bloqueo de authenticated no
   admin y CRUD de admin activo.
2. **Green implementado:** se añadieron RLS, policies y grants.
3. **Green dinámico pendiente:** bloqueado por la misma falta de Postgres local.

## Verificaciones y salida

### Supabase CLI

- `npx supabase --version`

  ```text
  2.111.0
  ```

- `npx supabase db reset --local`

  ```text
  LegacyDbBootstrapError: failed to inspect service
  ```

- `npx supabase test db --local`

  ```text
  LegacyDbConnectError: failed to connect to postgres:
  connect ECONNREFUSED 127.0.0.1:54322
  Make sure Docker is running, then run: supabase start
  ```

- `npx supabase migration list --local`

  ```text
  LegacyDbConnectError: failed to connect to postgres:
  connect ECONNREFUSED 127.0.0.1:54322
  ```

- `npx supabase status --debug`

  ```text
  LegacyStatusDbInspectError: docker: command not found
  (podman also not found)
  ```

### Verificaciones estáticas

- Timestamps de migración: `59` versiones únicas; sin colisiones.
- Declaraciones de tablas foundation: `6/6`.
- Literales contractuales de estados y tipos: completos.
- RLS/policies/`WITH CHECK`: `6/6/6`.
- `git diff --cached --check`: exit code `0`.
- Diagnósticos IDE de los archivos editados: sin errores.
- `graphify update .` se intentó desde la raíz del workspace y falló por una
  instalación local rota:

  ```text
  ModuleNotFoundError: No module named 'graphify'
  ```

## Commits

- `78e0cce` — `feat(db): add V5 foundation schema`

El reporte se guarda en un commit documental separado para mantener el commit
de implementación enfocado.

## Riesgos y preocupaciones

1. Las pruebas pgTAP y la aplicación completa de las migraciones no están
   confirmadas en runtime local hasta disponer de Docker Desktop o Podman.
2. El historial remoto de la migración de facturación sigue pendiente de una
   reconciliación separada, deliberadamente fuera de alcance.
3. Antes de desplegar, ejecutar localmente:
   `npx supabase db reset --local`, `npx supabase test db --local` y
   `npx supabase migration list --local`.
4. El grafo del workspace no pudo actualizarse hasta reparar la instalación
   local del CLI Graphify.
