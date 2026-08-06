-- V5 review fixes (surgical): recovery occupancy, rating conflicts,
-- payroll close safety, and directory isolation for visits.

-- 1) Recovery occupancy must include pending bookings.
create or replace function app_private.refresh_orphan_stacking_candidates(
  p_service_id text,
  p_operational_date date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  delete from public.orphan_stacking_candidates
  where service_id = p_service_id
    and operational_date = p_operational_date
    and source = 'recovery_job'
    and status in ('open', 'expired');

  with accepted_windows as (
    select
      availability.service_id,
      availability.cleaner_id,
      availability.operational_date,
      availability.window_start,
      availability.window_end
    from public.cleaner_availability as availability
    where availability.service_id = p_service_id
      and availability.operational_date = p_operational_date
      and availability.accepted_minutes > 0
      and availability.window_start is not null
      and availability.window_end is not null
  ),
  windows_with_occupancy as (
    select
      accepted.*,
      coalesce(
        occupied.ranges,
        '{}'::tstzmultirange
      ) as occupied_ranges
    from accepted_windows as accepted
    left join lateral (
      select range_agg(
        tstzrange(
          greatest(
            accepted.window_start,
            coalesce(crew.scheduled_start, booking.scheduled_start)
          ),
          least(
            accepted.window_end,
            coalesce(crew.scheduled_end, booking.scheduled_end)
          ),
          '[)'
        )
      ) as ranges
      from public.booking_crew as crew
      join public.bookings as booking
        on booking.service_id = crew.service_id
       and booking.id = crew.booking_id
      where crew.service_id = accepted.service_id
        and crew.cleaner_id = accepted.cleaner_id
        and booking.source_deleted_at is null
        and booking.status in (
          'PENDING',
          'PENDING_RESCHEDULE',
          'CONFIRMED',
          'EN_ROUTE',
          'IN_PROGRESS',
          'COMPLETED'
        )
        and coalesce(crew.scheduled_start, booking.scheduled_start) is not null
        and coalesce(crew.scheduled_end, booking.scheduled_end) is not null
        and tstzrange(
          coalesce(crew.scheduled_start, booking.scheduled_start),
          coalesce(crew.scheduled_end, booking.scheduled_end),
          '[)'
        ) && tstzrange(
          accepted.window_start,
          accepted.window_end,
          '[)'
        )
    ) as occupied on true
  ),
  free_ranges as (
    select
      windows.service_id,
      windows.cleaner_id,
      windows.operational_date,
      unnest(
        tstzmultirange(
          tstzrange(windows.window_start, windows.window_end, '[)')
        ) - windows.occupied_ranges
      ) as free_range
    from windows_with_occupancy as windows
  ),
  valid_candidates as (
    select
      free.service_id,
      free.cleaner_id,
      free.operational_date,
      lower(free.free_range) as window_start,
      upper(free.free_range) as window_end,
      floor(
        extract(epoch from upper(free.free_range) - lower(free.free_range)) /
        60
      )::integer as available_minutes
    from free_ranges as free
    where extract(
      epoch from upper(free.free_range) - lower(free.free_range)
    ) >= 30 * 60
  )
  insert into public.orphan_stacking_candidates (
    service_id,
    cleaner_id,
    operational_date,
    window_start,
    window_end,
    available_minutes,
    status,
    source,
    single_price_cop,
    pair_price_cop,
    estimated_marginal_cost_cop,
    flags,
    computed_at
  )
  select
    candidate.service_id,
    candidate.cleaner_id,
    candidate.operational_date,
    candidate.window_start,
    candidate.window_end,
    candidate.available_minutes,
    'open',
    'recovery_job',
    null,
    null,
    null,
    array['unknown_price', 'unknown_cost']::text[],
    now()
  from valid_candidates as candidate
  on conflict (
    service_id,
    cleaner_id,
    operational_date,
    window_start,
    window_end
  ) do update
  set
    available_minutes = excluded.available_minutes,
    computed_at = excluded.computed_at,
    flags = excluded.flags;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- 2) Conflicting rating payloads for the same source_event_id must fail.
