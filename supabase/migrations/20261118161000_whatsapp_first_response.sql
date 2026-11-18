-- T1. Origen de cada mensaje saliente y tiempo de primera respuesta.
-- Mide. No envía. La línea 311 solo se lee.

alter table public.whatsapp_message_log
  add column if not exists author_kind text;

alter table public.whatsapp_message_log
  drop constraint if exists whatsapp_message_log_author_kind_check;

alter table public.whatsapp_message_log
  add constraint whatsapp_message_log_author_kind_check
  check (
    author_kind is null
    or author_kind in (
      'persona',
      'sugerencia_ia',
      'automatica',
      'hub',
      'sofia',
      'bot_anterior'
    )
  );

comment on column public.whatsapp_message_log.author_kind is
  'Quien escribió el saliente: persona, sugerencia_ia, automatica, hub, sofia o bot_anterior.';

create or replace function app_private.derive_author_kind(
  p_sent_via text,
  p_sender_type text,
  p_agent_uid uuid
)
returns text
language sql
immutable
as $$
  select case
    when p_sent_via = 'system' or p_sender_type = 'system' then 'automatica'
    when p_sent_via = 'grok' then 'hub'
    when p_sent_via = 'app' or p_sender_type = 'app' then 'persona'
    when p_sent_via = 'crm' then 'persona'
    when p_sender_type = 'agent' and p_agent_uid is not null then 'persona'
    when p_sender_type = 'agent' and p_agent_uid is null then 'hub'
    else null
  end
$$;

create or replace function app_private.set_message_author_kind()
returns trigger
language plpgsql
as $$
begin
  if new.direction is distinct from 'outbound' then
    new.author_kind := null;
    return new;
  end if;
  if new.author_kind is null then
    new.author_kind := app_private.derive_author_kind(
      new.sent_via,
      new.sender_type,
      new.agent_uid
    );
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_message_log_author_kind on public.whatsapp_message_log;
create trigger whatsapp_message_log_author_kind
  before insert on public.whatsapp_message_log
  for each row
  execute function app_private.set_message_author_kind();

create table if not exists public.whatsapp_response_episodes (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null,
  phone_number_id text,
  line text not null,
  started_at timestamptz not null,
  started_dow smallint generated always as (
    extract(dow from (started_at at time zone 'America/Bogota'))::smallint
  ) stored,
  started_hour smallint generated always as (
    extract(hour from (started_at at time zone 'America/Bogota'))::smallint
  ) stored,
  from_ad boolean not null default false,
  ctwa_source_id text,
  first_auto_at timestamptz,
  first_auto_kind text,
  first_auto_message_id uuid,
  first_real_at timestamptz,
  first_real_by text,
  first_real_message_id uuid,
  constraint whatsapp_response_episodes_line_check
    check (line in ('312', '311', 'otra')),
  constraint whatsapp_response_episodes_real_by_check
    check (
      first_real_by is null
      or first_real_by in ('persona', 'sugerencia_ia', 'sofia', 'hub')
    )
);

create index if not exists whatsapp_response_episodes_key_started_idx
  on public.whatsapp_response_episodes (stable_key, started_at desc);

create index if not exists whatsapp_response_episodes_started_idx
  on public.whatsapp_response_episodes (started_at);

alter table public.whatsapp_response_episodes enable row level security;

revoke all on table public.whatsapp_response_episodes from public, anon, authenticated;
grant select on table public.whatsapp_response_episodes to service_role;

drop policy if exists whatsapp_response_episodes_no_client
  on public.whatsapp_response_episodes;
create policy whatsapp_response_episodes_no_client
  on public.whatsapp_response_episodes
  for all
  to anon, authenticated
  using (false)
  with check (false);

create table if not exists app_private.whatsapp_episode_backfill (
  stable_key text primary key,
  done_at timestamptz not null default now()
);

