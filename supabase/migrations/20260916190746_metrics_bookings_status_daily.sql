-- Daily booking counts by exact status + paginated appointment detail.
-- Replaces metrics_bookings_daily OUT columns; grants stay service_role only.

drop function if exists public.metrics_bookings_daily(text);

create function public.metrics_bookings_daily(p_service_id text)
returns table (
  bucket_day date,
  pending bigint,
  pending_reschedule bigint,
  confirmed bigint,
  en_route bigint,
  in_progress bigint,
  completed bigint,
  canceled bigint,
  rejected bigint,
  total bigint,
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
    count(*) filter (where status = 'PENDING')::bigint as pending,
    count(*) filter (where status = 'PENDING_RESCHEDULE')::bigint as pending_reschedule,
    count(*) filter (where status = 'CONFIRMED')::bigint as confirmed,
    count(*) filter (where status = 'EN_ROUTE')::bigint as en_route,
    count(*) filter (where status = 'IN_PROGRESS')::bigint as in_progress,
    count(*) filter (where status = 'COMPLETED')::bigint as completed,
    count(*) filter (where status = 'CANCELED')::bigint as canceled,
    count(*) filter (where status = 'REJECTED')::bigint as rejected,
    count(*)::bigint as total,
    coalesce(sum(total_cop) filter (where payment_status = 'PAGO_ACEPTADO'), 0)::bigint as collected_cop,
    count(*) filter (where payment_status = 'PAGO_ACEPTADO')::bigint as paid_count
  from public.bookings
  where service_id = p_service_id
    and source_deleted_at is null
    and scheduled_start is not null
  group by 1
  order by 1;
$$;

drop function if exists public.metrics_appointments_page(text, integer, integer, date, date, text[]);

create function public.metrics_appointments_page(
  p_service_id text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_from date default null,
  p_to date default null,
  p_statuses text[] default null
)
returns table (
  appointment_id text,
  scheduled_date timestamptz,
  status text,
  client_name text,
  client_phone text,
  provider_name text,
  team_member_id text,
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
    b.appointment_id,
    b.scheduled_start,
    b.status,
    b.client_name,
    b.client_phone,
    crew.provider_name,
    crew.team_member_id,
    b.location_address,
    b.required_cleaner_minutes,
    b.total_cop,
    b.paid_cop,
    b.pending_cop,
    b.payment_status
  from public.bookings b
  left join lateral (
    select
      nullif(string_agg(m.name, ', ' order by c.is_lead desc, m.name), '') as provider_name,
      (array_agg(c.cleaner_id order by c.is_lead desc, m.name))[1] as team_member_id
    from public.booking_crew c
    join public.crm_team_members m
      on m.service_id = c.service_id
     and m.id = c.cleaner_id
    where c.service_id = b.service_id
      and c.booking_id = b.id
  ) crew on true
  where b.service_id = p_service_id
    and b.source_deleted_at is null
    and b.scheduled_start is not null
    and (
      p_statuses is null
      or cardinality(p_statuses) = 0
      or b.status = any(p_statuses)
    )
    and (p_from is null or (b.scheduled_start at time zone 'America/Bogota')::date >= p_from)
    and (p_to is null or (b.scheduled_start at time zone 'America/Bogota')::date <= p_to)
  order by b.scheduled_start desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.metrics_bookings_daily(text) from public, anon, authenticated;
grant execute on function public.metrics_bookings_daily(text) to service_role;

revoke all on function public.metrics_appointments_page(text, integer, integer, date, date, text[])
  from public, anon, authenticated;
grant execute on function public.metrics_appointments_page(text, integer, integer, date, date, text[])
  to service_role;
