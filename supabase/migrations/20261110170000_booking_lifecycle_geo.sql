alter table public.bookings
  add column if not exists departed_latitude numeric(9, 6),
  add column if not exists departed_longitude numeric(9, 6),
  add column if not exists departed_accuracy_m numeric(8, 1),
  add column if not exists departed_captured_at timestamptz,
  add column if not exists completed_latitude numeric(9, 6),
  add column if not exists completed_longitude numeric(9, 6),
  add column if not exists completed_accuracy_m numeric(8, 1),
  add column if not exists completed_captured_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_departed_latitude_check,
  drop constraint if exists bookings_departed_longitude_check,
  drop constraint if exists bookings_completed_latitude_check,
  drop constraint if exists bookings_completed_longitude_check;

alter table public.bookings
  add constraint bookings_departed_latitude_check check (
    departed_latitude is null or departed_latitude between -90 and 90
  ),
  add constraint bookings_departed_longitude_check check (
    departed_longitude is null or departed_longitude between -180 and 180
  ),
  add constraint bookings_completed_latitude_check check (
    completed_latitude is null or completed_latitude between -90 and 90
  ),
  add constraint bookings_completed_longitude_check check (
    completed_longitude is null or completed_longitude between -180 and 180
  );

comment on column public.bookings.departed_latitude is
  'GPS del profesional al marcar Ya salí (providerGeoCheckpoints.DEPARTED.lat).';
comment on column public.bookings.departed_longitude is
  'GPS del profesional al marcar Ya salí (providerGeoCheckpoints.DEPARTED.lng).';
comment on column public.bookings.completed_latitude is
  'GPS del profesional al finalizar (providerGeoCheckpoints.COMPLETED.lat).';
comment on column public.bookings.completed_longitude is
  'GPS del profesional al finalizar (providerGeoCheckpoints.COMPLETED.lng).';

create or replace function public.patch_booking_lifecycle_geo(
  p_service_id text,
  p_appointment_id text,
  p_departed_latitude numeric default null,
  p_departed_longitude numeric default null,
  p_departed_accuracy_m numeric default null,
  p_departed_captured_at timestamptz default null,
  p_completed_latitude numeric default null,
  p_completed_longitude numeric default null,
  p_completed_accuracy_m numeric default null,
  p_completed_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking_id uuid;
begin
  if nullif(p_service_id, '') is null or nullif(p_appointment_id, '') is null then
    raise exception using
      errcode = '22023',
      message = 'service_id and appointment_id are required';
  end if;

  update public.bookings
  set
    departed_latitude = p_departed_latitude,
    departed_longitude = p_departed_longitude,
    departed_accuracy_m = p_departed_accuracy_m,
    departed_captured_at = p_departed_captured_at,
    completed_latitude = p_completed_latitude,
    completed_longitude = p_completed_longitude,
    completed_accuracy_m = p_completed_accuracy_m,
    completed_captured_at = p_completed_captured_at
  where service_id = p_service_id
    and appointment_id = p_appointment_id
  returning id into v_booking_id;

  if v_booking_id is null then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'reason', 'updated',
    'booking_id', v_booking_id
  );
end;
$$;

revoke execute on function public.patch_booking_lifecycle_geo(
  text, text, numeric, numeric, numeric, timestamptz, numeric, numeric, numeric, timestamptz
) from public, anon, authenticated;

grant execute on function public.patch_booking_lifecycle_geo(
  text, text, numeric, numeric, numeric, timestamptz, numeric, numeric, numeric, timestamptz
) to service_role;
