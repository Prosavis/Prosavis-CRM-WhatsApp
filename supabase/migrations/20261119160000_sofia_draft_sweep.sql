-- Barrido de borradores de Sofía y el panel que los aprueba.
-- Aditivo. Nada de esto envía mensajes por sí solo.

alter table public.whatsapp_conversations
  add column if not exists sofia_muted_until timestamptz,
  add column if not exists sofia_cohort text;

alter table public.whatsapp_ai_suggestion_log
  add column if not exists agent_version text,
  add column if not exists discard_reason text,
  add column if not exists approved_by uuid,
  add column if not exists approve_ms integer;

-- Borrador pendiente por conversación. El panel lo lee; el barrido lo escribe.
create table if not exists public.sofia_pending_drafts (
  stable_key text primary key,
  anchor_message_id text not null,
  suggestion text not null,
  suggestion_log_id text,
  agent_version text not null default 'v1',
  created_at timestamptz not null default now()
);

alter table public.sofia_pending_drafts enable row level security;
revoke all on table public.sofia_pending_drafts from public, anon;
grant select on table public.sofia_pending_drafts to authenticated, service_role;
grant insert, update, delete on table public.sofia_pending_drafts to service_role;

drop policy if exists sofia_pending_drafts_read on public.sofia_pending_drafts;
create policy sofia_pending_drafts_read
  on public.sofia_pending_drafts
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

-- Chats del 312 con un entrante en silencio de entre 60 y 90 segundos,
-- sin pausa, sin persona hoy y fuera del grupo de comparación.
create or replace function app_private.sofia_draft_candidates(silence_floor int, silence_ceiling int)
returns table (stable_key text, anchor_message_id text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select c.stable_key, c.anchor_message_id
  from (
    select distinct on (conversation_stable_key)
      conversation_stable_key as stable_key,
      id::text as anchor_message_id,
      direction,
      author_kind,
      created_at
    from public.whatsapp_message_log
    where phone_number_id = '1035566289641219'
    order by conversation_stable_key, created_at desc
  ) c
  join public.whatsapp_conversations conv on conv.stable_key = c.stable_key
  where c.direction = 'inbound'
    and c.created_at between now() - make_interval(secs => silence_ceiling)
                         and now() - make_interval(secs => silence_floor)
    and conv.automated_inbound_disabled = false
    and (conv.sofia_muted_until is null or conv.sofia_muted_until < now())
    and conv.sofia_cohort is distinct from 'control'
    and not exists (
      select 1 from public.sofia_pending_drafts d where d.stable_key = c.stable_key
    );
$$;

revoke all on function app_private.sofia_draft_candidates(int, int) from public, anon, authenticated;
grant execute on function app_private.sofia_draft_candidates(int, int) to service_role;
