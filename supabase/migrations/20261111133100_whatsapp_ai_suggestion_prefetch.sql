-- Borrador de sugerencia por conversación y último mensaje.
-- No aplicar sin el OK de Nicolás. La Edge solo escribe si INBOX_AI_SUGGEST_PREFETCH=1.

create table if not exists public.whatsapp_ai_suggestion_prefetch (
  stable_key text not null,
  anchor_message_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (stable_key, anchor_message_id)
);

alter table public.whatsapp_ai_suggestion_prefetch enable row level security;

revoke all privileges on table public.whatsapp_ai_suggestion_prefetch
from public, anon, authenticated;

grant select, insert, update, delete
on table public.whatsapp_ai_suggestion_prefetch
to service_role;
