create table public.booking_facts (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  service_id text not null,
  appointment_id text not null,
  service_date date not null,
  payment_date date,
  status text not null,
  fulfillment text not null,
  sold_minutes integer not null default 0,
  crew_minutes integer not null default 0,
  total_cop bigint not null default 0,
  billed_cop bigint not null default 0,
  collected_cop bigint not null default 0,
  overdue_cop bigint not null default 0,
  upcoming_cop bigint not null default 0,
  addon_revenue_cop bigint not null default 0,
  cancellation_revenue_cop bigint not null default 0,
  estimated_labor_cost_cop bigint not null default 0,
  wompi_fee_cop bigint not null default 0,
  cac_cop bigint not null default 0,
  contribution_before_cac_cop bigint not null default 0,
  contribution_after_cac_cop bigint not null default 0,
  cash_margin_cop bigint not null default 0,
  capacity_consumed_unbilled boolean not null default false,
  source_revision bigint not null default 0,
  calculated_at timestamptz not null default now(),
  constraint booking_facts_service_appointment_key
    unique (service_id, appointment_id),
  constraint booking_facts_minutes_check
    check (sold_minutes >= 0 and crew_minutes >= 0),
  constraint booking_facts_money_check check (
    total_cop >= 0
    and billed_cop >= 0
    and collected_cop >= 0
    and overdue_cop >= 0
    and upcoming_cop >= 0
    and addon_revenue_cop >= 0
    and cancellation_revenue_cop >= 0
    and estimated_labor_cost_cop >= 0
    and wompi_fee_cop >= 0
    and cac_cop >= 0
  )
);

create table public.cleaner_day_facts (
  service_id text not null,
  cleaner_id text not null,
  operational_date date not null,
  offered_minutes integer not null default 0,
  accepted_minutes integer not null default 0,
  sold_minutes integer not null default 0,
  lost_minutes integer not null default 0,
  recoverable_minutes integer not null default 0,
  orphan_minutes integer not null default 0,
  equivalent_days numeric(12, 4) not null default 0,
  utilization numeric(12, 6),
  calculated_at timestamptz not null default now(),
  primary key (service_id, cleaner_id, operational_date),
  constraint cleaner_day_facts_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint cleaner_day_facts_minutes_check check (
    offered_minutes >= 0
    and accepted_minutes >= 0
    and sold_minutes >= 0
    and lost_minutes >= 0
    and recoverable_minutes >= 0
    and orphan_minutes >= 0
  ),
  constraint cleaner_day_facts_utilization_check
    check (utilization is null or utilization >= 0)
);

create table public.daily_ops_rollup (
  service_id text not null,
  operational_date date not null,
  bookings_count integer not null default 0,
  completed_count integer not null default 0,
  sold_minutes integer not null default 0,
  offered_minutes integer not null default 0,
  accepted_minutes integer not null default 0,
  lost_minutes integer not null default 0,
  recoverable_minutes integer not null default 0,
  billed_cop bigint not null default 0,
  collected_cop bigint not null default 0,
  overdue_cop bigint not null default 0,
  upcoming_cop bigint not null default 0,
  contribution_before_cac_cop bigint not null default 0,
  contribution_after_cac_cop bigint not null default 0,
  cash_margin_cop bigint not null default 0,
  utilization numeric(12, 6),
  calculated_at timestamptz not null default now(),
  primary key (service_id, operational_date),
  constraint daily_ops_rollup_nonnegative_check check (
    bookings_count >= 0
    and completed_count >= 0
    and sold_minutes >= 0
    and offered_minutes >= 0
    and accepted_minutes >= 0
    and lost_minutes >= 0
    and recoverable_minutes >= 0
    and billed_cop >= 0
    and collected_cop >= 0
    and overdue_cop >= 0
    and upcoming_cop >= 0
  )
);

create index booking_facts_service_date_idx
  on public.booking_facts (service_id, service_date);
create index booking_facts_service_payment_date_idx
  on public.booking_facts (service_id, payment_date)
  where payment_date is not null;
