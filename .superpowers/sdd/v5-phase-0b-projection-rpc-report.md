# V5 Fase 0B — Reporte RPC transaccional de proyección

## Estado

- Implementación funcional creada en `master`.
- Commit funcional: `cec71cd` (`feat(db): add V5 booking projection RPC`).
- No se creó rama ni worktree.
- No se ejecutó `db push`, `migration repair`, deploy ni mutación remota.
- La ejecución PostgreSQL local quedó bloqueada porque el stack local no está disponible.

## Archivos funcionales

- `supabase/migrations/20260806143454_ops_v5_booking_projection_rpc.sql`
- `supabase/tests/ops_v5_booking_projection_rpc.test.sql`

La migración fue creada primero con:

```text
npx supabase migration new ops_v5_booking_projection_rpc
{"path":"...\supabase\migrations\20260806143454_ops_v5_booking_projection_rpc.sql","message":"Migration created"}
```

El timestamp CLI `20260806143454` no colisiona con otra migración local.

## Red → green

### Red

Se creó primero la prueba pgTAP contra la migración vacía. El entorno impidió
observar el fallo contractual porque PostgreSQL local no llegó a iniciar:

```text
npx supabase db reset --local
LegacyDbBootstrapError: failed to inspect service
```

```text
npx supabase test db --local
LegacyDbConnectError: failed to connect to postgres:
dial error (connect ECONNREFUSED 127.0.0.1:54322)
Suggestion: Make sure Docker is running, then run: supabase start
```

### Green

Se implementó `public.apply_ops_booking_projection(jsonb, jsonb, jsonb, jsonb)`
con:

- `security invoker` y `search_path = ''`;
- `EXECUTE` revocado a `PUBLIC`, `anon` y `authenticated`, concedido solo a
  `service_role`;
- validación de booking, arrays, revisión/hash y aislamiento por `service_id`;
- serialización transaccional por booking, reglas de revisión idempotentes y
  conflicto de hash;
- reemplazo atómico de crew, addons y events únicamente al aplicar;
- IDs y timestamps child por defecto, con `service_id` y `booking_id` forzados.

La suite pgTAP cubre inserción, retry idéntico, revisión obsoleta, conflicto,
actualización/reemplazo, rollback por errores, grants, payloads inválidos y
arrays vacíos.

La verificación local posterior quedó bloqueada por los mismos errores:

```text
npx supabase db reset --local
LegacyDbBootstrapError: failed to inspect service

npx supabase test db --local
LegacyDbConnectError: ECONNREFUSED 127.0.0.1:54322

npx supabase db lint --local --level error
LegacyDbConnectError: ECONNREFUSED 127.0.0.1:54322
```

Checks estáticos ejecutados:

- `git diff --cached --check` — exit `0`, sin salida.
- Commit funcional verificado con exactamente los dos archivos SQL.
- Diagnósticos IDE sobre ambos SQL — sin errores.
- Inspección estática confirmó timestamp único, función, `security invoker`,
  `search_path`, revokes/grant y todos los casos contractuales.

## Concerns

- No hay evidencia runtime de compilación PL/pgSQL ni de pgTAP verde hasta que
  Docker/Podman permita iniciar el stack local.
- Debe repetirse `npx supabase db reset --local`, `npx supabase test db --local`
  y `npx supabase db lint --local --level error` cuando Docker esté disponible.
- Los archivos y commits concurrentes ajenos se conservaron sin incluirlos en
  el commit funcional.

## Follow-up — correcciones de revisión task-scoped

Se corrigieron los cuatro findings de la revisión `Needs fixes`:

- crew no vacía exige exactamente un `is_lead=true`; crew vacía sigue válida;
- `service_role` recibe grants explícitos `SELECT/INSERT/UPDATE/DELETE` sobre
  `bookings`, `booking_crew`, `booking_addons` y `booking_events`;
- pgTAP ejecuta una proyección completa bajo `SET LOCAL ROLE service_role`;
- el retry idéntico repite exactamente booking y children originales;
- stale y revision conflict validan el JSON completo de respuesta;
- pgTAP cubre cero leads y confirma rollback de booking, crew, addons y events.

### Red

Tras añadir primero las regresiones:

```text
npx supabase test db --local
Connecting to local database...
LegacyDbConnectError: failed to connect to postgres:
dial error (connect ECONNREFUSED 127.0.0.1:54322)
Suggestion: Make sure Docker is running, then run: supabase start
Exit code: 1
```

### Checks posteriores

```text
npx supabase db reset --local
LegacyDbBootstrapError: failed to inspect service
Exit code: 1
```

```text
npx supabase test db --local
Connecting to local database...
LegacyDbConnectError: failed to connect to postgres:
dial error (connect ECONNREFUSED 127.0.0.1:54322)
Suggestion: Make sure Docker is running, then run: supabase start
Exit code: 1
```

```text
npx supabase db lint --local --level error
Connecting to local database...
LegacyDbConnectError: failed to connect to postgres:
dial error (connect ECONNREFUSED 127.0.0.1:54322)
Suggestion: Make sure Docker is running, then run: supabase start
Exit code: 1
```

```text
git diff --check
Exit code: 0
Warnings CRLF sobre archivos del task y cambios concurrentes; sin errores.
```

Diagnósticos IDE de migración y pgTAP: sin errores.

### Concern vigente

La compilación PL/pgSQL y la ejecución pgTAP continúan sin evidencia runtime
hasta que el stack local PostgreSQL pueda iniciar. No se usó producción como
sustituto.
