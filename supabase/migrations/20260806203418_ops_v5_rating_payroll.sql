create table public.ops_v5_rating_payroll_config (
  service_id text primary key,
  bayesian_prior_mean numeric(8, 6),
  bayesian_prior_weight numeric(12, 6),
  rating_half_life_days numeric(12, 6),
  standard_day_minutes integer,
  minimum_day_fraction numeric(12, 6),
  day_rate_cop bigint,
  rounding_increment_cop bigint,
  requires_hire_date boolean,
  requires_labor_regime boolean,
  requires_alturas boolean,
  requires_arl_risk_class boolean,
  require_compliance_for_payroll_close boolean,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_v5_rating_payroll_prior_mean_check check (
    bayesian_prior_mean is null or bayesian_prior_mean between 1 and 5
  ),
  constraint ops_v5_rating_payroll_prior_weight_check check (
    bayesian_prior_weight is null or bayesian_prior_weight > 0
  ),
  constraint ops_v5_rating_payroll_half_life_check check (
    rating_half_life_days is null or rating_half_life_days > 0
  ),
  constraint ops_v5_rating_payroll_day_minutes_check check (
    standard_day_minutes is null or standard_day_minutes > 0
  ),
  constraint ops_v5_rating_payroll_minimum_day_check check (
    minimum_day_fraction is null
    or minimum_day_fraction > 0 and minimum_day_fraction <= 1
  ),
  constraint ops_v5_rating_payroll_day_rate_check check (
    day_rate_cop is null or day_rate_cop > 0
  ),
  constraint ops_v5_rating_payroll_rounding_check check (
    rounding_increment_cop is null or rounding_increment_cop > 0
  )
);

create or replace function app_private.validate_ops_v5_rating_payroll_config()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.is_active and (
    new.bayesian_prior_mean is null
    or new.bayesian_prior_weight is null
    or new.rating_half_life_days is null
    or new.standard_day_minutes is null
    or new.minimum_day_fraction is null
    or new.day_rate_cop is null
    or new.rounding_increment_cop is null
    or new.requires_hire_date is null
    or new.requires_labor_regime is null
    or new.requires_alturas is null
    or new.requires_arl_risk_class is null
    or new.require_compliance_for_payroll_close is null
  ) then
    raise exception 'rating/payroll config is incomplete';
  end if;
  return new;
end;
$$;

create trigger validate_ops_v5_rating_payroll_config
before insert or update on public.ops_v5_rating_payroll_config
for each row execute function app_private.validate_ops_v5_rating_payroll_config();

create trigger set_ops_v5_rating_payroll_config_updated_at
before update on public.ops_v5_rating_payroll_config
for each row execute function public.set_updated_at();

create table public.rating_events (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cleaner_id text not null,
  appointment_id text not null,
  source text not null,
  source_event_id text not null,
  rating integer not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint rating_events_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint rating_events_source_key
    unique (service_id, source, source_event_id),
  constraint rating_events_rating_check check (rating between 1 and 5),
  constraint rating_events_source_check check (
    source in ('firebase_team_member_review', 'manual_import')
  )
);

create index rating_events_cleaner_occurred_idx
  on public.rating_events (service_id, cleaner_id, occurred_at desc);
create index rating_events_appointment_idx
  on public.rating_events (service_id, appointment_id);

create table public.cleaner_scores (
  service_id text not null,
  cleaner_id text not null,
  score numeric(8, 6) not null,
  weighted_rating_sum numeric(24, 12) not null,
  effective_rating_weight numeric(24, 12) not null,
  raw_event_count integer not null,
  prior_mean numeric(8, 6) not null,
  prior_weight numeric(12, 6) not null,
  half_life_days numeric(12, 6) not null,
  scored_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (service_id, cleaner_id),
  constraint cleaner_scores_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint cleaner_scores_score_check check (score between 1 and 5),
  constraint cleaner_scores_weight_check check (
    effective_rating_weight >= 0 and raw_event_count >= 0
  )
);

