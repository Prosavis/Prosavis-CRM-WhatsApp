-- Soft-deleted bookings stay in public.bookings with source_deleted_at set.
-- booking_facts kept those rows, so daily_ops_rollup counted them as live
-- appointments (September completed 72 vs 65 active). Drop the fact and
-- ignore deleted rows in the day rollup and cleaner minutes.

create or replace function app_private.refresh_cleaner_day_fact(
  p_service_id text,
  p_cleaner_id text,
  p_operational_date date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offered integer;
  v_accepted integer;
  v_sold integer;
  v_remaining integer;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  select
    coalesce(max(offered_minutes), 0),
    coalesce(max(accepted_minutes), 0)
  into v_offered, v_accepted
  from public.cleaner_availability
  where service_id = p_service_id
    and cleaner_id = p_cleaner_id
    and operational_date = p_operational_date;

  select coalesce(sum(bc.assigned_minutes), 0)::integer
  into v_sold
  from public.booking_crew bc
  join public.booking_facts bf
    on bf.booking_id = bc.booking_id
   and bf.service_id = bc.service_id
  join public.bookings b
    on b.id = bf.booking_id
   and b.service_id = bf.service_id
  where bc.service_id = p_service_id
    and bc.cleaner_id = p_cleaner_id
    and bf.service_date = p_operational_date
    and b.source_deleted_at is null
    and (
      bf.status in ('CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED')
      or bf.capacity_consumed_unbilled
    );

  v_remaining := greatest(v_accepted - v_sold, 0);

  insert into public.cleaner_day_facts (
    service_id,
    cleaner_id,
    operational_date,
    offered_minutes,
    accepted_minutes,
    sold_minutes,
    lost_minutes,
    recoverable_minutes,
    orphan_minutes,
    equivalent_days,
    utilization,
    calculated_at
  )
  values (
    p_service_id,
    p_cleaner_id,
    p_operational_date,
    v_offered,
    v_accepted,
    v_sold,
    case when p_operational_date < v_today then v_remaining else 0 end,
    case when p_operational_date >= v_today then v_remaining else 0 end,
    case
      when p_operational_date >= v_today and v_remaining between 1 and 119
        then v_remaining
      else 0
    end,
    v_sold::numeric / 480,
    case when v_accepted = 0 then null else v_sold::numeric / v_accepted end,
    now()
  )
  on conflict (service_id, cleaner_id, operational_date) do update
  set
    offered_minutes = excluded.offered_minutes,
    accepted_minutes = excluded.accepted_minutes,
    sold_minutes = excluded.sold_minutes,
    lost_minutes = excluded.lost_minutes,
    recoverable_minutes = excluded.recoverable_minutes,
    orphan_minutes = excluded.orphan_minutes,
    equivalent_days = excluded.equivalent_days,
    utilization = excluded.utilization,
    calculated_at = excluded.calculated_at;

  perform app_private.refresh_daily_ops_rollup(
    p_service_id,
    p_operational_date
  );
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
    count(*) filter (where bf.status = 'COMPLETED')::integer as completed_count,
    coalesce(sum(bf.sold_minutes), 0)::integer as sold_minutes,
    coalesce(sum(bf.billed_cop), 0)::bigint as billed_cop,
    coalesce(sum(bf.overdue_cop), 0)::bigint as overdue_cop,
    coalesce(sum(bf.upcoming_cop), 0)::bigint as upcoming_cop,
    coalesce(sum(bf.contribution_before_cac_cop), 0)::bigint
      as contribution_before_cac_cop,
    coalesce(sum(bf.contribution_after_cac_cop), 0)::bigint
      as contribution_after_cac_cop
  into v_booking
  from public.booking_facts bf
  join public.bookings b
    on b.id = bf.booking_id
   and b.service_id = bf.service_id
  where bf.service_id = p_service_id
    and bf.service_date = p_operational_date
    and b.source_deleted_at is null;

  select
    coalesce(sum(bf.collected_cop), 0)::bigint as collected_cop,
    coalesce(sum(bf.cash_margin_cop), 0)::bigint as cash_margin_cop,
    coalesce(sum(bf.paid_gross_cop), 0)::bigint as paid_gross_cop,
    coalesce(sum(bf.refund_cop), 0)::bigint as refund_cop,
    coalesce(sum(bf.credit_issued_cop), 0)::bigint as credit_issued_cop,
    coalesce(sum(bf.credit_applied_cop), 0)::bigint as credit_applied_cop,
    coalesce(sum(bf.credit_liability_cop), 0)::bigint as credit_liability_cop
  into v_payment
  from public.booking_facts bf
  join public.bookings b
    on b.id = bf.booking_id
   and b.service_id = bf.service_id
  where bf.service_id = p_service_id
    and bf.payment_date = p_operational_date
    and b.source_deleted_at is null;

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

  if v_booking.source_deleted_at is not null then
    select
      bf.service_date,
      bf.payment_date
    into v_service_date, v_payment_date
    from public.booking_facts bf
    where bf.booking_id = p_booking_id;

    v_service_date := coalesce(
      (v_booking.scheduled_start at time zone 'America/Bogota')::date,
      v_service_date
    );
    v_payment_date := coalesce(
      (
        coalesce(v_booking.prepay_verified_at, v_booking.payment_recorded_at)
          at time zone 'America/Bogota'
      )::date,
      v_payment_date
    );

    delete from public.booking_facts
    where booking_id = p_booking_id;

    if v_service_date is not null then
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
    end if;

    if v_payment_date is not null
      and v_payment_date is distinct from v_service_date
    then
      perform app_private.refresh_daily_ops_rollup(
        p_service_id,
        v_payment_date
      );
    end if;

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

do $$
declare
  r record;
begin
  for r in
    select b.service_id, b.id
    from public.bookings b
    where b.source_deleted_at is not null
      and exists (
        select 1
        from public.booking_facts f
        where f.booking_id = b.id
      )
  loop
    perform app_private.refresh_ops_booking_fact(r.service_id, r.id);
  end loop;
end;
$$;
