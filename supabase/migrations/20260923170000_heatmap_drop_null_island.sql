-- (0, 0) is not a place. Drop it from stored bookings and from heatmap coverage.

update public.bookings
set latitude = null,
    longitude = null
where latitude = 0
  and longitude = 0;

update public.bookings
set start_latitude = null,
    start_longitude = null
where start_latitude = 0
  and start_longitude = 0;

create or replace function public.metrics_heatmap_summary(p_service_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      (
        start_latitude is not null
        and start_longitude is not null
        and not (start_latitude = 0 and start_longitude = 0)
      ) as has_gps,
      (
        latitude is not null
        and longitude is not null
        and not (latitude = 0 and longitude = 0)
      ) as has_address
    from public.bookings
    where service_id = p_service_id
      and source_deleted_at is null
  )
  select jsonb_build_object(
    'coverage', jsonb_build_object(
      'total', (select count(*) from rows),
      'withGps', (select count(*) from rows where has_gps),
      'withAddressOnly', (select count(*) from rows where not has_gps and has_address),
      'withoutPoint', (select count(*) from rows where not has_gps and not has_address)
    ),
    'daily', coalesce((
      select jsonb_agg(
        jsonb_build_object('bucket', bucket_day, 'count', cnt)
        order by bucket_day
      )
      from (
        select
          (scheduled_start at time zone 'America/Bogota')::date as bucket_day,
          count(*)::int as cnt
        from public.bookings
        where service_id = p_service_id
          and source_deleted_at is null
          and scheduled_start is not null
        group by 1
      ) d
    ), '[]'::jsonb)
  );
$$;

drop function if exists public.metrics_heatmap_points_page(text, integer, integer, text);

create function public.metrics_heatmap_points_page(
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
  client_phone text,
  client_name text,
  location_address text,
  barrio text,
  comuna text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.appointment_id,
    b.scheduled_start,
    b.status,
    b.start_latitude,
    b.start_longitude,
    b.latitude,
    b.longitude,
    b.client_id,
    b.client_phone,
    b.client_name,
    b.location_address,
    b.barrio,
    b.comuna
  from public.bookings b
  where b.service_id = p_service_id
    and b.source_deleted_at is null
    and (p_status is null or b.status = p_status)
  order by b.scheduled_start desc nulls last
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.metrics_heatmap_summary(text) from public, anon, authenticated;
grant execute on function public.metrics_heatmap_summary(text) to service_role;

revoke all on function public.metrics_heatmap_points_page(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.metrics_heatmap_points_page(text, integer, integer, text) to service_role;
