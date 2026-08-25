# Prosavis CRM WhatsApp

Aplicativo independiente para operar Inbox, Métricas, Leads y Descuentos de WhatsApp Cloud con **Supabase** (sin Firebase).

**Migración:** datos históricos importados desde Firestore (mayo 2026).

**Documentación centralizada** (prosavis-firebase):

- [CRM_INBOX_AI_CONTEXTO.md](../prosavis-firebase/docs/whatsapp/CRM_INBOX_AI_CONTEXTO.md) — **sugerencias IA ✨** (Gemini 3.6 Flash + contexto CRM: tags, citas, propiedades)
- [CRM_INBOX_BULK_TAGS.md](../prosavis-firebase/docs/whatsapp/CRM_INBOX_BULK_TAGS.md) — **tags masivos** (checklist por intersección; quitar/agregar en lote)
- [MIGRACION_SUPABASE_CRM.md](../prosavis-firebase/docs/whatsapp/MIGRACION_SUPABASE_CRM.md) — cutover, runbook, rollback
- [WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md](../prosavis-firebase/docs/whatsapp/WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md) — schema, Edge Functions, Storage
- [crm-supabase-etl-runbook.md](../prosavis-firebase/docs/operacion-y-despliegue/crm-supabase-etl-runbook.md) — scripts ETL, validación, capacidad
- [guia-operativa-meta-whatsapp.md](../prosavis-firebase/docs/operacion-y-despliegue/guia-operativa-meta-whatsapp.md) — webhook Meta, plantillas WABA, **coexistencia Coex (§J)**

Ruta local en monorepo: `prosavis-firebase/docs/whatsapp/` y `docs/operacion-y-despliegue/`.

## URLs y proyectos

| Recurso | Valor |
| --- | --- |
| Supabase (remoto) | `https://djzwjaegxbhlefanmmee.supabase.co` |
| App producción (Vercel) | `https://prosavis-crm-whatsapp.vercel.app` |
| Proyecto Vercel | `prosavis-crm-whatsapp` |
| Webhook Meta | `https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/on-whatsapp-webhook` |

## Desarrollo local

```powershell
npm install
npx supabase start
npx supabase db reset
npm run dev
```

La app corre en `http://localhost:3001`.

**Admin** (Google OAuth, allowlist):

- `admin@prosavis.com` (`super_admin`)
- `support@prosavis.com` (`super_admin`)
- `oliverafrancy@gmail.com` (`admin`)
- `johislaflaca07@gmail.com` (`admin`)

Habilitar el proveedor **Google** en Supabase Auth (Dashboard → Authentication → Providers) y agregar la URL de callback de la app (`https://prosavis-crm-whatsapp.vercel.app/login` y `http://localhost:3001/login`).

## Variables de entorno

### Frontend (`.env.local`, prefijo `VITE_`)

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WHATSAPP_PHONE_NUMBER_ID=
```

- Local: `VITE_SUPABASE_URL=http://127.0.0.1:54321` y anon key de `npx supabase start`.
- Remoto: copiar URL y **publishable/anon key** del proyecto `djzwjaegxbhlefanmmee`.

### Edge Functions (secrets en Supabase Dashboard → Edge Functions → Secrets)

**Nunca** exponer como `VITE_*`. Configurar en producción vía Dashboard o:

```powershell
npx supabase secrets set --project-ref djzwjaegxbhlefanmmee `
  WHATSAPP_ACCESS_TOKEN=... `
  WHATSAPP_PHONE_NUMBER_ID=... `
  WHATSAPP_VERIFY_TOKEN=... `
  WHATSAPP_APP_SECRET=... `
  ENABLE_META_SEND=true `
  WHATSAPP_WEBHOOK_MODE=active `
  META_GRAPH_API_VERSION=v21.0