create index booking_facts_service_status_idx
  on public.booking_facts (service_id, status, service_date);
create index cleaner_day_facts_service_date_idx
  on public.cleaner_day_facts (service_id, operational_date);

alter table public.booking_facts enable row level security;
alter table public.cleaner_day_facts enable row level security;
alter table public.daily_ops_rollup enable row level security;

create policy booking_facts_admin_all
  on public.booking_facts
  for all
  to authenticated
  using (app_private.is_crm_admin())
  with check (app_private.is_crm_admin());

create policy cleaner_day_facts_admin_all
  on public.cleaner_day_facts
  for all
  to authenticated
  using (app_private.is_crm_admin())
  with check (app_private.is_crm_admin());

create policy daily_ops_rollup_admin_all
  on public.daily_ops_rollup
  for all
  to authenticated
  using (app_private.is_crm_admin())
  with check (app_private.is_crm_admin());

grant select on public.booking_facts to authenticated;
grant select on public.cleaner_day_facts to authenticated;
grant select on public.daily_ops_rollup to authenticated;
grant select, insert, update, delete on public.booking_facts to service_role;
grant select, insert, update, delete on public.cleaner_day_facts to service_role;
grant select, insert, update, delete on public.daily_ops_rollup to service_role;

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
    coalesce(sum(cash_margin_cop), 0)::bigint as cash_margin_cop
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
    calculated_at
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
    now()
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
    calculated_at = excluded.calculated_at;
end;
$$;

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
  where bc.service_id = p_service_id
    and bc.cleaner_id = p_cleaner_id
    and bf.service_date = p_operational_date
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
  v_collected := case
    when v_payment_date is not null then least(v_booking.paid_cop, v_booking.total_cop)
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
    calculated_at
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
    now()
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
    calculated_at = excluded.calculated_at;

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

create or replace function app_private.refresh_ops_facts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operational_date date;
  v_cleaner record;
