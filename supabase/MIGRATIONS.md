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

## Alternativa: pull desde remoto

Si el esquema de producción es la fuente de verdad y diverge mucho del repo:

```powershell
npx supabase db pull
```

Revisar el SQL generado antes de commitear.

## Estado actual (02/07/2026)

- **31** migraciones locales; historial remoto alineado.
- `npx supabase db push` → `Remote database is up to date.`
- Última migración recordatorios: `20260702120000_reminder_batch_events.sql` (`execution_stats`, `reminder_batch_events`, `run_kind manual`).
- Reactivaciones: `20260721120000_whatsapp_reactivation_automations.sql` (`whatsapp_reactivation_runs`, `_events`, `_preferences` + índice `crm_directory` secuencia).
- RLS directorio: `20260721133000_enable_rls_directory_issues_suggestions_backup.sql` (issues, AI suggestions, backup clients).