```

Referencia local en `.env.example` (solo para `supabase functions serve`).

| Secret | Uso |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Validación GET del webhook en Meta |
| `WHATSAPP_APP_SECRET` | Firma HMAC del POST de Meta |
| `WHATSAPP_ACCESS_TOKEN` | Envío y descarga de media vía Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador del número WABA |
| `ENABLE_META_SEND` | `true` = envío real; `false` = mantenimiento (sin envíos) |
| `WHATSAPP_WEBHOOK_MODE` | `shadow` = solo audita; `active` = crea conversaciones/mensajes |
| `META_GRAPH_API_VERSION` | Versión Graph API (ej. `v21.0`) |
| `GEMINI_API_KEY` | IA en inbox: sugerencias, booking JSON, transcripción audio |
| `GEMINI_MODEL_REPLY` | Modelo reply (default `gemini-3.6-flash`) |
| `GEMINI_MODEL_JSON` | Modelo JSON booking (default `gemini-3.6-flash`) |
| `GEMINI_MODEL_TRANSCRIBE` | Modelo STT (default `gemini-3.6-flash`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Lectura Firestore (citas para IA, métricas, reminders) |

Detalle del packer de contexto: [CRM_INBOX_AI_CONTEXTO.md](../prosavis-firebase/docs/whatsapp/CRM_INBOX_AI_CONTEXTO.md).

Configuración rápida con archivo local (ver `.env.secrets.local.example`):

```powershell
Copy-Item .env.secrets.local.example .env.secrets.local
# Editar .env.secrets.local con GEMINI_API_KEY y tokens Meta
npx supabase secrets set --env-file .env.secrets.local --project-ref djzwjaegxbhlefanmmee
.\scripts\deploy-edge-functions.ps1 -Only suggest-whatsapp-agent-reply,get-whatsapp-booking-context
```

## Checklist operativo (después de configurar tokens)

1. **Meta Developers** → Webhook → Callback URL = URL de webhook arriba; Verify Token = mismo valor que `WHATSAPP_VERIFY_TOKEN` → **Verificar y guardar**.
2. Confirmar en Supabase Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, verify token y app secret (ya hechos si indicaste que configuraste los dos tokens).
3. Cuando quieras **inbox entrante real**: `WHATSAPP_WEBHOOK_MODE=active` (mientras esté en `shadow`, los POST se auditan pero no materializan chats).
4. Para **enviar** desde el CRM: `ENABLE_META_SEND=true` y token de Meta válido.
5. **Vercel** (`prosavis-crm-whatsapp`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_PHONE_NUMBER_ID` en Production → nuevo deploy (Vite incrusta `VITE_*` en build).
6. **Nuevo deploy en Vercel** tras cambiar `VITE_*` (dashboard o `npx vercel deploy --prod`).

7. Prueba: enviar un WhatsApp al número WABA → revisar filas en `whatsapp_webhook_events`, `whatsapp_conversations`, `whatsapp_message_log`.

## Scripts ETL (Firebase → Supabase)

En `scripts/firebase-export/`:

```powershell
npm run migrate:inventory
npm run migrate:export -- --phase=whatsapp
npm run migrate:export -- --phase=crm
npm run migrate:validate
npm run migrate:storage -- --prefix=whatsapp-media/ --full-prefix
npm run migrate:sync-admins
npm run migrate:capacity
```

Delta incremental: `--since=2026-05-26T00:00:00.000Z`

## Edge Functions en remoto