create or replace function app_private.refresh_cleaner_score(
  p_service_id text,
  p_cleaner_id text,
  p_as_of timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.ops_v5_rating_payroll_config%rowtype;
  v_weighted_sum numeric;
  v_effective_weight numeric;
  v_event_count integer;
  v_score numeric;
begin
  select *
  into v_config
  from public.ops_v5_rating_payroll_config
  where service_id = p_service_id
    and is_active;

  if not found then
    raise exception 'active rating/payroll config required';
  end if;

  select
    coalesce(sum(
      rating * power(
        0.5::numeric,
        (
          extract(epoch from (p_as_of - occurred_at)) / 86400
        ) / v_config.rating_half_life_days
      )
    ), 0),
    coalesce(sum(
      power(
        0.5::numeric,
        (
          extract(epoch from (p_as_of - occurred_at)) / 86400
        ) / v_config.rating_half_life_days
      )
    ), 0),
    count(*)::integer
  into v_weighted_sum, v_effective_weight, v_event_count
  from public.rating_events
  where service_id = p_service_id
    and cleaner_id = p_cleaner_id
    and occurred_at <= p_as_of;

  v_score := (
    v_config.bayesian_prior_mean * v_config.bayesian_prior_weight
    + v_weighted_sum
  ) / (
    v_config.bayesian_prior_weight + v_effective_weight
  );

  insert into public.cleaner_scores (
    service_id,
    cleaner_id,
    score,
    weighted_rating_sum,
    effective_rating_weight,
    raw_event_count,
    prior_mean,
    prior_weight,
    half_life_days,
    scored_at,
    updated_at
  )
  values (
    p_service_id,
    p_cleaner_id,
    round(v_score, 6),
    v_weighted_sum,
    v_effective_weight,
    v_event_count,
    v_config.bayesian_prior_mean,
    v_config.bayesian_prior_weight,
    v_config.rating_half_life_days,
    p_as_of,
    now()
  )
  on conflict (service_id, cleaner_id) do update
  set
    score = excluded.score,
    weighted_rating_sum = excluded.weighted_rating_sum,
    effective_rating_weight = excluded.effective_rating_weight,
    raw_event_count = excluded.raw_event_count,
    prior_mean = excluded.prior_mean,
    prior_weight = excluded.prior_weight,
    half_life_days = excluded.half_life_days,
    scored_at = excluded.scored_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function app_private.refresh_cleaner_score_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app_private.refresh_cleaner_score(
    new.service_id,
    new.cleaner_id,
    greatest(now(), new.occurred_at)
  );
  return new;
end;
$$;

create trigger rating_events_refresh_cleaner_score
after insert on public.rating_events
for each row execute function app_private.refresh_cleaner_score_trigger();

create table public.cleaner_compliance_snapshots (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cleaner_id text not null,
  snapshot_date date not null,
  compliance_status text not null,
  missing_requirements text[] not null default '{}'::text[],
  hire_date date,
  labor_regime text,
  alturas_certified boolean,
  alturas_certification_expires_on date,
  arl_risk_class integer,
  operations_status text,
  requires_hire_date boolean not null,
  requires_labor_regime boolean not null,
  requires_alturas boolean not null,
  requires_arl_risk_class boolean not null,
  config_updated_at timestamptz not null,
  captured_at timestamptz not null default now(),
  constraint cleaner_compliance_snapshots_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint cleaner_compliance_snapshots_status_check check (
    compliance_status in ('compliant', 'non_compliant')
  )
);

create index cleaner_compliance_snapshot_lookup_idx
  on public.cleaner_compliance_snapshots (
    service_id,
    cleaner_id,
    snapshot_date desc,
    captured_at desc
  );

create table public.cleaner_monthly_payroll (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  cleaner_id text not null,
  period_month date not null,
  ledger_status text not null,
  worked_minutes integer not null,
  active_work_days integer not null,
  raw_day_units numeric(18, 6) not null,
  payable_day_units numeric(18, 6) not null,
  standard_day_minutes integer not null,
  minimum_day_fraction numeric(12, 6) not null,
  day_rate_cop bigint not null,
  rounding_increment_cop bigint not null,
  unrounded_payable_cop numeric(20, 2) not null,
  rounded_payable_cop bigint not null,
  rounding_slack_cop numeric(20, 2) not null,
  compliance_snapshot_id uuid,
  estimated_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaner_monthly_payroll_cleaner_fkey
    foreign key (service_id, cleaner_id)
    references public.crm_team_members (service_id, id),
  constraint cleaner_monthly_payroll_compliance_fkey
    foreign key (compliance_snapshot_id)
    references public.cleaner_compliance_snapshots (id),
  constraint cleaner_monthly_payroll_period_check check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint cleaner_monthly_payroll_status_check check (
    ledger_status in ('estimated', 'closed')
  ),
  constraint cleaner_monthly_payroll_nonnegative_check check (
    worked_minutes >= 0
    and active_work_days >= 0
    and raw_day_units >= 0
    and payable_day_units >= 0
    and rounded_payable_cop >= 0
  ),
  constraint cleaner_monthly_payroll_status_time_check check (
    (ledger_status = 'estimated' and closed_at is null)
    or (ledger_status = 'closed' and closed_at is not null)
  ),
  constraint cleaner_monthly_payroll_ledger_key unique (
    service_id,
    cleaner_id,
    period_month,
    ledger_status
  )
);

create index cleaner_monthly_payroll_period_idx
  on public.cleaner_monthly_payroll (service_id, period_month, ledger_status);

create or replace function app_private.reject_immutable_ops_v5_rows()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'rating_events' then
    raise exception 'rating events are immutable';
  end if;
  if tg_table_name = 'cleaner_compliance_snapshots' then
    raise exception 'compliance snapshots are immutable';
  end if;
  if old.ledger_status = 'closed' then
    raise exception 'closed payroll rows are immutable';
  end if;
  return old;
end;
$$;

create trigger rating_events_immutable
before update or delete on public.rating_events
for each row execute function app_private.reject_immutable_ops_v5_rows();

create trigger cleaner_compliance_snapshots_immutable
before update or delete on public.cleaner_compliance_snapshots
for each row execute function app_private.reject_immutable_ops_v5_rows();

create trigger cleaner_monthly_payroll_closed_immutable
before update or delete on public.cleaner_monthly_payroll
for each row
when (old.ledger_status = 'closed')
execute function app_private.reject_immutable_ops_v5_rows();

create trigger set_cleaner_monthly_payroll_updated_at
before update on public.cleaner_monthly_payroll
for each row execute function public.set_updated_at();

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
  v_applied boolean;
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
  on conflict (service_id, source, source_event_id) do nothing
  returning id into v_event_id;

  v_applied := v_event_id is not null;
  if not v_applied then
    select id
    into v_event_id
    from public.rating_events
    where service_id = v_service_id
      and source = v_source
      and source_event_id = v_source_event_id;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id,
    'applied', v_applied,
    'source_event_id', v_source_event_id
  );
