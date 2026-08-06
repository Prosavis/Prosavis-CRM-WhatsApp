create or replace function public.apply_ops_booking_projection(
  p_booking jsonb,
  p_crew jsonb default '[]'::jsonb,
  p_addons jsonb default '[]'::jsonb,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing_booking public.bookings%rowtype;
  v_booking_id uuid;
  v_reason text;
begin
  if pg_catalog.jsonb_typeof(p_booking) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'p_booking must be a JSON object';
  end if;

  if not p_booking ?& array[
    'service_id',
    'appointment_id',
    'source_revision',
    'source_hash',
    'source_updated_at'
  ] then
    raise exception using
      errcode = '22023',
      message = 'p_booking is missing required projection fields';
  end if;

  if pg_catalog.jsonb_typeof(p_booking -> 'service_id') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_booking -> 'appointment_id') is distinct from 'string'
     or nullif(p_booking ->> 'service_id', '') is null
     or nullif(p_booking ->> 'appointment_id', '') is null then
    raise exception using
      errcode = '22023',
      message = 'service_id and appointment_id must be non-empty strings';
  end if;

  if pg_catalog.jsonb_typeof(p_booking -> 'source_revision') is distinct from 'number'
     or (p_booking ->> 'source_revision') !~ '^[0-9]+$' then
    raise exception using
      errcode = '22023',
      message = 'source_revision must be a non-negative integer';
  end if;

  if pg_catalog.jsonb_typeof(p_booking -> 'source_hash') is distinct from 'string'
     or (p_booking ->> 'source_hash') !~ '^[0-9a-fA-F]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'source_hash must be a 64-character hexadecimal SHA-256';
  end if;

  if pg_catalog.jsonb_typeof(p_booking -> 'source_updated_at') not in ('null', 'string') then
    raise exception using
      errcode = '22023',
      message = 'source_updated_at must be null or a timestamp string';
  end if;

  if pg_catalog.jsonb_typeof(p_crew) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_addons) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_events) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_crew, p_addons, and p_events must be JSON arrays';
  end if;

  select *
  into v_booking
  from pg_catalog.jsonb_populate_record(null::public.bookings, p_booking);

  v_booking.source_hash := pg_catalog.lower(v_booking.source_hash);

  if exists (
    select 1
    from (
      select child
      from pg_catalog.jsonb_array_elements(p_crew) as crew(child)
      union all
      select child
      from pg_catalog.jsonb_array_elements(p_addons) as addons(child)
      union all
      select child
      from pg_catalog.jsonb_array_elements(p_events) as events(child)
    ) as children
    where pg_catalog.jsonb_typeof(child) is distinct from 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'every child projection must be a JSON object';
  end if;

  if exists (
    select 1
    from (
      select child
      from pg_catalog.jsonb_array_elements(p_crew) as crew(child)
      union all
      select child
      from pg_catalog.jsonb_array_elements(p_addons) as addons(child)
      union all
      select child
      from pg_catalog.jsonb_array_elements(p_events) as events(child)
    ) as children
    where child ? 'service_id'
      and child ->> 'service_id' is distinct from v_booking.service_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'child service_id must match booking service_id';
  end if;

  if pg_catalog.jsonb_array_length(p_crew) > 0
     and (
       select count(*)
       from pg_catalog.jsonb_array_elements(p_crew) as crew(child)
       where coalesce((child ->> 'is_lead')::boolean, false)
     ) <> 1 then
    raise exception using
      errcode = '22023',
      message = 'non-empty crew must contain exactly one lead';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_booking.service_id || pg_catalog.chr(31) || v_booking.appointment_id,
      0
    )
  );

  select *
  into v_existing_booking
  from public.bookings
  where service_id = v_booking.service_id
    and appointment_id = v_booking.appointment_id
  for update;

  if found then
    v_booking_id := v_existing_booking.id;

    if v_booking.source_revision < v_existing_booking.source_revision then
      return pg_catalog.jsonb_build_object(
        'booking_id', v_booking_id,
        'applied', false,
        'reason', 'stale_revision',
        'source_revision', v_booking.source_revision
      );
    end if;

    if v_booking.source_revision = v_existing_booking.source_revision then
      return pg_catalog.jsonb_build_object(
        'booking_id', v_booking_id,
        'applied', false,
        'reason', case
          when v_booking.source_hash = v_existing_booking.source_hash
            then 'same_revision'
          else 'revision_conflict'
        end,
        'source_revision', v_booking.source_revision
      );
    end if;

    update public.bookings
    set
      source_revision = v_booking.source_revision,
      source_hash = v_booking.source_hash,
      source_created_at = v_booking.source_created_at,
      source_updated_at = v_booking.source_updated_at,
      prepay_verified_at = v_booking.prepay_verified_at,
      status = coalesce(v_booking.status, 'PENDING'),
      tier = v_booking.tier,
      required_cleaner_minutes = coalesce(v_booking.required_cleaner_minutes, 0),
      scheduled_start = v_booking.scheduled_start,
      scheduled_end = v_booking.scheduled_end,
      fulfillment = coalesce(v_booking.fulfillment, 'single'),
      crew_size = coalesce(v_booking.crew_size, 1),
      building_id = v_booking.building_id,
      location_address = v_booking.location_address,
      barrio = v_booking.barrio,
      comuna = v_booking.comuna,
      latitude = v_booking.latitude,
      longitude = v_booking.longitude,
      client_id = v_booking.client_id,
      client_name = v_booking.client_name,
      client_phone = v_booking.client_phone,
      client_app_user_id = v_booking.client_app_user_id,
      window_start = v_booking.window_start,
      window_end = v_booking.window_end,
      payment_status = coalesce(v_booking.payment_status, 'PAGO_PENDIENTE'),
      payment_method = v_booking.payment_method,
      payment_id = v_booking.payment_id,
      wompi_reference = v_booking.wompi_reference,
      wompi_transaction_id = v_booking.wompi_transaction_id,
      subtotal_cop = coalesce(v_booking.subtotal_cop, 0),
      total_cop = coalesce(v_booking.total_cop, 0),
      paid_cop = coalesce(v_booking.paid_cop, 0),
      pending_cop = coalesce(v_booking.pending_cop, 0),
      is_first_booking = coalesce(v_booking.is_first_booking, false),
      acquisition_channel = v_booking.acquisition_channel,
      cac_cop = coalesce(v_booking.cac_cop, 0),
      has_addons = coalesce(v_booking.has_addons, false),
      addon_total_cop = coalesce(v_booking.addon_total_cop, 0),
      cancellation_fee_cop = coalesce(v_booking.cancellation_fee_cop, 0),
      assignment_source = v_booking.assignment_source,
      assignment_decision_id = v_booking.assignment_decision_id,
      source_deleted_at = v_booking.source_deleted_at
    where id = v_booking_id;

    v_reason := 'updated';
  else
    insert into public.bookings (
      service_id,
      appointment_id,
      source_revision,
      source_hash,
      source_created_at,
      source_updated_at,
      prepay_verified_at,
      status,
      tier,
      required_cleaner_minutes,
      scheduled_start,
      scheduled_end,
      fulfillment,
      crew_size,
      building_id,
      location_address,
      barrio,
      comuna,
      latitude,
      longitude,
      client_id,
      client_name,
      client_phone,
      client_app_user_id,
      window_start,
      window_end,
      payment_status,
      payment_method,
      payment_id,
      wompi_reference,
      wompi_transaction_id,
      subtotal_cop,
      total_cop,
      paid_cop,
      pending_cop,
      is_first_booking,
      acquisition_channel,
      cac_cop,
      has_addons,
      addon_total_cop,
      cancellation_fee_cop,
      assignment_source,
      assignment_decision_id,
      source_deleted_at
    )
    values (
      v_booking.service_id,
      v_booking.appointment_id,
      v_booking.source_revision,
      v_booking.source_hash,
      v_booking.source_created_at,
      v_booking.source_updated_at,
      v_booking.prepay_verified_at,
      coalesce(v_booking.status, 'PENDING'),
      v_booking.tier,
      coalesce(v_booking.required_cleaner_minutes, 0),
      v_booking.scheduled_start,
      v_booking.scheduled_end,
      coalesce(v_booking.fulfillment, 'single'),
      coalesce(v_booking.crew_size, 1),
      v_booking.building_id,
      v_booking.location_address,
      v_booking.barrio,
      v_booking.comuna,
      v_booking.latitude,
      v_booking.longitude,
      v_booking.client_id,
      v_booking.client_name,
      v_booking.client_phone,
      v_booking.client_app_user_id,
      v_booking.window_start,
      v_booking.window_end,
      coalesce(v_booking.payment_status, 'PAGO_PENDIENTE'),
      v_booking.payment_method,
      v_booking.payment_id,
      v_booking.wompi_reference,
      v_booking.wompi_transaction_id,
      coalesce(v_booking.subtotal_cop, 0),
      coalesce(v_booking.total_cop, 0),
      coalesce(v_booking.paid_cop, 0),
      coalesce(v_booking.pending_cop, 0),
      coalesce(v_booking.is_first_booking, false),
      v_booking.acquisition_channel,
      coalesce(v_booking.cac_cop, 0),
      coalesce(v_booking.has_addons, false),
      coalesce(v_booking.addon_total_cop, 0),
      coalesce(v_booking.cancellation_fee_cop, 0),
      v_booking.assignment_source,
      v_booking.assignment_decision_id,
      v_booking.source_deleted_at
    )
    returning id into v_booking_id;

    v_reason := 'inserted';
  end if;

  delete from public.booking_crew
  where service_id = v_booking.service_id
    and booking_id = v_booking_id;

  insert into public.booking_crew (
    id,
    service_id,
    booking_id,
    cleaner_id,
    assigned_minutes,
    is_lead,
    scheduled_start,
    scheduled_end,
    actual_start,
    actual_end,
    ya_trabajaba_ese_dia,
    estimated_marginal_cost_cop,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(child ->> 'id', '')::uuid, pg_catalog.gen_random_uuid()),
    v_booking.service_id,
    v_booking_id,
    child ->> 'cleaner_id',
    coalesce((child ->> 'assigned_minutes')::integer, 0),
    coalesce((child ->> 'is_lead')::boolean, false),
    (child ->> 'scheduled_start')::timestamptz,
    (child ->> 'scheduled_end')::timestamptz,
    (child ->> 'actual_start')::timestamptz,
    (child ->> 'actual_end')::timestamptz,
    coalesce((child ->> 'ya_trabajaba_ese_dia')::boolean, false),
    coalesce((child ->> 'estimated_marginal_cost_cop')::bigint, 0),
    coalesce((child ->> 'created_at')::timestamptz, pg_catalog.now()),
    coalesce((child ->> 'updated_at')::timestamptz, pg_catalog.now())
  from pg_catalog.jsonb_array_elements(p_crew) as crew(child);

  delete from public.booking_addons
  where service_id = v_booking.service_id
    and booking_id = v_booking_id;

  insert into public.booking_addons (
    id,
    service_id,
    booking_id,
    addon_id,
    minutes,
    price_cop,
    sold_at,
    created_at,
    updated_at
  )
  select
    coalesce(nullif(child ->> 'id', '')::uuid, pg_catalog.gen_random_uuid()),
    v_booking.service_id,
    v_booking_id,
    child ->> 'addon_id',
    coalesce((child ->> 'minutes')::integer, 0),
    coalesce((child ->> 'price_cop')::bigint, 0),
    child ->> 'sold_at',
    coalesce((child ->> 'created_at')::timestamptz, pg_catalog.now()),
    coalesce((child ->> 'updated_at')::timestamptz, pg_catalog.now())
  from pg_catalog.jsonb_array_elements(p_addons) as addons(child);

  delete from public.booking_events
  where service_id = v_booking.service_id
    and booking_id = v_booking_id;

  insert into public.booking_events (
    id,
    service_id,
    booking_id,
    event,
    payload,
    actor,
    created_at
  )
  select
    coalesce(nullif(child ->> 'id', '')::uuid, pg_catalog.gen_random_uuid()),
    v_booking.service_id,
    v_booking_id,
    child ->> 'event',
    coalesce(child -> 'payload', '{}'::jsonb),
    child ->> 'actor',
    coalesce((child ->> 'created_at')::timestamptz, pg_catalog.now())
  from pg_catalog.jsonb_array_elements(p_events) as events(child);

  return pg_catalog.jsonb_build_object(
    'booking_id', v_booking_id,
    'applied', true,
    'reason', v_reason,
    'source_revision', v_booking.source_revision
  );
end;
$$;

revoke execute on function public.apply_ops_booking_projection(jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.bookings,
  public.booking_crew,
  public.booking_addons,
  public.booking_events
to service_role;

grant execute on function public.apply_ops_booking_projection(jsonb, jsonb, jsonb, jsonb)
to service_role;
