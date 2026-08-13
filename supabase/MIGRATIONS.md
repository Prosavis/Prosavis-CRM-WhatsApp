# Migraciones Supabase — Prosavis CRM WhatsApp

Proyecto remoto: `djzwjaegxbhlefanmmee` (`prosavis-crm-whatsapp`).

## Flujo normal

```powershell
cd Prosavis-CRM-WhatsApp
npx supabase migration list
npx supabase db push
```

Respuesta esperada: `Remote database is up to date.`

## Desfase local ↔ remoto

Ocurre cuando el DDL se aplicó en producción con timestamps distintos a los archivos en git (MCP `apply_migration`, dashboard, o CLI desde otra máquina).

### Síntoma

```
Remote migration versions not found in local migrations directory.
```

o `db push` pide `--include-all` por migraciones “insertadas antes de la última”.

### Diagnóstico

```powershell
npx supabase migration list
```

| Columna | Significado |
|---------|-------------|
| `local` con valor, `remote` vacío | Archivo en git no registrado en remoto (DDL puede estar aplicada igual) |
| `local` vacío, `remote` con valor | Entrada fantasma en remoto (sin archivo en git) |

### Reparación (sin revertir SQL)

1. **Fantasmas remoto** → `repair --status reverted` (solo limpia `schema_migrations`).
2. **Git sin registrar** → `repair --status applied` (marca como aplicada sin re-ejecutar SQL).
3. Verificar con `db push` y `migration list` (todas las filas deben tener local = remote).

Ejemplo completo (historial recordatorios 02/07/2026): ver [RECORDATORIO_WHATSAPP_24H.md §7](../../prosavis-firebase/docs/whatsapp/RECORDATORIO_WHATSAPP_24H.md#7-despliegue) en `prosavis-firebase`.

### Timestamps duplicados

Supabase usa el prefijo numérico del nombre de archivo como versión. **Un timestamp = un archivo.**

Renombrado 02/07/2026:

| Antes | Después |
|-------|---------|
| `20260612170000_crm_directory_issues_ai_progress.sql` | `20260612170100_crm_directory_issues_ai_progress.sql` |
| `20260612170000_recreate_whatsapp_stickers.sql` | `20260612170200_recreate_whatsapp_stickers.sql` |

Tras renombrar, registrar la nueva versión:

```powershell
npx supabase migration repair --status applied 20260612170100 20260612170200
```

### Colisión local del 03/08/2026

`20260803120000_repair_reminder_crossed_cleaner_names.sql` fue creado primero y
conserva la versión `20260803120000`. La migración local de facturación
electrónica se renombró a
`20260803143500_crm_electronic_invoices.sql` para eliminar la colisión.

### Baseline local de `crm_directory` (12/08/2026)

La tabla se creó originalmente fuera de git. Para `db reset --local` existe
`20260609115900_crm_directory_baseline.sql` (`CREATE TABLE IF NOT EXISTS`).
No hacer `db push` de esa versión sin reconciliar `schema_migrations`.

### Trigger de facts por tabla (12/08/2026)

`20260812160000_ops_v5_facts_trigger_table_guard.sql` evita que el trigger
compartido lea `old.cleaner_id` en `booking_events` (el INSERT fallaba) y
omite el rollup diario en DELETE si `scheduled_start` es null.

El DDL de facturación ya existe en remoto y es idempotente. El historial remoto
de estas versiones sigue pendiente de una reconciliación separada: este
renombrado local no ejecuta `migration repair`, `db push` ni otra mutación
remota.

## Alternativa: pull desde remoto

Si el esquema de producción es la fuente de verdad y diverge mucho del repo:

```powershell
npx supabase db pull
```

Revisar el SQL generado antes de commitear.

## Estado actual

### Histórico (02/07/2026)

- Historial remoto de recordatorios/reactivaciones alineado en esa fecha.
- Última migración recordatorios: `20260702120000_reminder_batch_events.sql`.
- Reactivaciones: `20260721120000_whatsapp_reactivation_automations.sql`.
- RLS directorio: `20260721133000_enable_rls_directory_issues_suggestions_backup.sql`
  (desde 12/08: guard si falta tabla backup en reset local).

### OPS V5 (12/08/2026 noche)

- Gate SQL local: **313 tests PASS** (`npm run test:ops-v5-sql`).
- WIP local (puede estar sin commit): baseline `crm_directory`
  (`20260609115900`) + trigger facts (`20260812160000`).
- **No** `db push` de `20260609115900` sin reconciliar `schema_migrations`.
- Activación operativa (orden de pasos): ver
  [prosavis-v5-activacion-runbook.md](../../prosavis-firebase/docs/context/prosavis-v5-activacion-runbook.md)
  §1 (commit) y §10 (`db push`).
