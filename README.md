# Prosavis CRM WhatsApp

Aplicativo independiente para operar Inbox y Metricas de WhatsApp Cloud con
Supabase. Esta Fase 1 no usa Firebase, Firestore, Firebase Functions ni Firebase
Storage.

## Desarrollo Local

```powershell
npm install
npx supabase start
npx supabase db reset
npm run dev
```

La app corre en `http://localhost:3001`.

Credenciales del seed local. Son exclusivamente para desarrollo y no representan
operacion productiva:

- Correo: `support@prosavis.com`
- Contrasena: la clave operativa definida para el admin de soporte.

## Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WHATSAPP_PHONE_NUMBER_ID=
```

Para usar Supabase local, deja `VITE_SUPABASE_URL=http://127.0.0.1:54321`
y copia la anon key que entrega `npx supabase start`.

Para usar Supabase remoto, crea `.env.local` desde `.env.example` y completa
las variables con la URL y publishable/anon key del proyecto remoto.

Los secrets de Edge Functions no llevan prefijo `VITE_` y no se exponen al
navegador:

```env
ENABLE_META_SEND=false
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_MODE=shadow
META_GRAPH_API_VERSION=v21.0
```

En produccion, `ENABLE_META_SEND=false` significa modo mantenimiento: la funcion
de envio no genera mensajes falsos ni inserta stubs. Para operar con trafico real
de Meta se requiere `ENABLE_META_SEND=true`, secrets validos y
`WHATSAPP_WEBHOOK_MODE=active`.

## Despliegue

- Supabase remoto: `https://djzwjaegxbhlefanmmee.supabase.co`
- Vercel production activo: `https://prosavis-crm-whats-app.vercel.app`
- Proyecto Vercel correcto: `prosavis-crm-whats-app`
- Proyecto Vercel anterior/no usado para operacion: `prosavis-crm-whatsapp`
- El admin remoto inicial usa el correo `support@prosavis.com`.
- Webhook Meta objetivo:
  `https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/on-whatsapp-webhook`

### Estado De Deploy - 2026-05-25

- Deploy Vercel correcto: `prosavis-crm-whats-app`, commit `6992b54`, status
  `READY`, production.
- La URL usada por operadores debe ser
  `https://prosavis-crm-whats-app.vercel.app/login`.
- El error `Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY` significa que el
  bundle fue construido sin variables publicas `VITE_*` para el proyecto Vercel
  usado por esa URL.
- Causa encontrada: existian dos proyectos Vercel con nombres casi iguales. Las
  variables se habian configurado inicialmente en `prosavis-crm-whatsapp`, pero
  el dominio operativo apunta a `prosavis-crm-whats-app`.
- Variables publicas requeridas en Vercel Production para `prosavis-crm-whats-app`:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_WHATSAPP_PHONE_NUMBER_ID`.
- Despues de cambiar variables `VITE_*` en Vercel, hay que hacer redeploy para
  que Vite las incruste en el bundle.

### Logs De Deploy Relevantes

```text
Running build in Washington, D.C., USA (East) - iad1
Cloning github.com/Prosavis/Prosavis-CRM-WhatsApp (Branch: master, Commit: 6992b54)
Running "vercel build"
Vercel CLI 54.4.1
npm install: added 303 packages
npm run build: tsc -b && vite build
vite v8.0.14 building client environment for production
13164 modules transformed
dist/index.html 0.47 kB
dist/assets/index-EQKWOhBe.css 0.40 kB
dist/assets/index-DM_XqlwN.js 1,128.47 kB
```

Advertencia esperada:

```text
Some chunks are larger than 500 kB after minification
```

No bloquea el deploy; solo indica que conviene aplicar code splitting despues.

### Pendiente Para Operacion Real

- Confirmar en Vercel que `prosavis-crm-whats-app` tenga estas variables en
  Production y que el ultimo deploy sea posterior a su configuracion:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_WHATSAPP_PHONE_NUMBER_ID`.
- Configurar secrets reales en Supabase Edge Functions:
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `ENABLE_META_SEND=true`,
  `WHATSAPP_WEBHOOK_MODE=active`, `META_GRAPH_API_VERSION=v21.0`.
- En Meta Developers, configurar el callback a
  `https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/on-whatsapp-webhook`
  usando el mismo `WHATSAPP_VERIFY_TOKEN`.
- Enviar un mensaje real al numero WABA y validar filas nuevas en
  `whatsapp_webhook_events`, `whatsapp_conversations` y
  `whatsapp_message_log`.

## Operacion WhatsApp Cloud

- `on-whatsapp-webhook` audita cada POST, valida firma cuando
  `WHATSAPP_APP_SECRET` esta configurado y procesa mensajes/statuses solo con
  `WHATSAPP_WEBHOOK_MODE=active`.
- Los reintentos de Meta se deduplican por huella del payload y por
  `wa_message_id`, evitando conversaciones o mensajes duplicados.
- La descarga completa de media queda para una etapa posterior; los mensajes con
  `media_id` se registran inmediatamente para no perder trazabilidad.

## Verificacion

```powershell
npm run type-check
npm run lint
npm run build
npm run dev
```

## Alcance Fase 1

- Inbox con conversaciones y mensajes por Supabase Realtime.
- Metricas agregadas desde `whatsapp_message_log`.
- Tags del inbox.
- Edge Functions minimas para lectura, patch, settings, media, auditoria de
  webhook y envio real cuando Meta este configurado.
- Deploy preparado para Vercel con `vercel.json`.

`supabase/seed.sql` es solo para desarrollo local y solo crea el admin de soporte.
Produccion debe iniciar sin conversaciones, mensajes, tags ni datos demo, y
poblarse unicamente con eventos reales entrantes de Meta o mensajes salientes
enviados correctamente por WhatsApp Cloud API.
