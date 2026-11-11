alter table public.bookings
  add column if not exists departed_received_at timestamptz,
  add column if not exists departed_offline boolean not null default false,
  add column if not exists start_received_at timestamptz,
  add column if not exists start_offline boolean not null default false,
  add column if not exists completed_received_at timestamptz,
  add column if not exists completed_offline boolean not null default false;

comment on column public.bookings.departed_received_at is
  'Hora del servidor al recibir Ya salí. departed_captured_at sigue siendo la hora del teléfono cuando existe.';
comment on column public.bookings.departed_offline is
  'La marca Ya salí llegó por la cola offlineSync_apply.';
comment on column public.bookings.start_received_at is
  'Hora del servidor al recibir Iniciar servicio.';
comment on column public.bookings.start_offline is
  'La marca Iniciar llegó por la cola offlineSync_apply.';
comment on column public.bookings.completed_received_at is
  'Hora del servidor al recibir Finalizar.';
comment on column public.bookings.completed_offline is
  'La marca Finalizar llegó por la cola offlineSync_apply.';

create or replace function public.patch_booking_lifecycle_offline(
  p_service_id text,
  p_appointment_id text,
  p_departed_received_at timestamptz default null,
  p_departed_offline boolean default false,
  p_start_received_at timestamptz default null,
  p_start_offline boolean default false,
  p_completed_received_at timestamptz default null,
  p_completed_offline boolean default false
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
    departed_received_at = p_departed_received_at,
    departed_offline = coalesce(p_departed_offline, false),
    start_received_at = p_start_received_at,
    start_offline = coalesce(p_start_offline, false),
    completed_received_at = p_completed_received_at,
    completed_offline = coalesce(p_completed_offline, false)
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

revoke execute on function public.patch_booking_lifecycle_offline(
  text, text, timestamptz, boolean, timestamptz, boolean, timestamptz, boolean
) from public, anon, authenticated;

grant execute on function public.patch_booking_lifecycle_offline(
  text, text, timestamptz, boolean, timestamptz, boolean, timestamptz, boolean
) to service_role;
