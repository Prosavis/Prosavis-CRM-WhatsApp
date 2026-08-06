-- V5 Phase 3: operational jobs, decision outcomes and guarded automation.
-- Commercial thresholds intentionally default to NULL and block activation.

create table public.ops_decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  decision_id text not null,
  decision_type text not null,
  outcome text not null,
  override_reason text,
  decided_by text not null,
  decided_by_kind text not null default 'system',
  outcome_metrics jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  outcome_observed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ops_decision_outcomes_service_decision_key
    unique (service_id, decision_id),
  constraint ops_decision_outcomes_type_check check (
    decision_type in (
      'assignment',
      'capacity',
      'forecast',
      'hiring',
      'automation'
    )
  ),
  constraint ops_decision_outcomes_outcome_check check (
    outcome in ('accepted', 'overridden', 'rejected', 'expired')
  ),
  constraint ops_decision_outcomes_override_reason_check check (
    (outcome = 'overridden' and nullif(btrim(override_reason), '') is not null)
    or (outcome <> 'overridden' and override_reason is null)
  ),
  constraint ops_decision_outcomes_actor_kind_check check (
    decided_by_kind in ('firebase', 'supabase', 'system')
  ),
  constraint ops_decision_outcomes_metrics_object_check check (
    jsonb_typeof(outcome_metrics) = 'object'
  )
);

create table public.ops_backfill_queue (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  job_type text not null,
  target_key text not null,
  target_date date,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lock_owner text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_backfill_queue_job_type_check check (
    job_type in (
      'decision_outcomes',
      'daily_rollup',
      'monthly_close',
      'forecast',
      'hiring_evaluation',
      'weekly_digest'
    )
  ),
  constraint ops_backfill_queue_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  constraint ops_backfill_queue_attempts_check check (
    attempts >= 0 and max_attempts between 1 and 100
  ),
  constraint ops_backfill_queue_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint ops_backfill_queue_lease_check check (
    (
      status = 'running'
      and lock_owner is not null
      and locked_at is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'running'
      and lock_owner is null
      and locked_at is null
      and lease_expires_at is null
    )
  )
);

create unique index ops_backfill_queue_active_target_idx
  on public.ops_backfill_queue (service_id, job_type, target_key)
  where status in ('queued', 'running');
create index ops_backfill_queue_claim_idx
  on public.ops_backfill_queue (available_at, created_at)
  where status = 'queued';
create index ops_backfill_queue_stale_lease_idx
  on public.ops_backfill_queue (lease_expires_at)
  where status = 'running';

create table public.ops_monthly_closes (
  service_id text not null,
  month_start date not null,
  status text not null default 'pending',
  totals jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, month_start),
  constraint ops_monthly_closes_first_day_check check (
    month_start = date_trunc('month', month_start)::date
  ),
  constraint ops_monthly_closes_status_check check (
    status in ('pending', 'running', 'closed', 'reopened', 'failed')
  ),
  constraint ops_monthly_closes_totals_object_check check (
    jsonb_typeof(totals) = 'object'
  )
);

create table public.ops_forecasts (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  forecast_date date not null,
  horizon_days integer not null,
  required_minutes integer not null,
  available_minutes integer not null,
  shortfall_minutes integer not null,
  confidence numeric(5, 4),
  model_version text not null,
  created_at timestamptz not null default now(),
  constraint ops_forecasts_service_date_model_key
    unique (service_id, forecast_date, horizon_days, model_version),
  constraint ops_forecasts_horizon_check check (horizon_days between 1 and 366),
  constraint ops_forecasts_minutes_check check (
    required_minutes >= 0
    and available_minutes >= 0
    and shortfall_minutes = greatest(required_minutes - available_minutes, 0)
  ),
  constraint ops_forecasts_confidence_check check (
    confidence is null or confidence between 0 and 1
  )
);

create index ops_forecasts_service_date_idx
  on public.ops_forecasts (service_id, forecast_date desc, created_at desc);

create table public.ops_hiring_triggers (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  forecast_id uuid not null unique
    references public.ops_forecasts (id) on delete cascade,
  trigger_date date not null,
  shortfall_minutes integer not null,
  threshold_minutes integer,
  status text not null,
  blocked_reason text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_hiring_triggers_minutes_check check (
    shortfall_minutes >= 0
    and (threshold_minutes is null or threshold_minutes > 0)
  ),
  constraint ops_hiring_triggers_status_check check (
    status in ('open', 'blocked', 'acknowledged', 'dismissed', 'resolved')
  ),
  constraint ops_hiring_triggers_blocked_check check (
    (status = 'blocked' and blocked_reason is not null)
    or (status <> 'blocked' and blocked_reason is null)
  )
);