begin
  if tg_table_name = 'bookings' then
    if tg_op = 'DELETE' then
      delete from public.booking_facts where booking_id = old.id;
      perform app_private.refresh_daily_ops_rollup(
        old.service_id,
        (old.scheduled_start at time zone 'America/Bogota')::date
      );
      if coalesce(old.prepay_verified_at, old.payment_recorded_at) is not null
      then
        perform app_private.refresh_daily_ops_rollup(
          old.service_id,
          (
            coalesce(old.prepay_verified_at, old.payment_recorded_at)
              at time zone 'America/Bogota'
          )::date
        );
      end if;
      return old;
    end if;

    perform app_private.refresh_ops_booking_fact(
      new.service_id,
      new.id
    );

    if tg_op = 'UPDATE'
      and old.scheduled_start is distinct from new.scheduled_start
      and old.scheduled_start is not null
    then
      v_operational_date :=
        (old.scheduled_start at time zone 'America/Bogota')::date;
      for v_cleaner in
        select distinct cleaner_id
        from public.booking_crew
        where service_id = old.service_id
          and booking_id = old.id
      loop
        perform app_private.refresh_cleaner_day_fact(
          old.service_id,
          v_cleaner.cleaner_id,
          v_operational_date
        );
      end loop;
      perform app_private.refresh_daily_ops_rollup(
        old.service_id,
        v_operational_date
      );
    end if;

    if tg_op = 'UPDATE'
      and coalesce(old.prepay_verified_at, old.payment_recorded_at) is not null
    then
      perform app_private.refresh_daily_ops_rollup(
        old.service_id,
        (
          coalesce(old.prepay_verified_at, old.payment_recorded_at)
            at time zone 'America/Bogota'
        )::date
      );
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform app_private.refresh_ops_booking_fact(
      old.service_id,
      old.booking_id
    );
    if tg_table_name = 'booking_crew' then
      select service_date
      into v_operational_date
      from public.booking_facts
      where booking_id = old.booking_id;
      if v_operational_date is not null then
        perform app_private.refresh_cleaner_day_fact(
          old.service_id,
          old.cleaner_id,
          v_operational_date
        );
      end if;
    end if;
    return old;
  end if;

  perform app_private.refresh_ops_booking_fact(new.service_id, new.booking_id);
  if tg_table_name = 'booking_crew'
    and tg_op = 'UPDATE'
    and old.cleaner_id is distinct from new.cleaner_id
  then
    select service_date
    into v_operational_date
    from public.booking_facts
    where booking_id = new.booking_id;
    if v_operational_date is not null then
      perform app_private.refresh_cleaner_day_fact(
        old.service_id,
        old.cleaner_id,
        v_operational_date
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_refresh_ops_facts
after insert or update or delete on public.bookings
for each row execute function app_private.refresh_ops_facts_trigger();

create trigger booking_crew_refresh_ops_facts
after insert or update or delete on public.booking_crew
for each row execute function app_private.refresh_ops_facts_trigger();

create trigger booking_events_refresh_ops_facts
after insert or update or delete on public.booking_events
for each row execute function app_private.refresh_ops_facts_trigger();

create or replace function app_private.refresh_cleaner_availability_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform app_private.refresh_cleaner_day_fact(
      old.service_id,
      old.cleaner_id,
      old.operational_date
    );
    return old;
  end if;

  perform app_private.refresh_cleaner_day_fact(
    new.service_id,
    new.cleaner_id,
    new.operational_date
  );
  return new;
end;
$$;

create trigger cleaner_availability_refresh_ops_facts
after insert or update or delete on public.cleaner_availability
for each row execute function app_private.refresh_cleaner_availability_trigger();

revoke all on function app_private.refresh_daily_ops_rollup(text, date)
from public, anon, authenticated;
revoke all on function app_private.refresh_cleaner_day_fact(text, text, date)
from public, anon, authenticated;
revoke all on function app_private.refresh_ops_booking_fact(text, uuid)
from public, anon, authenticated;
revoke all on function app_private.refresh_ops_facts_trigger()
from public, anon, authenticated;
revoke all on function app_private.refresh_cleaner_availability_trigger()
from public, anon, authenticated;

grant execute on function app_private.refresh_daily_ops_rollup(text, date)
to service_role;
grant execute on function app_private.refresh_cleaner_day_fact(text, text, date)
to service_role;
grant execute on function app_private.refresh_ops_booking_fact(text, uuid)
to service_role;

create or replace function public.reconcile_ops_facts(
  p_service_id text,
  p_from_date date default (
    (now() at time zone 'America/Bogota')::date - 7
  ),
  p_to_date date default (now() at time zone 'America/Bogota')::date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_availability record;
  v_booking_count integer := 0;
  v_day_count integer := 0;
begin
  if p_from_date > p_to_date then
    raise exception 'p_from_date must not exceed p_to_date';
  end if;

  for v_booking in
    select id
    from public.bookings
    where service_id = p_service_id
      and (scheduled_start at time zone 'America/Bogota')::date
        between p_from_date and p_to_date
  loop
    perform app_private.refresh_ops_booking_fact(
      p_service_id,
      v_booking.id
    );
    v_booking_count := v_booking_count + 1;
  end loop;

  for v_availability in
    select cleaner_id, operational_date
    from public.cleaner_availability
    where service_id = p_service_id
      and operational_date between p_from_date and p_to_date
  loop
    perform app_private.refresh_cleaner_day_fact(
      p_service_id,
      v_availability.cleaner_id,
      v_availability.operational_date
    );
    v_day_count := v_day_count + 1;
  end loop;

  return jsonb_build_object(
    'service_id', p_service_id,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'bookings_refreshed', v_booking_count,
    'cleaner_days_refreshed', v_day_count
  );
end;
$$;

revoke all on function public.reconcile_ops_facts(text, date, date)
from public, anon, authenticated;
grant execute on function public.reconcile_ops_facts(text, date, date)
to service_role;