create or replace function app_private.apply_response_episode(
  p_id uuid,
  p_stable_key text,
  p_direction text,
  p_sender_type text,
  p_author_kind text,
  p_created_at timestamptz,
  p_phone_number_id text,
  p_status text,
  p_campaign_type text,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  latest public.whatsapp_response_episodes%rowtype;
  prev_inbound timestamptz;
  conv_phone text;
  conv_source text;
  conv_captured timestamptz;
  conv_clid text;
  is_customer boolean;
  is_auto boolean;
  is_real boolean;
begin
  if p_hidden then
    return;
  end if;
  if p_stable_key is null or p_created_at is null then
    return;
  end if;

  is_customer := p_direction = 'inbound'
    and coalesce(p_sender_type, 'user') in ('user', 'bot');
  is_auto := p_direction = 'outbound'
    and p_author_kind = 'automatica'
    and coalesce(p_status, 'sent') <> 'failed';
  is_real := p_direction = 'outbound'
    and p_author_kind in ('persona', 'sugerencia_ia', 'sofia', 'hub')
    and coalesce(p_status, 'sent') <> 'failed';
  if not is_customer and not is_auto and not is_real then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stable_key, 0));

  if is_customer then
    select * into latest
    from public.whatsapp_response_episodes
    where stable_key = p_stable_key
    order by started_at desc
    limit 1;

    if latest.id is not null and latest.first_real_at is null then
      return;
    end if;

    select max(created_at) into prev_inbound
    from (
      select created_at
      from public.whatsapp_message_log
      where conversation_stable_key = p_stable_key
        and direction = 'inbound'
        and coalesce(sender_type, 'user') in ('user', 'bot')
        and coalesce(hidden_from_panel, false) = false
        and id <> p_id
        and created_at < p_created_at
      union all
      select created_at
      from public.whatsapp_message_log_archive
      where conversation_stable_key = p_stable_key
        and direction = 'inbound'
        and coalesce(sender_type, 'user') in ('user', 'bot')
        and coalesce(hidden_from_panel, false) = false
        and id <> p_id
        and created_at < p_created_at
    ) earlier;

    if latest.id is not null
      and prev_inbound is not null
      and p_created_at - prev_inbound < interval '24 hours' then
      return;
    end if;

    select c.phone_number_id, c.ctwa_source_id, c.ctwa_captured_at, c.ctwa_clid
      into conv_phone, conv_source, conv_captured, conv_clid
    from public.whatsapp_conversations c
    where c.stable_key = p_stable_key;

    insert into public.whatsapp_response_episodes (
      stable_key,
      phone_number_id,
      line,
      started_at,
      from_ad,
      ctwa_source_id
    ) values (
      p_stable_key,
      coalesce(p_phone_number_id, conv_phone),
      case coalesce(p_phone_number_id, conv_phone)
        when '1035566289641219' then '312'
        when '1043086062223440' then '311'
        else 'otra'
      end,
      p_created_at,
      conv_clid is not null
        and conv_captured is not null
        and p_created_at >= conv_captured
        and p_created_at < conv_captured + interval '7 days',
      case
        when conv_clid is not null
          and conv_captured is not null
          and p_created_at >= conv_captured
          and p_created_at < conv_captured + interval '7 days'
        then conv_source
        else null
      end
    );
    return;
  end if;

  select * into latest
  from public.whatsapp_response_episodes
  where stable_key = p_stable_key
    and started_at <= p_created_at
  order by started_at desc
  limit 1;
  if latest.id is null then
    return;
  end if;

  if is_auto and latest.first_auto_at is null then
    update public.whatsapp_response_episodes
    set first_auto_at = p_created_at,
        first_auto_kind = coalesce(p_campaign_type, 'automatica'),
        first_auto_message_id = p_id
    where id = latest.id;
  end if;

  if is_real and latest.first_real_at is null then
    update public.whatsapp_response_episodes
    set first_real_at = p_created_at,
        first_real_by = p_author_kind,
        first_real_message_id = p_id
    where id = latest.id;
  end if;
end;
$$;

create or replace function app_private.on_message_response_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.apply_response_episode(
    new.id,
    new.conversation_stable_key,
    new.direction,
    new.sender_type,
    new.author_kind,
    new.created_at,
    new.phone_number_id,
    new.status,
    new.campaign_type,
    coalesce(new.hidden_from_panel, false)
  );
  return new;
