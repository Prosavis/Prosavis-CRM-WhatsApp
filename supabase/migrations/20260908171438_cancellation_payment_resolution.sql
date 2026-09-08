-- Cancelación justificada + resolución financiera (proyección reporting).
-- Firestore sigue siendo la autoridad. Estas columnas son agregados.

alter table public.bookings
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_reason_other text,
  add column if not exists cancellation_reason_pending boolean not null default false,
  add column if not exists financial_outcome text,
  add column if not exists refund_cop bigint not null default 0,
  add column if not exists credit_issued_cop bigint not null default 0,
  add column if not exists credit_applied_cop bigint not null default 0,
  add column if not exists paid_gross_cop bigint not null default 0,
  add column if not exists net_collected_cop bigint not null default 0;

update public.bookings
set paid_gross_cop = paid_cop
where paid_gross_cop = 0
  and paid_cop > 0;

update public.bookings
set net_collected_cop = greatest(paid_cop - refund_cop, 0)
where net_collected_cop = 0
  and paid_cop > 0;

update public.bookings
set cancellation_reason = 'motivo_desconocido_legacy'
where status in ('CANCELED', 'CANCELLED')
  and (cancellation_reason is null or btrim(cancellation_reason) = '');

alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check check (
    payment_status in (
      'PAGO_PENDIENTE',
      'PAGO_EN_PROCESO',
      'PAGO_ACEPTADO',
      'PAGO_RECHAZADO'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_cancellation_reason_check;

alter table public.bookings
  add constraint bookings_cancellation_reason_check check (
    cancellation_reason is null
    or cancellation_reason in (
      'cliente_viaja_aplaza',
      'no_necesita',
      'precio',
      'calidad_queja',
      'fuerza_mayor',
      'error_interno',
      'no_confirmo',
      'falta_por_confirmar',
      'otro',
      'motivo_desconocido_legacy'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_cancellation_reason_required_check;

alter table public.bookings
  add constraint bookings_cancellation_reason_required_check check (
    status not in ('CANCELED', 'CANCELLED')
    or cancellation_reason is not null
  );

alter table public.bookings
  drop constraint if exists bookings_cancellation_reason_other_check;

alter table public.bookings
  add constraint bookings_cancellation_reason_other_check check (
    cancellation_reason is distinct from 'otro'
    or (cancellation_reason_other is not null and btrim(cancellation_reason_other) <> '')
  );

alter table public.bookings
  drop constraint if exists bookings_financial_outcome_check;

alter table public.bookings
  add constraint bookings_financial_outcome_check check (
    financial_outcome is null
    or financial_outcome in ('PAGO_DEVUELTO', 'CREDITO_A_FAVOR', 'CANCELADO_SIN_PAGO')
  );

alter table public.bookings
  drop constraint if exists bookings_resolution_money_check;

alter table public.bookings
  add constraint bookings_resolution_money_check check (
    refund_cop >= 0
    and credit_issued_cop >= 0
    and credit_applied_cop >= 0
    and paid_gross_cop >= 0
    and net_collected_cop >= 0
  );

alter table public.booking_facts
  add column if not exists paid_gross_cop bigint not null default 0,
  add column if not exists refund_cop bigint not null default 0,
  add column if not exists credit_issued_cop bigint not null default 0,
  add column if not exists credit_applied_cop bigint not null default 0,
  add column if not exists credit_liability_cop bigint not null default 0;

alter table public.daily_ops_rollup
  add column if not exists paid_gross_cop bigint not null default 0,
  add column if not exists refund_cop bigint not null default 0,
  add column if not exists credit_issued_cop bigint not null default 0,
  add column if not exists credit_applied_cop bigint not null default 0,
  add column if not exists credit_liability_cop bigint not null default 0;

create or replace function app_private.normalize_booking_cancellation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('CANCELED', 'CANCELLED')
     and nullif(btrim(coalesce(new.cancellation_reason, '')), '') is null then
    new.cancellation_reason := 'motivo_desconocido_legacy';
  end if;
  if coalesce(new.paid_gross_cop, 0) = 0 and coalesce(new.paid_cop, 0) > 0 then
    new.paid_gross_cop := new.paid_cop;
  end if;
  if new.net_collected_cop is null then
    new.net_collected_cop := greatest(
      coalesce(new.paid_gross_cop, new.paid_cop, 0) - coalesce(new.refund_cop, 0),
      0
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_normalize_cancellation on public.bookings;
create trigger bookings_normalize_cancellation
before insert or update on public.bookings
for each row
execute function app_private.normalize_booking_cancellation();

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

  if v_booking.status in ('CANCELED', 'CANCELLED')
     and nullif(btrim(coalesce(v_booking.cancellation_reason, '')), '') is null then
    v_booking.cancellation_reason := 'motivo_desconocido_legacy';
  end if;
  if coalesce(v_booking.paid_gross_cop, 0) = 0 then
    v_booking.paid_gross_cop := coalesce(v_booking.paid_cop, 0);
  end if;
  if coalesce(v_booking.net_collected_cop, 0) = 0 and coalesce(v_booking.paid_gross_cop, 0) > 0 then
    v_booking.net_collected_cop := greatest(
      v_booking.paid_gross_cop - coalesce(v_booking.refund_cop, 0),
      0
    );
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
      payment_recorded_at = v_booking.payment_recorded_at,
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
      source_deleted_at = v_booking.source_deleted_at,
      cancellation_reason = v_booking.cancellation_reason,
      cancellation_reason_other = v_booking.cancellation_reason_other,
      cancellation_reason_pending = coalesce(v_booking.cancellation_reason_pending, false),
      financial_outcome = v_booking.financial_outcome,
      refund_cop = coalesce(v_booking.refund_cop, 0),
      credit_issued_cop = coalesce(v_booking.credit_issued_cop, 0),
      credit_applied_cop = coalesce(v_booking.credit_applied_cop, 0),
      paid_gross_cop = coalesce(v_booking.paid_gross_cop, v_booking.paid_cop, 0),
      net_collected_cop = coalesce(v_booking.net_collected_cop, 0)
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
      payment_recorded_at,
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
      source_deleted_at,
      cancellation_reason,
      cancellation_reason_other,
      cancellation_reason_pending,
      financial_outcome,
      refund_cop,
      credit_issued_cop,
      credit_applied_cop,
      paid_gross_cop,
      net_collected_cop
    )
    values (
      v_booking.service_id,
      v_booking.appointment_id,
      v_booking.source_revision,
      v_booking.source_hash,
      v_booking.source_created_at,
      v_booking.source_updated_at,
      v_booking.prepay_verified_at,
      v_booking.payment_recorded_at,
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
      v_booking.source_deleted_at,
      v_booking.cancellation_reason,
      v_booking.cancellation_reason_other,
      coalesce(v_booking.cancellation_reason_pending, false),
      v_booking.financial_outcome,
      coalesce(v_booking.refund_cop, 0),
      coalesce(v_booking.credit_issued_cop, 0),
      coalesce(v_booking.credit_applied_cop, 0),
      coalesce(v_booking.paid_gross_cop, v_booking.paid_cop, 0),
      coalesce(v_booking.net_collected_cop, 0)
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

grant execute on function public.apply_ops_booking_projection(jsonb, jsonb, jsonb, jsonb)
to service_role;

create or replace function app_private.refresh_ops_booking_fact(
  p_service_id text,
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_service_date date;
  v_payment_date date;
  v_crew_minutes integer;
  v_labor_cost bigint;
  v_no_entry boolean;
  v_billed bigint;
  v_collected bigint;
  v_gross bigint;
  v_refund bigint;
  v_credit_issued bigint;
  v_credit_applied bigint;
  v_overdue bigint;
  v_upcoming bigint;
  v_contribution bigint;
  v_cleaner record;
begin
  select *
  into v_booking
  from public.bookings
  where service_id = p_service_id
    and id = p_booking_id;

  if not found then
    delete from public.booking_facts
    where booking_id = p_booking_id;
    return;
  end if;

  if v_booking.scheduled_start is null then
    delete from public.booking_facts
    where booking_id = p_booking_id;
    return;
  end if;

  v_service_date :=
    (v_booking.scheduled_start at time zone 'America/Bogota')::date;
  v_payment_date := (
    coalesce(v_booking.prepay_verified_at, v_booking.payment_recorded_at)
      at time zone 'America/Bogota'
  )::date;

  select
    coalesce(sum(assigned_minutes), 0)::integer,
    coalesce(sum(estimated_marginal_cost_cop), 0)::bigint
  into v_crew_minutes, v_labor_cost
  from public.booking_crew
  where service_id = p_service_id
    and booking_id = p_booking_id;

  select exists (
    select 1
    from public.booking_events
    where service_id = p_service_id
      and booking_id = p_booking_id
      and event = 'no_pudo_ingresar'
  )
  into v_no_entry;

  v_billed := case
    when v_booking.status = 'COMPLETED'
      and v_booking.source_deleted_at is null
      then v_booking.total_cop
    else 0
  end;
  v_gross := coalesce(nullif(v_booking.paid_gross_cop, 0), v_booking.paid_cop, 0);
  v_refund := coalesce(v_booking.refund_cop, 0);
  v_credit_issued := coalesce(v_booking.credit_issued_cop, 0);
  v_credit_applied := coalesce(v_booking.credit_applied_cop, 0);
  v_collected := case
    when v_payment_date is not null then
      coalesce(
        nullif(v_booking.net_collected_cop, 0),
        greatest(v_gross - v_refund, 0)
      )
    else 0
  end;
  v_overdue := case
    when v_booking.status = 'COMPLETED'
      and v_booking.source_deleted_at is null
      then greatest(v_booking.pending_cop, 0)
    else 0
  end;
  v_upcoming := case
    when v_booking.status = 'CONFIRMED'
      and v_service_date > (now() at time zone 'America/Bogota')::date
      and v_booking.source_deleted_at is null
      then greatest(v_booking.pending_cop, 0)
    else 0
  end;
  v_contribution := v_billed - v_labor_cost;

  insert into public.booking_facts (
    booking_id,
    service_id,
    appointment_id,
    service_date,
    payment_date,
    status,
    fulfillment,
    sold_minutes,
    crew_minutes,
    total_cop,
    billed_cop,
    collected_cop,
    overdue_cop,
    upcoming_cop,
    addon_revenue_cop,
    cancellation_revenue_cop,
    estimated_labor_cost_cop,
    wompi_fee_cop,
    cac_cop,
    contribution_before_cac_cop,
    contribution_after_cac_cop,
    cash_margin_cop,
    capacity_consumed_unbilled,
    source_revision,
    calculated_at,
    paid_gross_cop,
    refund_cop,
    credit_issued_cop,
    credit_applied_cop,
    credit_liability_cop
  )
  values (
    v_booking.id,
    v_booking.service_id,
    v_booking.appointment_id,
    v_service_date,
    v_payment_date,
    v_booking.status,
    v_booking.fulfillment,
    v_booking.required_cleaner_minutes,
    v_crew_minutes,
    v_booking.total_cop,
    v_billed,
    v_collected,
    v_overdue,
    v_upcoming,
    v_booking.addon_total_cop,
    v_booking.cancellation_fee_cop,
    v_labor_cost,
    0,
    v_booking.cac_cop,
    v_contribution,
    v_contribution - v_booking.cac_cop,
    v_collected - v_labor_cost,
    v_no_entry,
    v_booking.source_revision,
    now(),
    v_gross,
    v_refund,
    v_credit_issued,
    v_credit_applied,
    greatest(v_credit_issued - v_credit_applied, 0)
  )
  on conflict (booking_id) do update
  set
    service_id = excluded.service_id,
    appointment_id = excluded.appointment_id,
    service_date = excluded.service_date,
    payment_date = excluded.payment_date,
    status = excluded.status,
    fulfillment = excluded.fulfillment,
    sold_minutes = excluded.sold_minutes,
    crew_minutes = excluded.crew_minutes,
    total_cop = excluded.total_cop,
    billed_cop = excluded.billed_cop,
    collected_cop = excluded.collected_cop,
    overdue_cop = excluded.overdue_cop,
    upcoming_cop = excluded.upcoming_cop,
    addon_revenue_cop = excluded.addon_revenue_cop,
    cancellation_revenue_cop = excluded.cancellation_revenue_cop,
    estimated_labor_cost_cop = excluded.estimated_labor_cost_cop,
    wompi_fee_cop = excluded.wompi_fee_cop,
    cac_cop = excluded.cac_cop,
    contribution_before_cac_cop = excluded.contribution_before_cac_cop,
    contribution_after_cac_cop = excluded.contribution_after_cac_cop,
    cash_margin_cop = excluded.cash_margin_cop,
    capacity_consumed_unbilled = excluded.capacity_consumed_unbilled,
    source_revision = excluded.source_revision,
    calculated_at = excluded.calculated_at,
    paid_gross_cop = excluded.paid_gross_cop,
    refund_cop = excluded.refund_cop,
    credit_issued_cop = excluded.credit_issued_cop,
    credit_applied_cop = excluded.credit_applied_cop,
    credit_liability_cop = excluded.credit_liability_cop;

  for v_cleaner in
    select distinct cleaner_id
    from public.booking_crew
    where service_id = p_service_id
      and booking_id = p_booking_id
  loop
    perform app_private.refresh_cleaner_day_fact(
      p_service_id,
      v_cleaner.cleaner_id,
      v_service_date
    );
  end loop;

  perform app_private.refresh_daily_ops_rollup(
    p_service_id,
    v_service_date
  );
  if v_payment_date is not null
    and v_payment_date is distinct from v_service_date
  then
    perform app_private.refresh_daily_ops_rollup(
      p_service_id,
      v_payment_date
    );
  end if;
end;
$$;

create or replace function app_private.refresh_daily_ops_rollup(
  p_service_id text,
  p_operational_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_payment record;
  v_capacity record;
begin
  select
    count(*)::integer as bookings_count,
    count(*) filter (where status = 'COMPLETED')::integer as completed_count,
    coalesce(sum(sold_minutes), 0)::integer as sold_minutes,
    coalesce(sum(billed_cop), 0)::bigint as billed_cop,
    coalesce(sum(overdue_cop), 0)::bigint as overdue_cop,
    coalesce(sum(upcoming_cop), 0)::bigint as upcoming_cop,
    coalesce(sum(contribution_before_cac_cop), 0)::bigint
      as contribution_before_cac_cop,
    coalesce(sum(contribution_after_cac_cop), 0)::bigint
      as contribution_after_cac_cop
  into v_booking
  from public.booking_facts
  where service_id = p_service_id
    and service_date = p_operational_date;

  select
    coalesce(sum(collected_cop), 0)::bigint as collected_cop,
    coalesce(sum(cash_margin_cop), 0)::bigint as cash_margin_cop,
    coalesce(sum(paid_gross_cop), 0)::bigint as paid_gross_cop,
    coalesce(sum(refund_cop), 0)::bigint as refund_cop,
    coalesce(sum(credit_issued_cop), 0)::bigint as credit_issued_cop,
    coalesce(sum(credit_applied_cop), 0)::bigint as credit_applied_cop,
    coalesce(sum(credit_liability_cop), 0)::bigint as credit_liability_cop
  into v_payment
  from public.booking_facts
  where service_id = p_service_id
    and payment_date = p_operational_date;

  select
    coalesce(sum(offered_minutes), 0)::integer as offered_minutes,
    coalesce(sum(accepted_minutes), 0)::integer as accepted_minutes,
    coalesce(sum(lost_minutes), 0)::integer as lost_minutes,
    coalesce(sum(recoverable_minutes), 0)::integer as recoverable_minutes
  into v_capacity
  from public.cleaner_day_facts
  where service_id = p_service_id
    and operational_date = p_operational_date;

  insert into public.daily_ops_rollup (
    service_id,
    operational_date,
    bookings_count,
    completed_count,
    sold_minutes,
    offered_minutes,
    accepted_minutes,
    lost_minutes,
    recoverable_minutes,
    billed_cop,
    collected_cop,
    overdue_cop,
    upcoming_cop,
    contribution_before_cac_cop,
    contribution_after_cac_cop,
    cash_margin_cop,
    utilization,
    calculated_at,
    paid_gross_cop,
    refund_cop,
    credit_issued_cop,
    credit_applied_cop,
    credit_liability_cop
  )
  values (
    p_service_id,
    p_operational_date,
    v_booking.bookings_count,
    v_booking.completed_count,
    v_booking.sold_minutes,
    v_capacity.offered_minutes,
    v_capacity.accepted_minutes,
    v_capacity.lost_minutes,
    v_capacity.recoverable_minutes,
    v_booking.billed_cop,
    v_payment.collected_cop,
    v_booking.overdue_cop,
    v_booking.upcoming_cop,
    v_booking.contribution_before_cac_cop,
    v_booking.contribution_after_cac_cop,
    v_payment.cash_margin_cop,
    case
      when v_capacity.accepted_minutes = 0 then null
      else v_booking.sold_minutes::numeric / v_capacity.accepted_minutes
    end,
    now(),
    v_payment.paid_gross_cop,
    v_payment.refund_cop,
    v_payment.credit_issued_cop,
    v_payment.credit_applied_cop,
    v_payment.credit_liability_cop
  )
  on conflict (service_id, operational_date) do update
  set
    bookings_count = excluded.bookings_count,
    completed_count = excluded.completed_count,
    sold_minutes = excluded.sold_minutes,
    offered_minutes = excluded.offered_minutes,
    accepted_minutes = excluded.accepted_minutes,
    lost_minutes = excluded.lost_minutes,
    recoverable_minutes = excluded.recoverable_minutes,
    billed_cop = excluded.billed_cop,
    collected_cop = excluded.collected_cop,
    overdue_cop = excluded.overdue_cop,
    upcoming_cop = excluded.upcoming_cop,
    contribution_before_cac_cop = excluded.contribution_before_cac_cop,
    contribution_after_cac_cop = excluded.contribution_after_cac_cop,
    cash_margin_cop = excluded.cash_margin_cop,
    utilization = excluded.utilization,
    calculated_at = excluded.calculated_at,
    paid_gross_cop = excluded.paid_gross_cop,
    refund_cop = excluded.refund_cop,
    credit_issued_cop = excluded.credit_issued_cop,
    credit_applied_cop = excluded.credit_applied_cop,
    credit_liability_cop = excluded.credit_liability_cop;
end;
$$;
