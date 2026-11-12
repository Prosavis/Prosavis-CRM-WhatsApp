-- Un parche parcial no borra la hora ya guardada cuando el argumento llega null.

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
    departed_received_at = coalesce(p_departed_received_at, departed_received_at),
    departed_offline = departed_offline or coalesce(p_departed_offline, false),
    start_received_at = coalesce(p_start_received_at, start_received_at),
    start_offline = start_offline or coalesce(p_start_offline, false),
    completed_received_at = coalesce(p_completed_received_at, completed_received_at),
    completed_offline = completed_offline or coalesce(p_completed_offline, false)
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
