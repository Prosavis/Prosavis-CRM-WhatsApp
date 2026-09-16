-- Directorio canónico: resumen, página filtrada e historial de cancelaciones.
-- Reutiliza identidad de métricas (phone digits / client_id / app_user_id).
-- Solo service_role; no modificar 20260916120000_metrics_historical_aggregates.sql.

create or replace function app_private.directory_workspace_scored(p_service_id text)
returns table (
  directory_id uuid,
  full_name text,
  display_name text,
  email text,
  phone text,
  photo_url text,
  app_user_id text,
  is_app_user boolean,
  provider_id text,
  service_id text,
  classification text,
  quality_tag text,
  status text,
  source text,
  channels text[],
  tags text[],
  messages_count integer,
  unread_whatsapp_count integer,
  last_whatsapp_message_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  appointment_count bigint,
  last_appointment_at timestamptz,
  next_appointment_at timestamptz,
  last_completed_payment_status text,
  computed_debt bigint,
  cancellation_count bigint,
  latest_cancellation_appointment_id text,
  latest_cancellation_at timestamptz,
  latest_cancellation_status text,
  latest_cancellation_reason text,
  latest_cancellation_reason_other text,
  is_scheduled boolean,
  is_canceled boolean,
  is_recurring boolean,
  is_reactivation boolean,
  is_blacklisted boolean
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with booking_keys as (
    select
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.payment_status,
      b.pending_cop,
      b.cancellation_reason,
      b.cancellation_reason_other,
      k.match_key
    from public.bookings b
    cross join lateral unnest(array_remove(array[
      app_private.metrics_phone_digits(b.client_phone),
      nullif(btrim(coalesce(b.client_id, '')), ''),
      nullif(btrim(coalesce(b.client_app_user_id, '')), '')
    ], null)) as k(match_key)
    where b.service_id = p_service_id
      and b.source_deleted_at is null
  ),
  directory_keys as (
    select
      d.id as directory_id,
      k.match_key
    from public.crm_directory d
    cross join lateral unnest(array_remove(array[
      d.phone_key,
      app_private.metrics_phone_digits(d.phone),
      nullif(btrim(coalesce(d.app_user_id, '')), ''),
      d.id::text
    ], null)) as k(match_key)
  ),
  matched_bookings as (
    select distinct
      dk.directory_id,
      bk.appointment_id,
      bk.status,
      bk.scheduled_start,
      bk.updated_at,
      bk.payment_status,
      bk.pending_cop,
      bk.cancellation_reason,
      bk.cancellation_reason_other
    from directory_keys dk
    join booking_keys bk on bk.match_key = dk.match_key
  ),
  booking_stats as (
    select
      mb.directory_id,
      count(*)::bigint as appointment_count,
      max(mb.scheduled_start) as last_appointment_at,
      min(mb.scheduled_start) filter (
        where mb.status not in ('COMPLETED', 'CANCELED', 'REJECTED')
          and mb.scheduled_start >= now()
      ) as next_appointment_at,
      (
        array_agg(mb.payment_status order by mb.scheduled_start desc nulls last)
        filter (where mb.status = 'COMPLETED')
      )[1] as last_completed_payment_status,
      coalesce(sum(mb.pending_cop) filter (where mb.status = 'COMPLETED'), 0)::bigint as computed_debt,
      count(*) filter (where mb.status in ('CANCELED', 'REJECTED'))::bigint as cancellation_count,
      (
        array_agg(mb.appointment_id order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
        filter (where mb.status in ('CANCELED', 'REJECTED'))
      )[1] as latest_cancellation_appointment_id,
      max(coalesce(mb.updated_at, mb.scheduled_start)) filter (
        where mb.status in ('CANCELED', 'REJECTED')
      ) as latest_cancellation_at,
      (
        array_agg(mb.status order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
        filter (where mb.status in ('CANCELED', 'REJECTED'))
      )[1] as latest_cancellation_status,
      (
        array_agg(mb.cancellation_reason order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
        filter (where mb.status in ('CANCELED', 'REJECTED'))
      )[1] as latest_cancellation_reason,
      (
        array_agg(mb.cancellation_reason_other order by coalesce(mb.updated_at, mb.scheduled_start) desc nulls last)
        filter (where mb.status in ('CANCELED', 'REJECTED'))
      )[1] as latest_cancellation_reason_other
    from matched_bookings mb
    group by mb.directory_id
  )
  select
    d.id,
    d.full_name,
    d.display_name,
    d.email,
    d.phone,
    d.photo_url,
    d.app_user_id,
    d.is_app_user,
    d.provider_id,
    d.service_id,
    d.classification,
    d.quality_tag,
    d.status,
    d.source,
    d.channels,
    d.tags,
    d.messages_count,
    d.unread_whatsapp_count,
    d.last_whatsapp_message_at,
    d.last_contact_at,
    d.created_at,
    d.updated_at,
    coalesce(bs.appointment_count, 0),
    bs.last_appointment_at,
    bs.next_appointment_at,
    bs.last_completed_payment_status,
    coalesce(bs.computed_debt, 0),
    coalesce(bs.cancellation_count, 0),
    bs.latest_cancellation_appointment_id,
    bs.latest_cancellation_at,
    bs.latest_cancellation_status,
    bs.latest_cancellation_reason,
    bs.latest_cancellation_reason_other,
    (
      coalesce(bs.appointment_count, 0) > 0
      or app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['agendado', 'agendada']
      )
    ),
    coalesce(bs.cancellation_count, 0) > 0,
    coalesce(bs.appointment_count, 0) > 0
      and app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['cliente recurrente', 'recurrente']
      ),
    coalesce(bs.appointment_count, 0) > 0
      and not app_private.metrics_has_any_token(
        d.classification,
        d.tags,
        array['decline', 'bloqueado', '🚫']
      )
      and bs.last_appointment_at is not null
      and bs.last_appointment_at < (now() - interval '30 days'),
    app_private.metrics_has_any_token(
      d.classification,
      d.tags,
      array['decline', 'bloqueado', '🚫']
    )
  from public.crm_directory d
  left join booking_stats bs on bs.directory_id = d.id
  where lower(coalesce(d.status, 'active')) = 'active'
    and coalesce(d.opt_out, false) = false
    and not app_private.metrics_is_test_contact(d.classification, d.tags);
$$;

create or replace function public.directory_workspace_snapshot(p_service_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  select jsonb_build_object(
    'total', count(*)::bigint,
    'scheduled', count(*) filter (where s.is_scheduled)::bigint,
    'canceledOrRejected', count(*) filter (where s.is_canceled)::bigint,
    'recurring', count(*) filter (where s.is_recurring)::bigint,
    'reactivation', count(*) filter (where s.is_reactivation)::bigint
  )
  from app_private.directory_workspace_scored(p_service_id) s;
$$;

create or replace function public.directory_workspace_page(
  p_service_id text,
  p_view text default 'all',
  p_search text default null,
  p_segment text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  display_name text,
  email text,
  phone text,
  photo_url text,
  app_user_id text,
  is_app_user boolean,
  provider_id text,
  service_id text,
  classification text,
  quality_tag text,
  status text,
  source text,
  channels text[],
  tags text[],
  messages_count integer,
  unread_whatsapp_count integer,
  last_whatsapp_message_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  appointment_count bigint,
  last_appointment_at timestamptz,
  next_appointment_at timestamptz,
  last_completed_payment_status text,
  computed_debt bigint,
  cancellation_count bigint,
  latest_cancellation_appointment_id text,
  latest_cancellation_at timestamptz,
  latest_cancellation_status text,
  latest_cancellation_reason text,
  latest_cancellation_reason_other text,
  is_scheduled boolean,
  is_canceled boolean,
  is_recurring boolean,
  is_reactivation boolean,
  is_blacklisted boolean,
  matched_count bigint
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with scored as (
    select *
    from app_private.directory_workspace_scored(p_service_id)
  ),
  filtered as (
    select s.*
    from scored s
    where (
      case lower(coalesce(p_view, 'all'))
        when 'scheduled' then s.is_scheduled
        when 'canceled' then s.is_canceled
        else true
      end
    )
    and (
      case lower(coalesce(nullif(btrim(p_segment), ''), ''))
        when 'recurring' then s.is_recurring
        when 'reactivation' then s.is_reactivation
        else true
      end
    )
    and (
      nullif(btrim(p_search), '') is null
      or coalesce(s.display_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.full_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.phone, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.latest_cancellation_reason, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(s.latest_cancellation_reason_other, '') ilike '%' || btrim(p_search) || '%'
    )
  ),
  counted as (
    select f.*, count(*) over() as matched_count
    from filtered f
  )
  select
    c.directory_id,
    c.full_name,
    c.display_name,
    c.email,
    c.phone,
    c.photo_url,
    c.app_user_id,
    c.is_app_user,
    c.provider_id,
    c.service_id,
    c.classification,
    c.quality_tag,
    c.status,
    c.source,
    c.channels,
    c.tags,
    c.messages_count,
    c.unread_whatsapp_count,
    c.last_whatsapp_message_at,
    c.last_contact_at,
    c.created_at,
    c.updated_at,
    c.appointment_count,
    c.last_appointment_at,
    c.next_appointment_at,
    c.last_completed_payment_status,
    c.computed_debt,
    c.cancellation_count,
    c.latest_cancellation_appointment_id,
    c.latest_cancellation_at,
    c.latest_cancellation_status,
    c.latest_cancellation_reason,
    c.latest_cancellation_reason_other,
    c.is_scheduled,
    c.is_canceled,
    c.is_recurring,
    c.is_reactivation,
    c.is_blacklisted,
    c.matched_count
  from counted c
  order by
    case
      when lower(coalesce(p_view, 'all')) = 'canceled' then c.latest_cancellation_at
    end desc nulls last,
    case
      when lower(coalesce(p_view, 'all')) = 'scheduled' then c.last_appointment_at
    end desc nulls last,
    coalesce(c.display_name, c.full_name, c.phone, '')
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.directory_workspace_cancellations(
  p_service_id text,
  p_directory_id uuid
)
returns table (
  appointment_id text,
  status text,
  scheduled_start timestamptz,
  updated_at timestamptz,
  cancellation_reason text,
  cancellation_reason_other text
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with directory_keys as (
    select k.match_key
    from public.crm_directory d
    cross join lateral unnest(array_remove(array[
      d.phone_key,
      app_private.metrics_phone_digits(d.phone),
      nullif(btrim(coalesce(d.app_user_id, '')), ''),
      d.id::text
    ], null)) as k(match_key)
    where d.id = p_directory_id
  ),
  booking_keys as (
    select
      b.appointment_id,
      b.status,
      b.scheduled_start,
      b.updated_at,
      b.cancellation_reason,
      b.cancellation_reason_other,
      k.match_key
    from public.bookings b
    cross join lateral unnest(array_remove(array[
      app_private.metrics_phone_digits(b.client_phone),
      nullif(btrim(coalesce(b.client_id, '')), ''),
      nullif(btrim(coalesce(b.client_app_user_id, '')), '')
    ], null)) as k(match_key)
    where b.service_id = p_service_id
      and b.source_deleted_at is null
      and b.status in ('CANCELED', 'REJECTED')
  )
  select distinct on (bk.appointment_id)
    bk.appointment_id,
    bk.status,
    bk.scheduled_start,
    bk.updated_at,
    bk.cancellation_reason,
    bk.cancellation_reason_other
  from booking_keys bk
  join directory_keys dk on dk.match_key = bk.match_key
  order by bk.appointment_id, coalesce(bk.updated_at, bk.scheduled_start) desc nulls last;
$$;

create or replace function public.directory_workspace_cancellations_ordered(
  p_service_id text,
  p_directory_id uuid
)
returns table (
  appointment_id text,
  status text,
  scheduled_start timestamptz,
  updated_at timestamptz,
  cancellation_reason text,
  cancellation_reason_other text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.appointment_id,
    c.status,
    c.scheduled_start,
    c.updated_at,
    c.cancellation_reason,
    c.cancellation_reason_other
  from public.directory_workspace_cancellations(p_service_id, p_directory_id) c
  order by coalesce(c.updated_at, c.scheduled_start) desc nulls last;
$$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in (
        'directory_workspace_snapshot',
        'directory_workspace_page',
        'directory_workspace_cancellations',
        'directory_workspace_cancellations_ordered'
      ))
      or (n.nspname = 'app_private' and p.proname = 'directory_workspace_scored')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
  end loop;
end
$$;
