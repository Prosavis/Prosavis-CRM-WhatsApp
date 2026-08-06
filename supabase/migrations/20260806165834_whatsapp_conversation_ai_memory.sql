create table if not exists public.whatsapp_conversation_ai_memory (
  stable_key text primary key,
  summary text not null default '',
  preferences jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  agreements jsonb not null default '[]'::jsonb,
  last_summarized_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  model text,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_conversation_ai_memory enable row level security;

revoke all privileges on table public.whatsapp_conversation_ai_memory
from public, anon, authenticated;

grant select, insert, update, delete
on table public.whatsapp_conversation_ai_memory
to service_role;
