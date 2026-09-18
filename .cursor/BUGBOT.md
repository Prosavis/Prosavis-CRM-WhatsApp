# Bugbot — CRM WhatsApp

Inbox, directorio y envíos Meta sobre Supabase. Prioridad: IDOR, fugas de chat y tokens. Autofix: **Create New Branch**. No auto-aprobar.

## Es bug (comentar)

- **IDOR:** endpoints, RPCs o queries que acepten `conversationId`, `stableKey`, `mediaId`, `mediaAssetId`, `directoryId`, `appointmentId` u otro ID sin `requireCrmAdmin` / `app_private.is_crm_admin()` / RLS `auth.uid()`. Signed URLs de media de **otro** hilo. RLS permisiva, `SECURITY DEFINER` sin check de admin, o grants a `anon`/`authenticated` sobre mensajes, directorio o storage.
- **Fugas de chat:** mezclar Inbox Bot 312 e Inbox Comercial 311 (tokens, LID, `whatsapp_conversation_id` vs `whatsapp_commercial_conversation_id`). Mostrar o cachear mensajes, media, notas o contexto IA de otro contacto. Logs/errores/respuestas HTTP con cuerpos de chat, teléfonos o signed URLs. Realtime o caches (`inboxConversationCache`, `inboxMessageCache`, `mediaUrlCache`) que crucen claves.
- **Tokens Meta / Supabase:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_COMMERCIAL_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` en `VITE_*`, bundle, tests commiteados o logs. Webhook Meta sin `x-hub-signature-256` / verify token. `service_role` en el frontend. Ampliar `GITHUB_TOKEN` o meter secrets en el CI de review. `ENABLE_META_SEND=true` en CI.

## No es bug (no comentar)

- Estilo, copy, naming, imports o docs.
- Lint Deno/edge ya conocido (`crm-quality` no falla el PR por lint).
- Performance o UX salvo que filtre datos.
- Playwright e2e desactivado a propósito.
- “Añade un test” si no hay hueco de auth, chat o token.

## Dominio

- Frontend: solo anon/publishable (`src/config/supabase.ts`). Edge: `requireCrmAdmin` en `_shared/supabase.ts`.
- Deploy Vercel es `workflow_dispatch` (`deploy-vercel.yml`). Review no despliega.
- Un hallazgo por exploit o fuga. Cita el ID o función que queda al alcance.
