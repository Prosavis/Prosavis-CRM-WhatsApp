-- Agregados históricos de métricas: RPCs compactas, solo service_role.
-- Bogotá (UTC-5 todo el año) para buckets diarios.

create or replace function app_private.metrics_phone_digits(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null or length(regexp_replace(p_value, '\D', '', 'g')) < 7 then null
    else right(regexp_replace(p_value, '\D', '', 'g'), 10)
  end;
$$;

create or replace function app_private.metrics_is_test_contact(
  p_classification text,
  p_tags text[]
)
returns boolean
language sql
immutable
as $$
  select
    exists (
      select 1
      from unnest(coalesce(p_tags, array[]::text[])) as t
      where lower(trim(t)) = 'test'
    )
    or exists (
      select 1
      from unnest(string_to_array(coalesce(p_classification, ''), ',')) as t
      where lower(trim(t)) = 'test'
    );
$$;

create or replace function app_private.metrics_has_any_token(
  p_classification text,
  p_tags text[],
  p_needles text[]
)
returns boolean
language sql
immutable
as $$
  select
    exists (
      select 1
      from unnest(coalesce(p_tags, array[]::text[])) as t
      where lower(trim(t)) = any (p_needles)
    )
    or exists (
      select 1
      from unnest(string_to_array(coalesce(p_classification, ''), ',')) as t
      where lower(trim(t)) = any (p_needles)
    );
$$;

create or replace function public.metrics_inbound_contact_days(
  p_phone_number_id text default null
)
returns table (
  bucket_day date,
  stable_key text,
  first_contact_day date,
  messages bigint
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  select
    (l.created_at at time zone 'America/Bogota')::date as bucket_day,
    l.conversation_stable_key as stable_key,
    (
      coalesce(d.first_contact_at, d.created_at) at time zone 'America/Bogota'
    )::date as first_contact_day,
    count(*)::bigint as messages
  from public.whatsapp_message_log l
  left join public.crm_directory d
    on d.phone_key = l.conversation_stable_key
    or d.phone_key = app_private.metrics_phone_digits(l.conversation_stable_key)
  where l.hidden_from_panel = false
    and l.direction = 'inbound'
    and (p_phone_number_id is null or l.phone_number_id = p_phone_number_id)
    and not app_private.metrics_is_test_contact(d.classification, d.tags)
  group by 1, 2, 3
  order by 1;
$$;

create or replace function public.metrics_outbound_facts(
  p_phone_number_id text default null
)
returns table (
  bucket_day date,
  campaign_type text,
  template_name text,
  status text,
  message_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (created_at at time zone 'America/Bogota')::date as bucket_day,
    coalesce(nullif(campaign_type, ''), 'OTHER') as campaign_type,
    template_name,
    status,
    count(*)::bigint as message_count
  from public.whatsapp_message_log
  where hidden_from_panel = false
    and direction = 'outbound'
    and (p_phone_number_id is null or phone_number_id = p_phone_number_id)
  group by 1, 2, 3, 4
  order by 1;
$$;

create or replace function public.metrics_outbound_window_totals(
  p_phone_number_id text default null
)
returns table (
  span text,
  sent bigint,
  delivered bigint,
  read bigint,
  failed bigint,
  responses bigint,
  unique_messaged bigint,
  unique_responded bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select *
    from (
      values
        ('7'::text, (now() at time zone 'America/Bogota')::date - 6),
        ('14', (now() at time zone 'America/Bogota')::date - 13),
        ('30', (now() at time zone 'America/Bogota')::date - 29),
        ('60', (now() at time zone 'America/Bogota')::date - 59),
        ('90', (now() at time zone 'America/Bogota')::date - 89),
        ('all', date '2000-01-01')
    ) as t(span, start_day)
  ),
  log_rows as (
    select
      (created_at at time zone 'America/Bogota')::date as bucket_day,
      direction,
      status,
      conversation_stable_key
    from public.whatsapp_message_log
    where hidden_from_panel = false
      and (p_phone_number_id is null or phone_number_id = p_phone_number_id)
  )
  select
    b.span,
    count(*) filter (
      where l.direction = 'outbound' and l.status in ('sent', 'delivered', 'read')
    )::bigint as sent,
    count(*) filter (where l.direction = 'outbound' and l.status = 'delivered')::bigint as delivered,
    count(*) filter (where l.direction = 'outbound' and l.status = 'read')::bigint as read,
    count(*) filter (where l.direction = 'outbound' and l.status = 'failed')::bigint as failed,
    count(*) filter (where l.direction = 'inbound')::bigint as responses,
    count(distinct l.conversation_stable_key) filter (
      where l.direction = 'outbound'
        and l.status in ('sent', 'delivered', 'read')
        and l.conversation_stable_key is not null
    )::bigint as unique_messaged,
    count(distinct l.conversation_stable_key) filter (
      where l.direction = 'inbound'
        and l.conversation_stable_key is not null
        and l.conversation_stable_key in (
          select conversation_stable_key
          from log_rows o
          where o.direction = 'outbound'
            and o.status in ('sent', 'delivered', 'read')
            and o.conversation_stable_key is not null
            and o.bucket_day >= b.start_day
        )
    )::bigint as unique_responded
  from bounds b
  left join log_rows l on l.bucket_day >= b.start_day
  group by b.span, b.start_day
  order by b.span;
$$;

create or replace function public.metrics_bookings_daily(p_service_id text)
returns table (
  bucket_day date,
  completed bigint,
  canceled bigint,
  collected_cop bigint,
  paid_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (scheduled_start at time zone 'America/Bogota')::date as bucket_day,
    count(*) filter (where status = 'COMPLETED')::bigint as completed,
    count(*) filter (where status = 'CANCELED')::bigint as canceled,
    coalesce(sum(total_cop) filter (where payment_status = 'PAGO_ACEPTADO'), 0)::bigint as collected_cop,
    count(*) filter (where payment_status = 'PAGO_ACEPTADO')::bigint as paid_count
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
    and scheduled_start is not null
  group by 1
  order by 1;
$$;

create or replace function public.metrics_lifetime_collected(p_service_id text)
returns table (
  lifetime_collected_total bigint,
  lifetime_paid_appointment_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(total_cop), 0)::bigint as lifetime_collected_total,
    count(*)::bigint as lifetime_paid_appointment_count
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
    and payment_status = 'PAGO_ACEPTADO';
$$;

create or replace function public.metrics_directory_snapshot(p_service_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  with last_appt as (
    select
      coalesce(
        app_private.metrics_phone_digits(client_phone),
        client_id
      ) as match_key,
      max(scheduled_start) as last_at
    from public.bookings
    where service_id = p_service_id
      and source_deleted_at is null
    group by 1
  ),
  blocked as (
    select distinct
      coalesce(
        app_private.metrics_phone_digits(phone),
        stable_key,
        bsuid
      ) as match_key
    from public.whatsapp_blocklist
  ),
  scored as (
    select
      d.*,
      la.last_at,
      (
        app_private.metrics_has_any_token(
          d.classification,
          d.tags,
          array['decline', 'bloqueado', '🚫']
        )
        or exists (
          select 1
          from blocked b
          where b.match_key is not null
            and b.match_key in (
              d.phone_key,
              app_private.metrics_phone_digits(d.phone),
              d.phone
            )
        )
      ) as is_blacklisted,
      app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['empresas', 'empresa', 'company']
      ) as is_company,
      app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['cliente recurrente', 'recurrente']
      ) as is_recurring,
      app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['favoritos', 'favorito']
      ) as is_favorite
    from public.crm_directory d
    left join last_appt la
      on la.match_key is not null
      and la.match_key in (
        d.phone_key,
        app_private.metrics_phone_digits(d.phone),
        d.app_user_id,
        d.id::text
      )
  ),
  active_entries as (
    select *
    from scored
    where lower(coalesce(status, 'active')) = 'active'
      and coalesce(opt_out, false) = false
      and not app_private.metrics_is_test_contact(classification, tags)
  )
  select jsonb_build_object(
    'total', (select count(*) from active_entries),
    'clients', (select count(*) from active_entries where last_at is not null),
    'company', (select count(*) from active_entries where last_at is not null and is_company),
    'recurring', (select count(*) from active_entries where last_at is not null and is_recurring),
    'active', (
      select count(*)
      from active_entries
      where last_at is not null
        and not is_blacklisted
        and last_at >= (now() - interval '30 days')
    ),
    'inactive', (
      select count(*)
      from active_entries
      where last_at is not null
        and not is_blacklisted
        and last_at < (now() - interval '30 days')
    ),
    'favorites', (select count(*) from active_entries where is_favorite),
    'blacklist', (select count(*) from active_entries where is_blacklisted),
    'leads', jsonb_build_object(
      'total', (select count(*) from public.crm_directory),
      'enSeguimiento', (
        select count(*) from public.crm_directory where active_sequence = 'SEGUIMIENTO'
      ),
      'enRebooking', (
        select count(*) from public.crm_directory where active_sequence = 'REBOOKING'
      ),
      'optOut', (select count(*) from public.crm_directory where opt_out is true),
      'agendados', (
        select count(*) from public.crm_directory where coalesce(pending_appointments_count, 0) > 0
      )
    ),
    'optOutCount', (select count(*) from public.crm_directory where opt_out is true),
    'directoryRows', (select count(*) from public.crm_directory)
  );
$$;

create or replace function public.metrics_quality_nucleus(p_service_id text)
returns table (
  directory_id text,
  name text,
  phone text,
  classification text,
  tags text[],
  completed_count bigint,
  canceled_count bigint,
  pago_pendiente bigint,
  pago_aceptado bigint,
  pago_en_proceso bigint
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with booking_buckets as (
    select
      coalesce(
        app_private.metrics_phone_digits(client_phone),
        client_id
      ) as match_key,
      count(*) filter (where status = 'COMPLETED') as completed_count,
      count(*) filter (where status = 'CANCELED') as canceled_count,
      count(*) filter (
        where status = 'CANCELED' and payment_status = 'PAGO_PENDIENTE'
      ) as pago_pendiente,
      count(*) filter (
        where status = 'CANCELED' and payment_status = 'PAGO_ACEPTADO'
      ) as pago_aceptado,
      count(*) filter (
        where status = 'CANCELED' and payment_status = 'PAGO_EN_PROCESO'
      ) as pago_en_proceso
    from public.bookings
    where service_id = p_service_id
      and source_deleted_at is null
      and status in ('COMPLETED', 'CANCELED')
    group by 1
  )
  select
    d.id::text,
    coalesce(d.display_name, d.full_name),
    d.phone,
    d.classification,
    d.tags,
    coalesce(b.completed_count, 0),
    coalesce(b.canceled_count, 0),
    coalesce(b.pago_pendiente, 0),
    coalesce(b.pago_aceptado, 0),
    coalesce(b.pago_en_proceso, 0)
  from public.crm_directory d
  join booking_buckets b
    on b.match_key is not null
    and b.match_key in (
      d.phone_key,
      app_private.metrics_phone_digits(d.phone),
      d.app_user_id,
      d.id::text
    )
  where coalesce(b.completed_count, 0) >= 1
    and not app_private.metrics_is_test_contact(d.classification, d.tags);
$$;

create or replace function public.metrics_heatmap_summary(p_service_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      (scheduled_start at time zone 'America/Bogota')::date as bucket_day,
      start_latitude,
      start_longitude,
      latitude,
      longitude
    from public.bookings
    where service_id = p_service_id
      and source_deleted_at is null
  )
  select jsonb_build_object(
    'coverage', jsonb_build_object(
      'total', (select count(*) from rows),
      'withGps', (
        select count(*)
        from rows
        where start_latitude is not null and start_longitude is not null
      ),
      'withAddressOnly', (
        select count(*)
        from rows
        where (start_latitude is null or start_longitude is null)
          and latitude is not null
          and longitude is not null
      ),
      'withoutPoint', (
        select count(*)
        from rows
        where (start_latitude is null or start_longitude is null)
          and (latitude is null or longitude is null)
      )
    ),
    'daily', coalesce((
      select jsonb_agg(
        jsonb_build_object('bucket', bucket_day, 'count', cnt)
        order by bucket_day
      )
      from (
        select bucket_day, count(*)::int as cnt
        from rows
        where bucket_day is not null
        group by 1
      ) d
    ), '[]'::jsonb)
  );
$$;

create or replace function public.metrics_directory_page(
  p_service_id text,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  phone text,
  classification text,
  tags text[],
  is_company boolean,
  is_recurring boolean,
  is_agendado boolean,
  is_favorite boolean,
  is_client boolean,
  is_active boolean,
  is_blacklisted boolean,
  blacklist_reason text,
  last_appointment_date timestamptz
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with last_appt as (
    select
      coalesce(app_private.metrics_phone_digits(client_phone), client_id) as match_key,
      max(scheduled_start) as last_at
    from public.bookings
    where service_id = p_service_id
      and source_deleted_at is null
    group by 1
  ),
  blocked as (
    select
      coalesce(app_private.metrics_phone_digits(phone), stable_key, bsuid) as match_key,
      max(reason) as reason
    from public.whatsapp_blocklist
    group by 1
  )
  select
    d.id,
    coalesce(d.display_name, d.full_name),
    d.phone,
    d.classification,
    d.tags,
    app_private.metrics_has_any_token(d.classification, d.tags, array['empresas', 'empresa', 'company']),
    app_private.metrics_has_any_token(d.classification, d.tags, array['cliente recurrente', 'recurrente']),
    app_private.metrics_has_any_token(d.classification, d.tags, array['agendado', 'agendada']),
    app_private.metrics_has_any_token(d.classification, d.tags, array['favoritos', 'favorito']),
    la.last_at is not null,
    la.last_at is not null
      and not (
        app_private.metrics_has_any_token(d.classification, d.tags, array['decline', 'bloqueado', '🚫'])
        or exists (
          select 1 from blocked b
          where b.match_key in (d.phone_key, app_private.metrics_phone_digits(d.phone), d.phone)
        )
      )
      and la.last_at >= (now() - interval '30 days'),
    app_private.metrics_has_any_token(d.classification, d.tags, array['decline', 'bloqueado', '🚫'])
      or exists (
        select 1 from blocked b
        where b.match_key in (d.phone_key, app_private.metrics_phone_digits(d.phone), d.phone)
      ),
    nullif(trim(coalesce(d.internal_notes, '')), ''),
    la.last_at
  from public.crm_directory d
  left join last_appt la
    on la.match_key is not null
    and la.match_key in (
      d.phone_key,
      app_private.metrics_phone_digits(d.phone),
      d.app_user_id,
      d.id::text
    )
  where lower(coalesce(d.status, 'active')) = 'active'
    and coalesce(d.opt_out, false) = false
    and not app_private.metrics_is_test_contact(d.classification, d.tags)
  order by coalesce(d.display_name, d.full_name, d.phone)
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.metrics_completed_appointments_page(
  p_service_id text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_from date default null,
  p_to date default null
)
returns table (
  appointment_id text,
  scheduled_date timestamptz,
  client_name text,
  client_phone text,
  location_address text,
  duration integer,
  total_amount bigint,
  paid_amount bigint,
  pending_amount bigint,
  payment_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    appointment_id,
    scheduled_start,
    client_name,
    client_phone,
    location_address,
    required_cleaner_minutes,
    total_cop,
    paid_cop,
    pending_cop,
    payment_status
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
    and status = 'COMPLETED'
    and scheduled_start is not null
    and (p_from is null or (scheduled_start at time zone 'America/Bogota')::date >= p_from)
    and (p_to is null or (scheduled_start at time zone 'America/Bogota')::date <= p_to)
  order by scheduled_start desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.metrics_booking_status_counts(p_service_id text)
returns table (
  status text,
  count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select status, count(*)::bigint
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
  group by 1;
$$;

create or replace function public.metrics_heatmap_points_page(
  p_service_id text,
  p_limit integer default 500,
  p_offset integer default 0,
  p_status text default null
)
returns table (
  appointment_id text,
  scheduled_start timestamptz,
  status text,
  start_latitude numeric,
  start_longitude numeric,
  latitude numeric,
  longitude numeric,
  client_id text,
  client_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    appointment_id,
    scheduled_start,
    status,
    start_latitude,
    start_longitude,
    latitude,
    longitude,
    client_id,
    client_phone
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
    and (p_status is null or status = p_status)
  order by scheduled_start desc nulls last
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create index if not exists whatsapp_message_log_metrics_created_idx
  on public.whatsapp_message_log (created_at)
  where hidden_from_panel = false;

create index if not exists whatsapp_message_log_metrics_phone_created_idx
  on public.whatsapp_message_log (phone_number_id, created_at)
  where hidden_from_panel = false;

create index if not exists bookings_metrics_service_start_idx
  on public.bookings (service_id, scheduled_start)
  where source_deleted_at is null;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'metrics_inbound_contact_days',
        'metrics_outbound_facts',
        'metrics_outbound_window_totals',
        'metrics_bookings_daily',
        'metrics_lifetime_collected',
        'metrics_directory_snapshot',
        'metrics_quality_nucleus',
        'metrics_heatmap_summary',
        'metrics_directory_page',
        'metrics_completed_appointments_page',
        'metrics_heatmap_points_page',
        'metrics_booking_status_counts'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end
$$;