end;
$$;

drop trigger if exists whatsapp_message_log_response_episode on public.whatsapp_message_log;
create trigger whatsapp_message_log_response_episode
  after insert on public.whatsapp_message_log
  for each row
  execute function app_private.on_message_response_episode();

create or replace function app_private.mark_suggestion_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message_id uuid;
begin
  if new.sent_text is null or btrim(new.sent_text) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.sent_text is not distinct from new.sent_text then
    return new;
  end if;

  update public.whatsapp_message_log as log
  set author_kind = 'sugerencia_ia'
  where log.id = (
    select candidate.id
    from public.whatsapp_message_log as candidate
    where candidate.conversation_stable_key = new.stable_key
      and candidate.direction = 'outbound'
      and candidate.sent_via = 'crm'
      and candidate.message_body = new.sent_text
      and candidate.created_at >= coalesce(new.closed_at, now()) - interval '15 minutes'
      and candidate.created_at <= coalesce(new.closed_at, now()) + interval '2 minutes'
    order by candidate.created_at desc
    limit 1
  )
  returning log.id into message_id;

  if message_id is not null then
    update public.whatsapp_response_episodes
    set first_real_by = 'sugerencia_ia'
    where first_real_message_id = message_id
      and first_real_by = 'persona';
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_ai_suggestion_author_kind on public.whatsapp_ai_suggestion_log;
create trigger whatsapp_ai_suggestion_author_kind
  after insert or update of sent_text on public.whatsapp_ai_suggestion_log
  for each row
  execute function app_private.mark_suggestion_author();

create or replace function app_private.replay_response_episodes_for_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_message record;
  kind text;
begin
  if p_key is null or p_key = '' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  delete from public.whatsapp_response_episodes where stable_key = p_key;

  for row_message in
    select
      id,
      direction,
      sender_type,
      created_at,
      phone_number_id,
      status,
      campaign_type,
      message_body,
      hidden_from_panel,
      author_kind,
      sent_via,
      agent_uid,
      live
    from (
      select
        id,
        direction,
        sender_type,
        created_at,
        phone_number_id,
        status,
        campaign_type,
        message_body,
        coalesce(hidden_from_panel, false) as hidden_from_panel,
        author_kind,
        sent_via,
        agent_uid,
        true as live
      from public.whatsapp_message_log
      where conversation_stable_key = p_key
      union all
      select
        id,
        direction,
        sender_type,
        created_at,
        phone_number_id,
        status,
        campaign_type,
        message_body,
        coalesce(hidden_from_panel, false),
        null::text,
        null::text,
        agent_uid,
        false
      from public.whatsapp_message_log_archive
      where conversation_stable_key = p_key
    ) messages
    order by created_at, id
  loop
    kind := coalesce(
      row_message.author_kind,
      app_private.derive_author_kind(
        row_message.sent_via,
        row_message.sender_type,
        row_message.agent_uid
      )
    );
    if row_message.direction = 'outbound'
      and kind = 'persona'
      and row_message.message_body is not null
      and exists (
        select 1
        from public.whatsapp_ai_suggestion_log as suggestion
        where suggestion.stable_key = p_key
          and suggestion.sent_text = row_message.message_body
          and suggestion.closed_at is not null
          and suggestion.closed_at between row_message.created_at - interval '15 minutes'
            and row_message.created_at + interval '15 minutes'
      ) then
      kind := 'sugerencia_ia';
    end if;
    if row_message.live and kind is not null and row_message.author_kind is distinct from kind then
      update public.whatsapp_message_log
      set author_kind = kind
      where id = row_message.id
        and author_kind is distinct from kind;
    end if;
    perform app_private.apply_response_episode(
      row_message.id,
      p_key,
      row_message.direction,
      row_message.sender_type,
      kind,
      row_message.created_at,
      row_message.phone_number_id,
      row_message.status,
      row_message.campaign_type,
      row_message.hidden_from_panel
    );
  end loop;
