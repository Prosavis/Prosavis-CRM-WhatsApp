-- Revisión del borrador y el cierre desde el panel.
-- El envío no se bloquea. El panel no puede escribir el log directo: lo hace esta función.

create table if not exists public.sofia_draft_reviews (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  suggestion_log_id text,
  attempt integer not null,
  verdict text not null,
  feedback text,
  missing_context text,
  created_at timestamptz not null default now(),
  constraint sofia_draft_reviews_verdict_check
    check (verdict in ('aprobar', 'devolver', 'riesgo'))
);

create index if not exists sofia_draft_reviews_chat_idx
  on public.sofia_draft_reviews (stable_key, created_at desc);

alter table public.sofia_draft_reviews enable row level security;
revoke all on table public.sofia_draft_reviews from public, anon;
grant select on table public.sofia_draft_reviews to authenticated, service_role;
grant insert, update, delete on table public.sofia_draft_reviews to service_role;

drop policy if exists sofia_draft_reviews_read on public.sofia_draft_reviews;
create policy sofia_draft_reviews_read
  on public.sofia_draft_reviews
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

create or replace function app_private.sofia_edit_ratio(a text, b text)
returns numeric
language plpgsql
immutable
as $fn$
declare
  source text := coalesce(a, '');
  target text := coalesce(b, '');
  source_len integer := char_length(source);
  target_len integer := char_length(target);
  previous integer[];
  current integer[];
  row_index integer;
  column_index integer;
  cost integer;
begin
  if source = target then return 0; end if;
  if source_len = 0 or target_len = 0 then return 1; end if;
  if source_len > 400 or target_len > 400 then return 1; end if;
  previous := array(select item from generate_series(0, target_len) as item);
  for row_index in 1..source_len loop
    current := array[row_index];
    for column_index in 1..target_len loop
      cost := case when substr(source, row_index, 1) = substr(target, column_index, 1) then 0 else 1 end;
      current := current || least(
        current[column_index] + 1,
        previous[column_index + 1] + 1,
        previous[column_index] + cost
      );
    end loop;
    previous := current;
  end loop;
  return round(previous[target_len + 1]::numeric / greatest(source_len, target_len), 4);
end;
$fn$;

create or replace function public.sofia_resolve_draft(
  p_stable_key text,
  p_sent boolean,
  p_text text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $fn$
declare
  pending public.sofia_pending_drafts%rowtype;
begin
  if not app_private.is_crm_admin() then
    raise exception 'no autorizado';
  end if;
  select * into pending from public.sofia_pending_drafts where stable_key = p_stable_key;
  if not found then
    raise exception 'no hay borrador';
  end if;
  if pending.suggestion_log_id is not null then
    update public.whatsapp_ai_suggestion_log
    set discard_reason = case when p_sent then null else left(coalesce(p_reason, ''), 80) end,
        approve_ms = greatest(0, (extract(epoch from (now() - pending.created_at)) * 1000)::integer),
        action_taken = case when p_sent then 'send_text' else 'discard' end,
        approved_by = case when p_sent then auth.uid() else null end,
        sent_text = case when p_sent then left(coalesce(p_text, ''), 2000) else null end,
        edit_ratio = case
          when p_sent then app_private.sofia_edit_ratio(pending.suggestion, coalesce(p_text, ''))
          else null
        end,
        closed_at = now()
    where id = pending.suggestion_log_id::uuid;
  end if;
  delete from public.sofia_pending_drafts where stable_key = p_stable_key;
end;
$fn$;

revoke all on function app_private.sofia_edit_ratio(text, text) from public, anon, authenticated;
revoke all on function public.sofia_resolve_draft(text, boolean, text, text) from public, anon;
grant execute on function app_private.sofia_edit_ratio(text, text) to service_role;
grant execute on function public.sofia_resolve_draft(text, boolean, text, text) to authenticated, service_role;

-- PostgREST solo expone public. Estas funciones envuelven las de app_private
-- para que el barrido, el examen y el Hub las puedan llamar con la llave de servicio.
create or replace function public.sofia_exam_seed(p_version integer)
returns jsonb
language sql
security definer
set search_path = public, app_private, pg_temp
as $$ select app_private.sofia_exam_seed(p_version); $$;

create or replace function public.sofia_draft_candidates(silence_floor integer, silence_ceiling integer)
returns table (stable_key text, anchor_message_id text)
language sql
security definer
set search_path = public, app_private, pg_temp
as $$
  select * from app_private.sofia_draft_candidates(silence_floor, silence_ceiling);
$$;

create or replace function public.sofia_version_activar(p_version integer, p_por text)
returns void
language sql
security definer
set search_path = public, app_private, pg_temp
as $$ select app_private.sofia_version_activar(p_version, p_por); $$;

revoke all on function public.sofia_exam_seed(integer) from public, anon, authenticated;
revoke all on function public.sofia_draft_candidates(integer, integer) from public, anon, authenticated;
revoke all on function public.sofia_version_activar(integer, text) from public, anon, authenticated;
grant execute on function public.sofia_exam_seed(integer) to service_role;
grant execute on function public.sofia_draft_candidates(integer, integer) to service_role;
grant execute on function public.sofia_version_activar(integer, text) to service_role;
