# Prosavis CRM WhatsApp

Aplicativo independiente para operar Inbox, Métricas, Leads y Descuentos de WhatsApp Cloud con **Supabase** (sin Firebase).

**Migración:** datos históricos importados desde Firestore (mayo 2026).

**Documentación centralizada** (prosavis-firebase):

- [MIGRACION_SUPABASE_CRM.md](https://github.com/Prosavis/prosavis-firebase/blob/main/docs/whatsapp/MIGRACION_SUPABASE_CRM.md) — cutover, runbook, rollback
- [WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md](https://github.com/Prosavis/prosavis-firebase/blob/main/docs/whatsapp/WHATSAPP_CRM_SUPABASE_ARQUITECTURA.md) — schema, Edge Functions, Storage
- [crm-supabase-etl-runbook.md](https://github.com/Prosavis/prosavis-firebase/blob/main/docs/operacion-y-despliegue/crm-supabase-etl-runbook.md) — scripts ETL, validación, capacidad
- [guia-operativa-meta-whatsapp.md](https://github.com/Prosavis/prosavis-firebase/blob/main/docs/operacion-y-despliegue/guia-operativa-meta-whatsapp.md) — webhook Meta, plantillas WABA

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

**Admin local** (solo seed de desarrollo, ver `supabase/seed.sql`):

- Correo: `support@prosavis.com`
- Contraseña: la definida en el seed (no usar en producción).

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
| `NVIDIA_API_KEY` | IA en inbox: sugerencias, plantillas, booking JSON, transcripción audio |
| `NVIDIA_MODEL_REPLY` | Modelo reply (default `meta/llama-4-maverick-17b-128e-instruct`) |
| `NVIDIA_MODEL_JSON` | Modelo JSON booking (default `nvidia/nemotron-mini-4b-instruct`) |
| `NVIDIA_MODEL_TEMPLATE` | Modelo plantillas IA (default igual que reply) |
| `NVIDIA_MODEL_TRANSCRIBE` | Modelo STT (default `google/gemma-3n-e4b-it`) |

Configuración rápida con archivo local (ver `.env.secrets.local.example`):

```powershell
Copy-Item .env.secrets.local.example .env.secrets.local
# Editar .env.secrets.local con NVIDIA_API_KEY y tokens Meta
.\scripts\set-supabase-secrets.ps1
.\scripts\deploy-wave-a-llm.ps1
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
| `delete_conversation_media` | Borra Storage + `whatsapp_media_assets` + refs en log |
| `backfill_metadata` | Sincroniza `size_bytes`; lote SHA-256 en Edge |

RPCs Postgres (`SECURITY DEFINER`, admin CRM): `get_storage_stats`, `get_storage_overview`, `get_conversation_storage_ranking`, `get_duplicate_pdf_groups`, `get_storage_orphans`, `get_storage_suggestions`, `backfill_media_metadata`.

Fuente de verdad de bytes: `storage.objects.metadata->size`. Índice semántico: `whatsapp_media_assets` (`sha256`, `size_bytes`, chat).

Migración: `supabase/migrations/20260702130000_storage_monitor_intelligence.sql`.

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

Usuario inicial remoto: `support@prosavis.com` (`super_admin`). La contraseña se gestiona en Supabase Auth (no va en el repositorio).