end;
$$;

create or replace function public.backfill_whatsapp_response_episodes(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  key text;
  processed integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'limit 1..500';
  end if;

  for key in
    select keys.conversation_stable_key
    from (
      select conversation_stable_key from public.whatsapp_message_log
      union
      select conversation_stable_key from public.whatsapp_message_log_archive
    ) as keys
    where not exists (
      select 1
      from app_private.whatsapp_episode_backfill as done
      where done.stable_key = keys.conversation_stable_key
    )
    order by keys.conversation_stable_key
    limit p_limit
  loop
    perform app_private.replay_response_episodes_for_key(key);
    insert into app_private.whatsapp_episode_backfill (stable_key) values (key);
    processed := processed + 1;
  end loop;

  return jsonb_build_object(
    'procesadas', processed,
    'quedan', processed = p_limit
  );
end;
$$;

revoke all on function public.backfill_whatsapp_response_episodes(integer) from public, anon, authenticated;
grant execute on function public.backfill_whatsapp_response_episodes(integer) to service_role;

create or replace function public.metrics_first_response(
  p_from date,
  p_to date,
  p_group text default 'dow',
  p_phone_number_id text default '1035566289641219',
  p_ads_only boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_group not in ('dow', 'hour', 'day', 'line', 'ad') then
    raise exception 'grupo invalido';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 400 then
    raise exception 'rango invalido';
  end if;

  with base as (
    select *
    from public.whatsapp_response_episodes
    where (started_at at time zone 'America/Bogota')::date between p_from and p_to
      and (p_phone_number_id is null or phone_number_id = p_phone_number_id)
      and (not p_ads_only or from_ad)
  ),
  grouped as (
    select
      case p_group
        when 'dow' then (array[
          'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'
        ])[started_dow + 1]
        when 'hour' then lpad(started_hour::text, 2, '0')
        when 'day' then to_char(started_at at time zone 'America/Bogota', 'YYYY-MM-DD')
        when 'line' then line
        when 'ad' then coalesce(ctwa_source_id, 'sin_anuncio')
      end as bucket,
      count(*)::integer as episodios,
      count(*) filter (where first_real_at is null)::integer as sin_respuesta_real,
      count(*) filter (where first_auto_at is null)::integer as sin_respuesta_automatica,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_real_at - started_at))
      ) filter (where first_real_at is not null) as mediana_real_seg,
      percentile_cont(0.9) within group (
        order by extract(epoch from (first_real_at - started_at))
      ) filter (where first_real_at is not null) as p90_real_seg,
      percentile_cont(0.5) within group (
        order by extract(epoch from (first_auto_at - started_at))
      ) filter (where first_auto_at is not null) as mediana_auto_seg,
      percentile_cont(0.9) within group (
        order by extract(epoch from (first_auto_at - started_at))
      ) filter (where first_auto_at is not null) as p90_auto_seg
    from base
    group by 1
  )
  select jsonb_build_object(
    'desde', p_from,
    'hasta', p_to,
    'grupo', p_group,
    'linea', p_phone_number_id,
    'solo_anuncio', p_ads_only,
    'filas', coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket,
      'episodios', episodios,
      'sin_respuesta_real', sin_respuesta_real,
      'sin_respuesta_automatica', sin_respuesta_automatica,
      'mediana_real_seg', round(mediana_real_seg)::bigint,
      'p90_real_seg', round(p90_real_seg)::bigint,
      'mediana_auto_seg', round(mediana_auto_seg)::bigint,
      'p90_auto_seg', round(p90_auto_seg)::bigint
    ) order by bucket), '[]'::jsonb)
  )
  into result
  from grouped;

  return coalesce(result, jsonb_build_object(
    'desde', p_from,
    'hasta', p_to,
    'grupo', p_group,
    'filas', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.metrics_first_response(date, date, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.metrics_first_response(date, date, text, text, boolean)
  to service_role;

create index if not exists whatsapp_message_log_archive_key_created_idx
  on public.whatsapp_message_log_archive (conversation_stable_key, created_at);
