alter table public.bookings
  add column if not exists start_latitude numeric(9, 6),
  add column if not exists start_longitude numeric(9, 6),
  add column if not exists start_accuracy_m numeric(8, 1),
  add column if not exists start_captured_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_start_latitude_check,
  drop constraint if exists bookings_start_longitude_check;

alter table public.bookings
  add constraint bookings_start_latitude_check check (
    start_latitude is null or start_latitude between -90 and 90
  ),
  add constraint bookings_start_longitude_check check (
    start_longitude is null or start_longitude between -180 and 180
  );

comment on column public.bookings.start_latitude is
  'GPS del profesional al iniciar el servicio (providerGeoCheckpoints.IN_PROGRESS.lat). Distinto de latitude (dirección de agenda).';

comment on column public.bookings.start_longitude is
  'GPS del profesional al iniciar el servicio (providerGeoCheckpoints.IN_PROGRESS.lng).';

comment on column public.bookings.start_accuracy_m is
  'Precisión reportada por el dispositivo al iniciar, en metros.';

comment on column public.bookings.start_captured_at is
  'Timestamp del servidor al persistir el hito IN_PROGRESS.';

create index if not exists bookings_start_geo_idx
  on public.bookings (service_id, start_latitude, start_longitude)
  where start_latitude is not null
    and start_longitude is not null
    and source_deleted_at is null;

create or replace function public.patch_booking_start_geo(
  p_service_id text,
  p_appointment_id text,
  p_start_latitude numeric default null,
  p_start_longitude numeric default null,
  p_start_accuracy_m numeric default null,
  p_start_captured_at timestamptz default null
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
    start_latitude = p_start_latitude,
    start_longitude = p_start_longitude,
    start_accuracy_m = p_start_accuracy_m,
    start_captured_at = p_start_captured_at
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

revoke execute on function public.patch_booking_start_geo(text, text, numeric, numeric, numeric, timestamptz)
from public, anon, authenticated;

grant execute on function public.patch_booking_start_geo(text, text, numeric, numeric, numeric, timestamptz)
to service_role;
