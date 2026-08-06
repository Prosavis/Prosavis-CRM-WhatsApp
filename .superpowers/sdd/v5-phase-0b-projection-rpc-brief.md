# V5 Fase 0B — RPC transaccional de proyección

## Contexto

Firestore `appointments` es el SSOT transaccional. La migración
`20260805120000_ops_v5_foundation.sql` ya creó `bookings`, `booking_crew`,
`booking_addons` y `booking_events`. Esta tarea añade exclusivamente el
contrato SQL atómico que usará Firebase para aplicar una proyección completa.

Trabaja en `Prosavis-CRM-WhatsApp`, rama única `master`. Preserva el archivo
ajeno sin seguimiento y cualquier actividad concurrente. No crees ramas ni
worktrees. No hagas `db push`, `migration repair`, deploy ni mutaciones remotas.

## Alcance

1. Crear una migración con `npx supabase migration new
   ops_v5_booking_projection_rpc`; conservar el timestamp generado por CLI.
2. Crear una función RPC en `public` llamada
   `apply_ops_booking_projection(p_booking jsonb, p_crew jsonb default '[]',
   p_addons jsonb default '[]', p_events jsonb default '[]') returns jsonb`.
3. Añadir pruebas pgTAP en
   `supabase/tests/ops_v5_booking_projection_rpc.test.sql`.

No modificar la migración foundation ni implementar TypeScript/Firebase en
este task.

## Contrato público

La función:

- es `security invoker`, fija `search_path = ''` y solo puede ejecutarla
  `service_role`;
- revoca `execute` de `public`, `anon` y `authenticated`;
- valida que `p_booking` sea objeto y que incluya:
  `service_id`, `appointment_id`, `source_revision`, `source_hash`,
  `source_updated_at`;
- rechaza arrays no-array y cualquier child cuyo `service_id` explícito no
  coincida con el booking;
- inserta/upserta por `(service_id, appointment_id)`;
- aplica solo si no existe fila o si `source_revision` entrante es mayor;
- para la misma revisión y mismo hash devuelve no-op;
- para revisión menor devuelve no-op;
- para la misma revisión con hash distinto devuelve no-op y razón
  `revision_conflict` (no permite alternar payloads);
- solo cuando aplica, reemplaza atómicamente crew/addons/events del booking;
- fuerza `service_id` y `booking_id` de cada child al booking resuelto;
- asigna UUID y timestamps por defecto a rows child cuando falten;
- toda excepción revierte booking y children por atomicidad PostgreSQL.

Respuesta JSON:

```json
{
  "booking_id": "uuid",
  "applied": true,
  "reason": "inserted|updated|same_revision|stale_revision|revision_conflict",
  "source_revision": 123
}
```

`source_revision` es un entero no negativo derivado de `updatedAt`/updateTime
de Firestore. `source_hash` es SHA-256 hexadecimal del payload canónico.

## Reemplazo de children

- `booking_crew`: unique por booking+cleaner; un solo lead; minutos y costos
  no negativos.
- `booking_addons`: conserva catálogo recibido, minutos/precios enteros.
- `booking_events`: recibe snapshot completo de eventos conocidos; el reemplazo
  no debe duplicar conteos en reintentos.
- Arrays vacíos eliminan children existentes cuando la revisión se aplica.
- Un no-op nunca toca children.

## TDD y seams aprobados

Pruebas de interfaz SQL:

1. Primera llamada inserta booking y children, `applied=true`,
   `reason=inserted`.
2. Segunda llamada idéntica devuelve `same_revision`; conteos e importes no
   cambian.
3. Revisión menor devuelve `stale_revision` y no revierte datos nuevos.
4. Misma revisión/hash distinto devuelve `revision_conflict` y no toca rows.
5. Revisión mayor reemplaza booking y children, `reason=updated`, sin
   duplicados.
6. Child de otro `service_id`, estado inválido o dos leads falla y revierte
   toda la llamada.
7. `anon` y `authenticated` no pueden ejecutar; `service_role` sí tiene grant.

Usa literales conocidos en assertions; no recalcules expectativas con la
misma lógica del RPC.

## Verificación

Intentar:

```powershell
npx supabase db reset --local
npx supabase test db --local
```

Docker/Podman no está disponible actualmente. Si sigue bloqueado, conserva
tests completos, ejecuta checks estáticos de timestamps, grants, función y
casos, y reporta el error exacto. No uses producción como sustituto.

## Entrega

Commit funcional únicamente con migración+test. Reporte separado en
`.superpowers/sdd/v5-phase-0b-projection-rpc-report.md` con estado, archivos,
red/green, comandos/salidas y concerns.
