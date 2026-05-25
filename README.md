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

- Correo: `admin@prosavis.local`
- Contrasena: `Prosavis123!`

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
- Vercel: `https://prosavis-crm-whatsapp.vercel.app`
- El admin remoto inicial usa el correo `support@prosavis.com`.
- Webhook Meta objetivo:
  `https://djzwjaegxbhlefanmmee.supabase.co/functions/v1/on-whatsapp-webhook`

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

`supabase/seed.sql` es solo para desarrollo local. Produccion debe iniciar sin
datos demo y poblarse unicamente con eventos reales entrantes de Meta o mensajes
salientes enviados correctamente por WhatsApp Cloud API.
