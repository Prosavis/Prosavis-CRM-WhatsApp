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

-- Contraste del inbox contra lo que entra. Lo refresca el barrido, una vez por minuto.
create table if not exists public.sofia_pass_snapshot (
  id int primary key default 1 check (id = 1),
  no_leidos int not null default 0,
  entran int not null default 0,
  ventana_cerrada int not null default 0,
  ultimo_nuestro int not null default 0,
  silencio_corto int not null default 0,
  pausados int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.sofia_pass_snapshot enable row level security;
revoke all on table public.sofia_pass_snapshot from public, anon, authenticated;
grant select, insert, update, delete on table public.sofia_pass_snapshot to service_role;

insert into public.sofia_pass_snapshot (id) values (1) on conflict (id) do nothing;

create or replace function app_private.sofia_refresh_pass_snapshot()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_no_leidos int;
  v_entran int;
  v_ventana int;
  v_nuestro int;
  v_silencio int;
  v_pausados int;
begin
  with unread as (
    select c.stable_key,
           c.automated_inbound_disabled,
           c.sofia_muted_until
    from public.whatsapp_conversations c
    where c.phone_number_id = '1035566289641219'
      and c.unread_count > 0
  ),
  latest as (
    select distinct on (log.conversation_stable_key)
      log.conversation_stable_key as stable_key,
      log.direction,
      log.created_at
    from public.whatsapp_message_log log
    where log.phone_number_id = '1035566289641219'
      and log.created_at >= now() - interval '24 hours'
      and log.conversation_stable_key in (select stable_key from unread)
    order by log.conversation_stable_key, log.created_at desc
  )
  select
    (select count(*) from unread),
    count(*) filter (
      where l.direction = 'inbound'
        and l.created_at <= now() - interval '60 seconds'
        and u.automated_inbound_disabled = false
        and (u.sofia_muted_until is null or u.sofia_muted_until < now())
    ),
    count(*) filter (where l.stable_key is null),
    count(*) filter (where l.direction is not null and l.direction <> 'inbound'),
    count(*) filter (
      where l.direction = 'inbound'
        and l.created_at > now() - interval '60 seconds'
    ),
    count(*) filter (
      where u.automated_inbound_disabled
        or (u.sofia_muted_until is not null and u.sofia_muted_until >= now())
    )
  into v_no_leidos, v_entran, v_ventana, v_nuestro, v_silencio, v_pausados
  from unread u
  left join latest l on l.stable_key = u.stable_key;

  insert into public.sofia_pass_snapshot (
    id, no_leidos, entran, ventana_cerrada, ultimo_nuestro, silencio_corto, pausados, updated_at
  ) values (
    1,
    coalesce(v_no_leidos, 0),
    coalesce(v_entran, 0),
    coalesce(v_ventana, 0),
    coalesce(v_nuestro, 0),
    coalesce(v_silencio, 0),
    coalesce(v_pausados, 0),
    now()
  )
  on conflict (id) do update set
    no_leidos = excluded.no_leidos,
    entran = excluded.entran,
    ventana_cerrada = excluded.ventana_cerrada,
    ultimo_nuestro = excluded.ultimo_nuestro,
    silencio_corto = excluded.silencio_corto,
    pausados = excluded.pausados,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function app_private.sofia_refresh_pass_snapshot() from public, anon, authenticated;
grant execute on function app_private.sofia_refresh_pass_snapshot() to service_role;

create or replace function public.sofia_refresh_pass_snapshot()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.sofia_refresh_pass_snapshot();
end;
$$;

revoke all on function public.sofia_refresh_pass_snapshot() from public, anon, authenticated;
grant execute on function public.sofia_refresh_pass_snapshot() to service_role;

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
    'no_leidos', coalesce((select no_leidos from public.sofia_pass_snapshot where id = 1), 0),
    'en_pasada', coalesce((select entran from public.sofia_pass_snapshot where id = 1), 0),
    'ventana_cerrada', coalesce((select ventana_cerrada from public.sofia_pass_snapshot where id = 1), 0),
    'ultimo_nuestro', coalesce((select ultimo_nuestro from public.sofia_pass_snapshot where id = 1), 0),
    'silencio_corto', coalesce((select silencio_corto from public.sofia_pass_snapshot where id = 1), 0),
    'pausados', coalesce((select pausados from public.sofia_pass_snapshot where id = 1), 0),
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

select public.sofia_refresh_pass_snapshot();
