-- Modo automática (valor sola). No lo enciende: el modo sigue como esté.
-- El barrido de no leídos del 312 solo corre cuando alguien pasa a sola.

create table if not exists public.sofia_auto_log (
  anchor_message_id text primary key,
  stable_key text not null,
  action text not null check (action in ('enviado', 'agendado', 'elevado')),
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.sofia_auto_log enable row level security;
revoke all on table public.sofia_auto_log from public, anon, authenticated;
grant select, insert, update, delete on table public.sofia_auto_log to service_role;

create or replace function public.set_sofia_mode(next_mode text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_email text;
  previous text;
begin
  if next_mode not in ('apagada', 'supervisada', 'sola') then
    raise exception 'modo no permitido en esta fase' using errcode = '22023';
  end if;

  select email into caller_email
  from public.admin_profiles
  where id = auth.uid() and is_active = true;

  if caller_email is null or caller_email not in (
    'admin@prosavis.com',
    'support@prosavis.com',
    'francyoliverab@gmail.com'
  ) then
    raise exception 'sin permiso para cambiar el modo' using errcode = '42501';
  end if;

  select mode into previous from public.sofia_settings where id = 1;
  if previous is not distinct from next_mode then
    return next_mode;
  end if;

  update public.sofia_settings
    set mode = next_mode, updated_at = now(), updated_by = auth.uid()
    where id = 1;
  if next_mode = 'apagada' then
    delete from public.sofia_pending_drafts where stable_key is not null;
  end if;
  insert into public.sofia_mode_events (mode, previous_mode, changed_by, actor_email)
    values (next_mode, previous, auth.uid(), caller_email);
  return next_mode;
end;
$$;

revoke all on function public.set_sofia_mode(text) from public, anon;
grant execute on function public.set_sofia_mode(text) to authenticated, service_role;

-- No leídos del 312 cuyo último mensaje es de la clienta, con silencio y ventana de 24 h.
-- Incluye el grupo de comparación. La 311 no entra.
create or replace function app_private.sofia_auto_candidates(silence_floor int, batch_size int)
returns table (
  stable_key text,
  anchor_message_id text,
  nombre text,
  inbound_text text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    latest.stable_key,
    latest.anchor_message_id,
    public.sofia_monitor_name(conversation.contact_name, conversation.whatsapp_profile_name),
    left(coalesce(latest.inbound_text, ''), 500)
  from (
    select distinct on (log.conversation_stable_key)
      log.conversation_stable_key as stable_key,
      log.id::text as anchor_message_id,
      log.direction,
      log.message_body as inbound_text,
      log.created_at
    from public.whatsapp_message_log as log
    where log.phone_number_id = '1035566289641219'
      and log.created_at >= now() - interval '24 hours'
    order by log.conversation_stable_key, log.created_at desc
  ) as latest
  join public.whatsapp_conversations as conversation
    on conversation.stable_key = latest.stable_key
  where latest.direction = 'inbound'
    and latest.created_at <= now() - make_interval(secs => greatest(silence_floor, 0))
    and latest.created_at >= now() - interval '24 hours'
    and conversation.unread_count > 0
    and conversation.phone_number_id = '1035566289641219'
    and conversation.automated_inbound_disabled = false
    and (conversation.sofia_muted_until is null or conversation.sofia_muted_until < now())
    and not exists (
      select 1
      from public.sofia_auto_log as handled
      where handled.anchor_message_id = latest.anchor_message_id
    )
  order by latest.created_at asc
  limit least(greatest(batch_size, 1), 500);
$$;

revoke all on function app_private.sofia_auto_candidates(int, int) from public, anon, authenticated;
grant execute on function app_private.sofia_auto_candidates(int, int) to service_role;

create or replace function public.sofia_auto_candidates(silence_floor int, batch_size int)
returns table (
  stable_key text,
  anchor_message_id text,
  nombre text,
  inbound_text text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from app_private.sofia_auto_candidates(silence_floor, batch_size);
$$;

revoke all on function public.sofia_auto_candidates(int, int) from public, anon, authenticated;
grant execute on function public.sofia_auto_candidates(int, int) to service_role;

create or replace function public.sofia_monitor()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
  current_mode text;
begin
  select app_private.is_crm_admin() into allowed;
  if allowed is not true then
    raise exception 'sin permiso para ver a Sofía' using errcode = '42501';
  end if;

  select mode into current_mode from public.sofia_settings where id = 1;

  return jsonb_build_object(
    'modo', current_mode,
    'en_pasada', case
      when current_mode = 'sola'
        then (select count(*) from app_private.sofia_auto_candidates(60, 500))
      else 0
    end,
    'cola', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', public.sofia_monitor_name(conversation.contact_name, conversation.whatsapp_profile_name),
        'hace_minutos', floor(extract(epoch from (now() - draft.created_at)) / 60)::int,
        'linea', left(regexp_replace(draft.suggestion, '\d{8,}', '[numero]', 'g'), 140),
        'veredicto', review.verdict,
        'chat', draft.stable_key
      ) order by draft.created_at desc)
      from public.sofia_pending_drafts as draft
      left join public.whatsapp_conversations as conversation
        on conversation.stable_key = draft.stable_key
      left join lateral (
        select item.verdict
        from public.sofia_draft_reviews as item
        where item.stable_key = draft.stable_key
          and item.created_at >= draft.created_at - interval '1 second'
        order by item.created_at desc
        limit 1
      ) as review on true
    ), '[]'::jsonb),
    'puentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', public.sofia_monitor_name(conversation.contact_name, conversation.whatsapp_profile_name),
        'enviado', bridge.sent_at,
        'chat', bridge.stable_key
      ) order by bridge.sent_at desc)
      from public.sofia_bridge_log as bridge
      left join public.whatsapp_conversations as conversation
        on conversation.stable_key = bridge.stable_key
      where bridge.window_date = (timezone('America/Bogota', now()))::date
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.sofia_monitor() from public, anon;
grant execute on function public.sofia_monitor() to authenticated, service_role;
