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

Credenciales demo del seed local:

- Correo: `admin@prosavis.local`
- Contrasena: `Prosavis123!`

## Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Para usar Supabase local, deja `VITE_SUPABASE_URL=http://127.0.0.1:54321`
y copia la anon key que entrega `npx supabase start`.

Para usar Supabase remoto, crea `.env.local` desde `.env.example` y completa
las variables con la URL y publishable/anon key del proyecto remoto.

## Despliegue

- Supabase remoto: `https://djzwjaegxbhlefanmmee.supabase.co`
- Vercel: `https://prosavis-crm-whatsapp.vercel.app`
- El admin remoto inicial usa el correo `support@prosavis.com`.

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
- Edge Functions minimas para envio stub, lectura, patch y settings.
- Deploy preparado para Vercel con `vercel.json`.

No se activa el webhook real de Meta ni se migran historicos de Firestore en esta
fase.