create or replace function public.apply_ops_rating_event(p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_service_id text := nullif(btrim(p_event ->> 'service_id'), '');
  v_cleaner_id text := nullif(btrim(p_event ->> 'cleaner_id'), '');
  v_appointment_id text := nullif(btrim(p_event ->> 'appointment_id'), '');
  v_source text := nullif(btrim(p_event ->> 'source'), '');
  v_source_event_id text := nullif(btrim(p_event ->> 'source_event_id'), '');
  v_rating integer;
  v_occurred_at timestamptz;
  v_event_id uuid;
  v_existing public.rating_events%rowtype;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'p_event must be an object';
  end if;

  begin
    v_rating := (p_event ->> 'rating')::integer;
    v_occurred_at := (p_event ->> 'occurred_at')::timestamptz;
  exception when others then
    raise exception 'invalid rating event';
  end;

  if v_service_id is null
    or v_cleaner_id is null
    or v_appointment_id is null
    or v_source is null
    or v_source_event_id is null
    or v_rating not between 1 and 5
    or v_occurred_at is null
  then
    raise exception 'invalid rating event';
  end if;

  select *
  into v_existing
  from public.rating_events
  where service_id = v_service_id
    and source = v_source
    and source_event_id = v_source_event_id
  for update;

  if found then
    if v_existing.cleaner_id <> v_cleaner_id
      or v_existing.appointment_id <> v_appointment_id
      or v_existing.rating <> v_rating
    then
      raise exception 'rating source_event_id conflict';
    end if;

    return jsonb_build_object(
      'event_id', v_existing.id,
      'applied', false,
      'source_event_id', v_source_event_id
    );
  end if;

  insert into public.rating_events (
    service_id,
    cleaner_id,
    appointment_id,
    source,
    source_event_id,
    rating,
    occurred_at
  )
  values (
    v_service_id,
    v_cleaner_id,
    v_appointment_id,
    v_source,
    v_source_event_id,
    v_rating,
    v_occurred_at
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'applied', true,
    'source_event_id', v_source_event_id
  );
end;
$$;

-- 3) Payroll close: period/config-scoped compliance + never applied without id.
create or replace function public.refresh_cleaner_monthly_payroll(
  p_service_id text,
  p_cleaner_id text,
  p_period_month date,
  p_ledger_status text default 'estimated'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_period_month date := date_trunc('month', p_period_month)::date;
  v_period_end date := (v_period_month + interval '1 month - 1 day')::date;
  v_config public.ops_v5_rating_payroll_config%rowtype;
  v_worked_minutes integer;
  v_active_days integer;
  v_raw_days numeric;
  v_payable_days numeric;
  v_unrounded numeric;
  v_rounded bigint;
  v_slack numeric;
  v_compliance_snapshot_id uuid;
  v_payroll_id uuid;
  v_existing public.cleaner_monthly_payroll%rowtype;
begin
  if p_period_month is null
    or p_ledger_status not in ('estimated', 'closed')
  then
    raise exception 'invalid payroll period or status';
  end if;

  select *
  into v_config
  from public.ops_v5_rating_payroll_config
  where service_id = p_service_id
    and is_active;
  if not found then
    raise exception 'active rating/payroll config required';
  end if;

  if p_ledger_status = 'closed' then
    select *
    into v_existing
    from public.cleaner_monthly_payroll
    where service_id = p_service_id
      and cleaner_id = p_cleaner_id
      and period_month = v_period_month
      and ledger_status = 'closed'
    for update;
    if found then
      return jsonb_build_object(
        'payroll_id', v_existing.id,
        'ledger_status', v_existing.ledger_status,
        'payable_day_units', v_existing.payable_day_units,
        'rounded_payable_cop', v_existing.rounded_payable_cop,
        'rounding_slack_cop', v_existing.rounding_slack_cop,
        'applied', false
      );
    end if;

    select id
    into v_compliance_snapshot_id
    from public.cleaner_compliance_snapshots
    where service_id = p_service_id
      and cleaner_id = p_cleaner_id
      and snapshot_date between v_period_month and v_period_end
      and compliance_status = 'compliant'
      and (
        config_updated_at is null
        or config_updated_at = v_config.updated_at
      )
    order by snapshot_date desc, captured_at desc
    limit 1;

    if v_config.require_compliance_for_payroll_close
      and v_compliance_snapshot_id is null
    then
      raise exception 'compliant snapshot required before payroll close';
    end if;
  end if;

  select
    coalesce(sum(sold_minutes), 0)::integer,
    count(*)::integer,
    coalesce(sum(
      sold_minutes::numeric / v_config.standard_day_minutes
    ), 0),
    coalesce(sum(greatest(
      sold_minutes::numeric / v_config.standard_day_minutes,
      v_config.minimum_day_fraction
    )), 0)
  into
    v_worked_minutes,
    v_active_days,
    v_raw_days,
    v_payable_days
  from public.cleaner_day_facts
  where service_id = p_service_id
    and cleaner_id = p_cleaner_id
    and operational_date between v_period_month and v_period_end
    and sold_minutes > 0;

  v_unrounded := round(v_payable_days * v_config.day_rate_cop, 2);
  v_rounded := (
    round(v_unrounded / v_config.rounding_increment_cop)
      * v_config.rounding_increment_cop
  )::bigint;
  v_slack := round(v_rounded - v_unrounded, 2);

  insert into public.cleaner_monthly_payroll (
    service_id,
    cleaner_id,
    period_month,
    ledger_status,
    worked_minutes,
    active_work_days,
    raw_day_units,
    payable_day_units,
    standard_day_minutes,
    minimum_day_fraction,
    day_rate_cop,
    rounding_increment_cop,
    unrounded_payable_cop,
    rounded_payable_cop,
    rounding_slack_cop,
    compliance_snapshot_id,
    estimated_at,
    closed_at
  )
  values (
    p_service_id,
    p_cleaner_id,
    v_period_month,
    p_ledger_status,
    v_worked_minutes,
    v_active_days,
    round(v_raw_days, 6),
    round(v_payable_days, 6),
    v_config.standard_day_minutes,
    v_config.minimum_day_fraction,
    v_config.day_rate_cop,
    v_config.rounding_increment_cop,
    v_unrounded,
    v_rounded,
    v_slack,
    v_compliance_snapshot_id,
    now(),
    case when p_ledger_status = 'closed' then now() else null end
  )
  on conflict (service_id, cleaner_id, period_month, ledger_status)
  do update
  set
    worked_minutes = excluded.worked_minutes,
    active_work_days = excluded.active_work_days,
    raw_day_units = excluded.raw_day_units,
    payable_day_units = excluded.payable_day_units,
    standard_day_minutes = excluded.standard_day_minutes,
    minimum_day_fraction = excluded.minimum_day_fraction,
    day_rate_cop = excluded.day_rate_cop,
    rounding_increment_cop = excluded.rounding_increment_cop,
    unrounded_payable_cop = excluded.unrounded_payable_cop,
    rounded_payable_cop = excluded.rounded_payable_cop,
    rounding_slack_cop = excluded.rounding_slack_cop,
    compliance_snapshot_id = excluded.compliance_snapshot_id,
    estimated_at = excluded.estimated_at,
    updated_at = now()
  where cleaner_monthly_payroll.ledger_status = 'estimated'
  returning id into v_payroll_id;

  if v_payroll_id is null then
    select id
    into v_payroll_id
    from public.cleaner_monthly_payroll
    where service_id = p_service_id
      and cleaner_id = p_cleaner_id
      and period_month = v_period_month
      and ledger_status = p_ledger_status;

    return jsonb_build_object(
      'payroll_id', v_payroll_id,
      'ledger_status', p_ledger_status,
      'worked_minutes', v_worked_minutes,
      'active_work_days', v_active_days,
      'raw_day_units', round(v_raw_days, 6),
      'payable_day_units', round(v_payable_days, 6),
      'unrounded_payable_cop', v_unrounded,
      'rounded_payable_cop', v_rounded,
      'rounding_slack_cop', v_slack,
      'applied', false
    );
  end if;

  return jsonb_build_object(
    'payroll_id', v_payroll_id,
    'ledger_status', p_ledger_status,
    'worked_minutes', v_worked_minutes,
    'active_work_days', v_active_days,
    'raw_day_units', round(v_raw_days, 6),
    'payable_day_units', round(v_payable_days, 6),
    'unrounded_payable_cop', v_unrounded,
    'rounded_payable_cop', v_rounded,
    'rounding_slack_cop', v_slack,
    'applied', true
  );
end;
$$;

-- 4) Directory isolation for visits domain when crm_directory.service_id exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_directory'
      and column_name = 'service_id'
  ) then
    execute $sql$
      create unique index if not exists crm_directory_service_id_id_key
      on public.crm_directory (service_id, id)
    $sql$;

    begin
      alter table public.client_visits
        drop constraint if exists client_visits_directory_id_fkey;
      alter table public.client_visits
        add constraint client_visits_directory_service_fkey
        foreign key (service_id, directory_id)
        references public.crm_directory (service_id, id)
        on delete set null;
    exception when others then
      raise notice 'client_visits directory FK skipped: %', sqlerrm;
    end;

    begin
      alter table public.quejas
        drop constraint if exists quejas_directory_id_fkey;
      alter table public.quejas
        add constraint quejas_directory_service_fkey
        foreign key (service_id, directory_id)
        references public.crm_directory (service_id, id)
        on delete set null;
    exception when others then
      raise notice 'quejas directory FK skipped: %', sqlerrm;
    end;

    begin
      alter table public.referrals
        drop constraint if exists referrals_directory_id_fkey;
      alter table public.referrals
        add constraint referrals_directory_service_fkey
        foreign key (service_id, directory_id)
        references public.crm_directory (service_id, id)
        on delete set null;
    exception when others then
      raise notice 'referrals directory FK skipped: %', sqlerrm;
    end;

    begin
      alter table public.opportunities
        drop constraint if exists opportunities_directory_id_fkey;
      alter table public.opportunities
        add constraint opportunities_directory_service_fkey
        foreign key (service_id, directory_id)
        references public.crm_directory (service_id, id)
        on delete set null;
    exception when others then
      raise notice 'opportunities directory FK skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