create index ops_hiring_triggers_service_status_idx
  on public.ops_hiring_triggers (service_id, status, trigger_date desc);

create table public.ops_holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  version integer not null,
  valid_from date not null,
  valid_to date,
  status text not null default 'draft',
  source_label text,
  created_by text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint ops_holiday_calendars_service_version_key
    unique (service_id, version),
  constraint ops_holiday_calendars_version_check check (version > 0),
  constraint ops_holiday_calendars_range_check check (
    valid_to is null or valid_from <= valid_to
  ),
  constraint ops_holiday_calendars_status_check check (
    status in ('draft', 'active', 'retired')
  )
);

create unique index ops_holiday_calendars_one_active_idx
  on public.ops_holiday_calendars (service_id)
  where status = 'active';

create table public.ops_holidays (
  calendar_id uuid not null
    references public.ops_holiday_calendars (id) on delete cascade,
  holiday_date date not null,
  name text not null,
  is_working_day boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (calendar_id, holiday_date)
);

create index ops_holidays_calendar_date_idx
  on public.ops_holidays (calendar_id, holiday_date);

create table public.ops_automation_policies (
  service_id text primary key,
  policy_level smallint not null default 1,
  level_2_enabled boolean not null default false,
  minimum_outcomes_for_level_3 integer,
  level_3_human_approved_at timestamptz,
  level_3_human_approved_by text,
  hiring_shortfall_trigger_minutes integer,
  forecast_horizon_days integer,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_automation_policies_level_check
    check (policy_level between 1 and 3),
  constraint ops_automation_policies_level_2_check check (
    policy_level < 2 or level_2_enabled
  ),
  constraint ops_automation_policies_level_3_config_check check (
    policy_level < 3
    or (
      minimum_outcomes_for_level_3 is not null
      and level_3_human_approved_at is not null
      and level_3_human_approved_by is not null
    )
  ),
  constraint ops_automation_policies_outcome_threshold_check check (
    minimum_outcomes_for_level_3 is null
    or minimum_outcomes_for_level_3 > 0
  ),
  constraint ops_automation_policies_hiring_threshold_check check (
    hiring_shortfall_trigger_minutes is null
    or hiring_shortfall_trigger_minutes > 0
  ),
  constraint ops_automation_policies_forecast_horizon_check check (
    forecast_horizon_days is null
    or forecast_horizon_days between 1 and 366
  )
);

create or replace function app_private.enforce_ops_automation_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outcome_count integer;
begin
  if new.policy_level >= 2 and not new.level_2_enabled then
    raise exception 'level 2 feature flag is disabled';
  end if;

  if new.policy_level = 3 then
    if new.minimum_outcomes_for_level_3 is null then
      raise exception 'level 3 requires a configured outcome threshold';
    end if;
    if new.level_3_human_approved_at is null
      or new.level_3_human_approved_by is null
    then
      raise exception 'level 3 requires human approval';
    end if;

    select count(*)::integer
    into v_outcome_count
    from public.ops_decision_outcomes
    where service_id = new.service_id
      and outcome in ('accepted', 'overridden', 'rejected');

    if v_outcome_count < new.minimum_outcomes_for_level_3 then
      raise exception 'level 3 requires sufficient decision outcomes';
    end if;
  end if;

  return new;
end;
$$;

create trigger ops_automation_policies_enforce_level
before insert or update on public.ops_automation_policies
for each row execute function app_private.enforce_ops_automation_policy();

