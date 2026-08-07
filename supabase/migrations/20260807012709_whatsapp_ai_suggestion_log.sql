-- Telemetría de sugerencias Inbox AI (Fase 5C).
-- Solo service_role (mismo patrón que whatsapp_conversation_ai_memory).

create table if not exists public.whatsapp_ai_suggestion_log (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  suggestion text not null,
  sent_text text null,
  action_taken text null,
  edit_ratio numeric null,
  model text null,
  context_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  closed_at timestamptz null,
  created_by text null
);

create index if not exists idx_whatsapp_ai_suggestion_log_stable_key_created
  on public.whatsapp_ai_suggestion_log (stable_key, created_at desc);

alter table public.whatsapp_ai_suggestion_log enable row level security;

revoke all privileges on table public.whatsapp_ai_suggestion_log
from public, anon, authenticated;

grant select, insert, update, delete
on table public.whatsapp_ai_suggestion_log
to service_role;
