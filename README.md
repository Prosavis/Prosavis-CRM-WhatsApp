# Prosavis CRM WhatsApp

Aplicativo independiente para operar Inbox, Métricas, Leads y Descuentos de WhatsApp Cloud con **Supabase** (sin Firebase).

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

## Checklist operativo (después de configurar tokens)

1. **Meta Developers** → Webhook → Callback URL = URL de webhook arriba; Verify Token = mismo valor que `WHATSAPP_VERIFY_TOKEN` → **Verificar y guardar**.
2. Confirmar en Supabase Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, verify token y app secret (ya hechos si indicaste que configuraste los dos tokens).
3. Cuando quieras **inbox entrante real**: `WHATSAPP_WEBHOOK_MODE=active` (mientras esté en `shadow`, los POST se auditan pero no materializan chats).
4. Para **enviar** desde el CRM: `ENABLE_META_SEND=true` y token de Meta válido.
5. **Vercel** (`prosavis-crm-whatsapp`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_PHONE_NUMBER_ID` en Production → nuevo deploy (Vite incrusta `VITE_*` en build).
6. **Nuevo deploy en Vercel** tras cambiar `VITE_*` (dashboard o `npx vercel deploy --prod`).

7. Prueba: enviar un WhatsApp al número WABA → revisar filas en `whatsapp_webhook_events`, `whatsapp_conversations`, `whatsapp_message_log`.

## Edge Functions en remoto

**Todas las funciones del repo están desplegadas** en `djzwjaegxbhlefanmmee` (42 slugs, mayo 2026).

- **Implementación completa:** webhook, envío de chat, métricas, log, settings, media, patch/mark read, purge, leads→conversación, plantillas IA (list), etc.
- **Stub autenticado** (evitan 404; respuesta mínima hasta portar lógica del Panel): reacciones, bulk, plantillas Meta, stickers/snippets CRUD, sugerencia IA, transcripción, Wompi, etc.

Para **re-desplegar** tras cambiar código en `supabase/functions/`:

```powershell
npx supabase login
.\scripts\deploy-edge-functions.ps1
```

O regenerar manifest y desplegar por lotes:

```powershell
node scripts/pack-edge-function.mjs > scripts/deploy-manifest.json
```

## Operación WhatsApp Cloud

- `on-whatsapp-webhook` audita cada POST, valida firma con `WHATSAPP_APP_SECRET` y procesa mensajes solo con `WHATSAPP_WEBHOOK_MODE=active`.
- Reintentos de Meta se deduplican por huella del payload y `wa_message_id`.
- Media entrante con `media_id` se registra en log; descarga completa vía `get-whatsapp-media-url` cuando hay token Meta.

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
