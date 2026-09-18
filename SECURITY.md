# Security

Este repo opera el CRM de WhatsApp (inbox, directorio, tokens Meta y Supabase). Trata chats y PII de clientes.

## Cómo reportar

Envía el hallazgo en privado a **support@prosavis.com**. No abras un issue público con secretos, tokens, dumps de chat o un repro que filtre datos de clientes.

Incluye impacto y pasos mínimos. No pegues `WHATSAPP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, JWT ni mensajes reales.

No esperamos acknowledgement público. Si el reporte es válido, lo priorizamos y avisamos por el mismo hilo.

## Qué no hacer

- No commitear `.env`, service role, verify token, app secret ni access tokens de Meta.
- No ampliar permisos de `GITHUB_TOKEN` ni añadir secrets al workflow de review.
- `VITE_SUPABASE_ANON_KEY` es publishable; no es un canal de reporte ni sustituye al `service_role`.
