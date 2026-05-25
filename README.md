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

## Alcance Fase 1

- Inbox con conversaciones y mensajes por Supabase Realtime.
- Metricas agregadas desde `whatsapp_message_log`.
- Tags del inbox.
- Edge Functions minimas para envio stub, lectura, patch y settings.
- Deploy preparado para Vercel con `vercel.json`.

No se activa el webhook real de Meta ni se migran historicos de Firestore en esta
fase.