- Edge Functions en remoto (42 slugs, mayo 2026) — ver [WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md](https://github.com/Prosavis/prosavis-firebase/blob/main/docs/whatsapp/WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md) en prosavis-firebase.

Para **re-desplegar** tras cambiar código en `supabase/functions/`:

```powershell
npx supabase login
.\scripts\deploy-edge-functions.ps1
```

O regenerar manifest y desplegar por lotes:

```powershell
node scripts/pack-edge-function.mjs > scripts/deploy-manifest.json
```

## Migraciones Supabase

```powershell
npx supabase migration list
npx supabase db push
```

Si `db push` falla por desfase entre git y `schema_migrations` remoto, ver **[supabase/MIGRATIONS.md](./supabase/MIGRATIONS.md)** (procedimiento `migration repair`, timestamps únicos, estado alineado 02/07/2026).

Recordatorios 24h: despliegue completo en [RECORDATORIO_WHATSAPP_24H.md](../prosavis-firebase/docs/whatsapp/RECORDATORIO_WHATSAPP_24H.md#7-despliegue).

## Operación WhatsApp Cloud

- `on-whatsapp-webhook` audita cada POST, valida firma con `WHATSAPP_APP_SECRET` y procesa mensajes solo con `WHATSAPP_WEBHOOK_MODE=active`.
- Reintentos de Meta se deduplican por huella del payload y `wa_message_id`.
- Media entrante con `media_id` se registra en log; descarga completa vía `get-whatsapp-media-url` cuando hay token Meta.
- Archivos **> 6 MB** se suben a Storage con **TUS resumible** (`uploadToWhatsAppBucket` en `_shared/whatsappMediaStorage.ts`); menores usan upload estándar.

### Límite de tamaño en Supabase Storage (obligatorio)

Supabase aplica `min(límite_global_proyecto, límite_bucket)`. El bucket `whatsapp-media` está configurado a **100 MB**, pero si el **Global file size limit** del proyecto es menor (p. ej. 5–10 MB), videos de WhatsApp (~8–16 MB) fallan con `EntityTooLarge` aunque el bucket permita más.

**Configuración requerida** en [Storage Settings](https://supabase.com/dashboard/project/djzwjaegxbhlefanmmee/storage/settings) del proyecto `djzwjaegxbhlefanmmee`:

1. **Global file size limit** → **100 MB** (alineado con bucket y documentos WhatsApp hasta 100 MB).
2. Verificar bucket `whatsapp-media` → **100 MB** por objeto.

Tras cambiar el límite global, no hace falta redeploy; los uploads fallidos se pueden reintentar desde el inbox (botón reintentar) o tocando el medio de nuevo.

| Error API | Código | UI inbox |
| --- | --- | --- |
| Archivo > 100 MB | `storage_oversized` (413) | Mensaje fijo; sin reintentar |
| Meta expiró el media | `meta_unavailable` (410) | Sin reintentar |
| Storage transitorio | `storage` (502) | Reintentar |

### Monitoreo de Storage (pestaña Monitoreo)

La pestaña **Monitoreo** del CRM consume la Edge Function `whatsapp-storage-monitor` (no RPCs directas desde el browser para ranking/optimización).

| Acción Edge | Uso |
| --- | --- |
| `dashboard` | Gauge, overview multi-bucket, top chats, sugerencias |
| `ranking` | Tabla paginada de **todos** los chats con bytes reales (`storage.objects`) |
| `analyze` | Duplicados PDF + huérfanos (dry-run) |
| `optimize_duplicate_pdfs` | Elimina copias redundantes (SHA-256; conserva 1 por chat) |
| `optimize_stale_catalog_pdfs` | PDF outbound antiguos con mismo hash |
| `delete_conversation_media` | Borra Storage real (`{stableKey}/`) + `whatsapp_media_assets` + refs en log. Rechaza prefijos reservados (`whatsapp-media`, `unknown`). |
| `delete_storage_orphans` | Borra solo huérfanos seguros: sin índice y sin `message_log.storage_path` / `media_id` |
| `backfill_metadata` | Sincroniza `size_bytes`; lote SHA-256 en Edge |

RPCs Postgres (`SECURITY DEFINER`, admin CRM): `get_storage_stats`, `get_storage_overview`, `get_conversation_storage_ranking`, `get_duplicate_pdf_groups`, `get_storage_orphans`, `get_storage_suggestions`, `backfill_media_metadata`.

Fuente de verdad de bytes: `storage.objects.metadata->size`. Índice semántico: `whatsapp_media_assets` (`sha256`, `size_bytes`, chat).

**Plan File Storage:** Supabase **Pro ($25/mes)** → **100 GB** incluidos. Umbral en `platform_settings.storage_monitor_thresholds` (`plan_storage_bytes`). Doc: [CRM_STORAGE_MONITOR.md](../prosavis-firebase/docs/whatsapp/CRM_STORAGE_MONITOR.md).

Migraciones: `supabase/migrations/20260702130000_storage_monitor_intelligence.sql`, `20260819180000_storage_monitor_plan_pro_100gb.sql`.

## Verificación de código

```powershell
npm run type-check
npm run lint
npm run build
```

Build y type-check pasan en el estado actual del repo.

## Alcance Fase 1

- Inbox con conversaciones y mensajes (Supabase Realtime).
- Métricas desde `whatsapp_message_log` y `crm_leads`.
- Tags, Leads, códigos de descuento, configuración WABA.
- Paridad visual con Prosavis-Panel (MUI v5).
- Producción sin datos demo: solo tráfico real de Meta o envíos salientes válidos.

`supabase/seed.sql` es **solo desarrollo local** (admin de soporte).

## Admin producción

Usuario inicial remoto: `support@prosavis.com` (`super_admin`). Acceso vía Google OAuth (allowlist).