end;
$$;

create or replace function public.refresh_cleaner_compliance_snapshot(
  p_service_id text,
  p_cleaner_id text,
  p_snapshot_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_config public.ops_v5_rating_payroll_config%rowtype;
  v_member public.crm_team_members%rowtype;
  v_missing text[] := '{}'::text[];
  v_snapshot_id uuid;
begin
  if p_snapshot_date is null then
    raise exception 'snapshot date is required';
  end if;

  select *
  into v_config
  from public.ops_v5_rating_payroll_config
  where service_id = p_service_id
    and is_active;
  if not found then
    raise exception 'active rating/payroll config required';
  end if;

  select *
  into v_member
  from public.crm_team_members
  where service_id = p_service_id
    and id = p_cleaner_id;
  if not found then
    raise exception 'cleaner not found';
  end if;

  if v_config.requires_hire_date and v_member.hire_date is null then
    v_missing := array_append(v_missing, 'hire_date');
  end if;
  if v_config.requires_labor_regime
    and nullif(btrim(v_member.labor_regime), '') is null
  then
    v_missing := array_append(v_missing, 'labor_regime');
  end if;
  if v_config.requires_alturas and (
    not v_member.alturas_certified
    or v_member.alturas_certification_expires_on is null
    or v_member.alturas_certification_expires_on < p_snapshot_date
  ) then
    v_missing := array_append(v_missing, 'alturas');
  end if;
  if v_config.requires_arl_risk_class and v_member.arl_risk_class is null then
    v_missing := array_append(v_missing, 'arl_risk_class');
  end if;

  insert into public.cleaner_compliance_snapshots (
    service_id,
    cleaner_id,
    snapshot_date,
    compliance_status,
    missing_requirements,
    hire_date,
    labor_regime,
    alturas_certified,
    alturas_certification_expires_on,
    arl_risk_class,
    operations_status,
    requires_hire_date,
    requires_labor_regime,
    requires_alturas,
    requires_arl_risk_class,
    config_updated_at
  )
  values (
    p_service_id,
    p_cleaner_id,
    p_snapshot_date,
    case when cardinality(v_missing) = 0
      then 'compliant'
      else 'non_compliant'
    end,
    v_missing,
    v_member.hire_date,
    v_member.labor_regime,
    v_member.alturas_certified,
    v_member.alturas_certification_expires_on,
    v_member.arl_risk_class,
    v_member.operations_status,
    v_config.requires_hire_date,
    v_config.requires_labor_regime,
    v_config.requires_alturas,
    v_config.requires_arl_risk_class,
    v_config.updated_at
  )
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

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
      and ledger_status = 'closed';
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
      and snapshot_date <= v_period_end
      and compliance_status = 'compliant'
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

alter table public.ops_v5_rating_payroll_config enable row level security;
alter table public.rating_events enable row level security;
alter table public.cleaner_scores enable row level security;
alter table public.cleaner_compliance_snapshots enable row level security;
alter table public.cleaner_monthly_payroll enable row level security;

create policy ops_v5_rating_payroll_config_admin_all
  on public.ops_v5_rating_payroll_config
  for all to authenticated
  using ((select app_private.is_crm_admin()))
  with check ((select app_private.is_crm_admin()));
create policy rating_events_admin_select
  on public.rating_events
  for select to authenticated
  using ((select app_private.is_crm_admin()));
create policy cleaner_scores_admin_select
  on public.cleaner_scores
  for select to authenticated
  using ((select app_private.is_crm_admin()));
create policy cleaner_compliance_snapshots_admin_select
  on public.cleaner_compliance_snapshots
  for select to authenticated
  using ((select app_private.is_crm_admin()));
create policy cleaner_monthly_payroll_admin_select
  on public.cleaner_monthly_payroll
  for select to authenticated
  using ((select app_private.is_crm_admin()));

revoke all on table
  public.ops_v5_rating_payroll_config,
  public.rating_events,
  public.cleaner_scores,
  public.cleaner_compliance_snapshots,
  public.cleaner_monthly_payroll
from public, anon;

grant select, insert, update, delete
  on public.ops_v5_rating_payroll_config
  to authenticated;
grant select
  on public.rating_events,
  public.cleaner_scores,
  public.cleaner_compliance_snapshots,
  public.cleaner_monthly_payroll
  to authenticated;
grant select, insert
  on public.rating_events,
  public.cleaner_compliance_snapshots
  to service_role;
grant select, insert, update
  on public.cleaner_scores,
  public.cleaner_monthly_payroll
  to service_role;
grant select
  on public.ops_v5_rating_payroll_config
  to service_role;

revoke all on function app_private.validate_ops_v5_rating_payroll_config()
from public, anon, authenticated;
revoke all on function app_private.refresh_cleaner_score(text, text, timestamptz)
from public, anon, authenticated;
revoke all on function app_private.refresh_cleaner_score_trigger()
from public, anon, authenticated;
revoke all on function app_private.reject_immutable_ops_v5_rows()
from public, anon, authenticated;

grant execute on function app_private.refresh_cleaner_score(
  text,
  text,
  timestamptz
) to service_role;

revoke all on function public.apply_ops_rating_event(jsonb)
from public, anon, authenticated;
revoke all on function public.refresh_cleaner_compliance_snapshot(
  text,
  text,
  date
) from public, anon, authenticated;
revoke all on function public.refresh_cleaner_monthly_payroll(
  text,
  text,
  date,
  text
) from public, anon, authenticated;

grant execute on function public.apply_ops_rating_event(jsonb)
to service_role;
grant execute on function public.refresh_cleaner_compliance_snapshot(
  text,
  text,
  date
) to service_role;
grant execute on function public.refresh_cleaner_monthly_payroll(
  text,
  text,
  date,
  text
) to service_role;