create or replace function public.set_ops_automation_policy_level(
  p_service_id text,
  p_policy_level smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_policy public.ops_automation_policies%rowtype;
begin
  if nullif(btrim(p_service_id), '') is null then
    raise exception 'service_id is required';
  end if;
  if p_policy_level not between 1 and 3 then
    raise exception 'policy level must be between 1 and 3';
  end if;

  insert into public.ops_automation_policies (service_id)
  values (p_service_id)
  on conflict (service_id) do nothing;

  update public.ops_automation_policies
  set policy_level = p_policy_level
  where service_id = p_service_id
  returning * into v_policy;

  return jsonb_build_object(
    'service_id', v_policy.service_id,
    'policy_level', v_policy.policy_level,
    'status', 'activated'
  );
end;
$$;

create or replace function app_private.enqueue_ops_monthly_close_if_due(
  p_service_id text,
  p_run_date date default (now() at time zone 'America/Bogota')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month_start date;
  v_month_last_day date;
  v_close_inserted integer;
begin
  if nullif(btrim(p_service_id), '') is null or p_run_date is null then
    raise exception 'service_id and run date are required';
  end if;

  v_month_start := date_trunc('month', p_run_date)::date;
  v_month_last_day := (
    date_trunc('month', p_run_date)
    + interval '1 month'
    - interval '1 day'
  )::date;

  if p_run_date <> v_month_last_day then
    return jsonb_build_object(
      'service_id', p_service_id,
      'month_start', v_month_start,
      'status', 'not_due'
    );
  end if;

  insert into public.ops_monthly_closes (service_id, month_start)
  values (p_service_id, v_month_start)
  on conflict (service_id, month_start) do nothing;
  get diagnostics v_close_inserted = row_count;

  if v_close_inserted = 0 then
    return jsonb_build_object(
      'service_id', p_service_id,
      'month_start', v_month_start,
      'status', 'already_enqueued'
    );
  end if;

  insert into public.ops_backfill_queue (
    service_id,
    job_type,
    target_key,
    target_date,
    payload
  )
  values (
    p_service_id,
    'monthly_close',
    to_char(v_month_start, 'YYYY-MM'),
    v_month_last_day,
    jsonb_build_object('month_start', v_month_start)
  )
  on conflict (service_id, job_type, target_key)
    where status in ('queued', 'running')
  do nothing;

  return jsonb_build_object(
    'service_id', p_service_id,
    'month_start', v_month_start,
    'status', 'enqueued'
  );
end;
$$;

create or replace function app_private.claim_ops_backfill_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_duration interval default interval '5 minutes'
)
returns setof public.ops_backfill_queue
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker_id is required';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'claim limit must be between 1 and 100';
  end if;
  if p_lease_duration < interval '30 seconds'
    or p_lease_duration > interval '1 hour'
  then
    raise exception 'lease duration must be between 30 seconds and 1 hour';
  end if;

  update public.ops_backfill_queue
  set
    status = case when attempts >= max_attempts then 'failed' else 'queued' end,
    lock_owner = null,
    locked_at = null,
    lease_expires_at = null,
    available_at = case
      when attempts >= max_attempts then available_at
      else now()
    end,
    finished_at = case when attempts >= max_attempts then now() else null end,
    last_error = case
      when attempts >= max_attempts
        then coalesce(last_error, 'maximum attempts reached after stale lease')
      else last_error
    end
  where status = 'running'
    and lease_expires_at <= now();

  return query
  with candidates as (
    select queue.id
    from public.ops_backfill_queue as queue
    where queue.status = 'queued'
      and queue.available_at <= now()
      and queue.attempts < queue.max_attempts
    order by queue.available_at, queue.created_at, queue.id
    for update skip locked
    limit p_limit
  )
  update public.ops_backfill_queue as queue
  set
    status = 'running',
    attempts = queue.attempts + 1,
    lock_owner = p_worker_id,
    locked_at = now(),
    lease_expires_at = now() + p_lease_duration,
    started_at = coalesce(queue.started_at, now()),
    finished_at = null,
    updated_at = now()
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

create or replace function app_private.complete_ops_backfill_job(
  p_job_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.ops_backfill_queue%rowtype;
begin
  select *
  into v_job
  from public.ops_backfill_queue
  where id = p_job_id
  for update;

  if not found then
    raise exception 'job not found';
  end if;
  if v_job.status <> 'running' or v_job.lock_owner is distinct from p_worker_id
  then
    raise exception 'job lease is not owned by worker';
  end if;
  if v_job.lease_expires_at <= now() then
    raise exception 'job lease has expired';
  end if;

  update public.ops_backfill_queue
  set
    status = case
      when p_succeeded then 'succeeded'
      when attempts >= max_attempts then 'failed'
      else 'queued'
    end,
    available_at = case
      when not p_succeeded and attempts < max_attempts
        then now() + least(interval '1 hour', attempts * interval '1 minute')
      else available_at
    end,
    lock_owner = null,
    locked_at = null,
    lease_expires_at = null,
    finished_at = case
      when p_succeeded or attempts >= max_attempts then now()
      else null
    end,
    last_error = case when p_succeeded then null else nullif(btrim(p_error), '') end,
    updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts
  );
end;
$$;

create or replace function app_private.evaluate_ops_hiring_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_threshold integer;
begin
  select hiring_shortfall_trigger_minutes
  into v_threshold
  from public.ops_automation_policies
  where service_id = new.service_id;

  if v_threshold is null then
    insert into public.ops_hiring_triggers (
      service_id,
      forecast_id,
      trigger_date,
      shortfall_minutes,
      threshold_minutes,
      status,
      blocked_reason
    )
    values (
      new.service_id,
      new.id,
      new.forecast_date,
      new.shortfall_minutes,
      null,
      'blocked',
      'commercial_values_required'
    )
    on conflict (forecast_id) do nothing;
  elsif new.shortfall_minutes >= v_threshold then
    insert into public.ops_hiring_triggers (
      service_id,
      forecast_id,
      trigger_date,
      shortfall_minutes,
      threshold_minutes,
      status
    )
    values (
      new.service_id,
      new.id,
      new.forecast_date,
      new.shortfall_minutes,
      v_threshold,
      'open'
    )
    on conflict (forecast_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger ops_forecasts_evaluate_hiring
after insert on public.ops_forecasts
for each row execute function app_private.evaluate_ops_hiring_trigger();

drop trigger if exists set_ops_backfill_queue_updated_at
  on public.ops_backfill_queue;
create trigger set_ops_backfill_queue_updated_at
before update on public.ops_backfill_queue
for each row execute function public.set_updated_at();

drop trigger if exists set_ops_monthly_closes_updated_at
  on public.ops_monthly_closes;
create trigger set_ops_monthly_closes_updated_at
before update on public.ops_monthly_closes
for each row execute function public.set_updated_at();

drop trigger if exists set_ops_hiring_triggers_updated_at
  on public.ops_hiring_triggers;
create trigger set_ops_hiring_triggers_updated_at
before update on public.ops_hiring_triggers
for each row execute function public.set_updated_at();

drop trigger if exists set_ops_automation_policies_updated_at
  on public.ops_automation_policies;
create trigger set_ops_automation_policies_updated_at
before update on public.ops_automation_policies
for each row execute function public.set_updated_at();

alter table public.ops_decision_outcomes enable row level security;
alter table public.ops_backfill_queue enable row level security;
alter table public.ops_monthly_closes enable row level security;
alter table public.ops_forecasts enable row level security;
alter table public.ops_hiring_triggers enable row level security;
alter table public.ops_holiday_calendars enable row level security;
alter table public.ops_holidays enable row level security;
alter table public.ops_automation_policies enable row level security;

create policy ops_decision_outcomes_admin_all
on public.ops_decision_outcomes for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_backfill_queue_admin_all
on public.ops_backfill_queue for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_monthly_closes_admin_all
on public.ops_monthly_closes for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_forecasts_admin_all
on public.ops_forecasts for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_hiring_triggers_admin_all
on public.ops_hiring_triggers for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_holiday_calendars_admin_all
on public.ops_holiday_calendars for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_holidays_admin_all
on public.ops_holidays for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

create policy ops_automation_policies_admin_all
on public.ops_automation_policies for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

revoke all on table
  public.ops_decision_outcomes,
  public.ops_backfill_queue,
  public.ops_monthly_closes,
  public.ops_forecasts,
  public.ops_hiring_triggers,
  public.ops_holiday_calendars,
  public.ops_holidays,
  public.ops_automation_policies
from public, anon;

grant select, insert, update, delete on table
  public.ops_decision_outcomes,
  public.ops_backfill_queue,
  public.ops_monthly_closes,
  public.ops_forecasts,
  public.ops_hiring_triggers,
  public.ops_holiday_calendars,
  public.ops_holidays,
  public.ops_automation_policies
to authenticated;

grant select, insert, update, delete on table
  public.ops_decision_outcomes,
  public.ops_backfill_queue,
  public.ops_monthly_closes,
  public.ops_forecasts,
  public.ops_hiring_triggers,
  public.ops_holiday_calendars,
  public.ops_holidays,
  public.ops_automation_policies
to service_role;

revoke all on function public.set_ops_automation_policy_level(text, smallint)
from public, anon;
grant execute on function public.set_ops_automation_policy_level(text, smallint)
to authenticated, service_role;

revoke all on function app_private.enforce_ops_automation_policy()
from public, anon, authenticated;
revoke all on function app_private.enqueue_ops_monthly_close_if_due(text, date)
from public, anon, authenticated;
revoke all on function app_private.claim_ops_backfill_jobs(text, integer, interval)
from public, anon, authenticated;
revoke all on function app_private.complete_ops_backfill_job(
  uuid,
  text,
  boolean,
  text
) from public, anon, authenticated;
revoke all on function app_private.evaluate_ops_hiring_trigger()
from public, anon, authenticated;

grant execute on function app_private.enqueue_ops_monthly_close_if_due(text, date)
to service_role;
grant execute on function app_private.claim_ops_backfill_jobs(
  text,
  integer,
  interval
) to service_role;
grant execute on function app_private.complete_ops_backfill_job(
  uuid,
  text,
  boolean,
  text
) to service_role;
