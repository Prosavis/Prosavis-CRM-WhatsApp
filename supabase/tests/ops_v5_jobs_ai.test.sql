begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select has_table('public', 'ops_decision_outcomes', 'decision outcomes exist');
select has_table('public', 'ops_backfill_queue', 'backfill queue exists');
select has_table('public', 'ops_monthly_closes', 'monthly closes exist');
select has_table('public', 'ops_forecasts', 'forecasts exist');
select has_table('public', 'ops_hiring_triggers', 'hiring triggers exist');
select has_table(
  'public',
  'ops_holiday_calendars',
  'versioned holiday calendars exist'
);
select has_table('public', 'ops_holidays', 'versioned holidays exist');
select has_table(
  'public',
  'ops_automation_policies',
  'automation policies exist'
);

select has_function(
  'public',
  'set_ops_automation_policy_level',
  array['text', 'smallint'],
  'policy level transition RPC exists'
);
select has_function(
  'app_private',
  'enqueue_ops_monthly_close_if_due',
  array['text', 'date'],
  'monthly close daily guard exists'
);
select has_function(
  'app_private',
  'claim_ops_backfill_jobs',
  array['text', 'integer', 'interval'],
  'atomic queue claim exists'
);
select has_function(
  'app_private',
  'complete_ops_backfill_job',
  array['uuid', 'text', 'boolean', 'text'],
  'lease-owned completion exists'
);

insert into public.ops_automation_policies (service_id)
values ('service-jobs-ai-test');

select is(
  (
    select policy_level
    from public.ops_automation_policies
    where service_id = 'service-jobs-ai-test'
  ),
  1::smallint,
  'automation defaults to suggestion-only level one'
);

select throws_ok(
  $$
    select public.set_ops_automation_policy_level(
      'service-jobs-ai-test',
      2::smallint
    )
  $$,
  'level 2 feature flag is disabled',
  'level two requires an explicit feature flag'
);

update public.ops_automation_policies
set level_2_enabled = true
where service_id = 'service-jobs-ai-test';

select is(
  public.set_ops_automation_policy_level(
    'service-jobs-ai-test',
    2::smallint
  ) ->> 'status',
  'activated',
  'level two activates only after explicit enablement'
);

select throws_ok(
  $$
    select public.set_ops_automation_policy_level(
      'service-jobs-ai-test',
      3::smallint
    )
  $$,
  'level 3 requires a configured outcome threshold',
  'unknown commercial thresholds block level three'
);

update public.ops_automation_policies
set minimum_outcomes_for_level_3 = 2
where service_id = 'service-jobs-ai-test';

select throws_ok(
  $$
    select public.set_ops_automation_policy_level(
      'service-jobs-ai-test',
      3::smallint
    )
  $$,
  'level 3 requires human approval',
  'level three remains blocked without human approval'
);

update public.ops_automation_policies
set
  level_3_human_approved_at = now(),
  level_3_human_approved_by = 'admin-test'
where service_id = 'service-jobs-ai-test';

select throws_ok(
  $$
    select public.set_ops_automation_policy_level(
      'service-jobs-ai-test',
      3::smallint
    )
  $$,
  'level 3 requires sufficient decision outcomes',
  'level three remains blocked without sufficient outcomes'
);

insert into public.ops_decision_outcomes (
  service_id,
  decision_id,
  decision_type,
  outcome,
  decided_by
)
values
  (
    'service-jobs-ai-test',
    'decision-1',
    'assignment',
    'accepted',
    'admin-test'
  ),
  (
    'service-jobs-ai-test',
    'decision-2',
    'assignment',
    'overridden',
    'admin-test'
  );

select is(
  public.set_ops_automation_policy_level(
    'service-jobs-ai-test',
    3::smallint
  ) ->> 'status',
  'activated',
  'level three requires sufficient outcomes and human approval'
);

insert into public.ops_forecasts (
  service_id,
  forecast_date,
  horizon_days,
  required_minutes,
  available_minutes,
  shortfall_minutes,
  model_version
)
values (
  'service-jobs-ai-test',
  '2026-08-31',
  30,
  10000,
  8000,
  2000,
  'test-v1'
);

select is(
  (
    select status
    from public.ops_hiring_triggers
    where service_id = 'service-jobs-ai-test'
  ),
  'blocked',
  'unknown hiring threshold creates a blocked trigger'
);

select is(
  (
    select blocked_reason
    from public.ops_hiring_triggers
    where service_id = 'service-jobs-ai-test'
  ),
  'commercial_values_required',
  'blocked trigger names the missing commercial configuration'
);

select is(
  app_private.enqueue_ops_monthly_close_if_due(
    'service-jobs-ai-test',
    '2026-08-30'::date
  ) ->> 'status',
  'not_due',
  'daily monthly-close guard ignores non-final days'
);

select is(
  app_private.enqueue_ops_monthly_close_if_due(
    'service-jobs-ai-test',
    '2026-08-31'::date
  ) ->> 'status',
  'enqueued',
  'daily guard enqueues on the calendar month final day'
);

select is(
  app_private.enqueue_ops_monthly_close_if_due(
    'service-jobs-ai-test',
    '2026-08-31'::date
  ) ->> 'status',
  'already_enqueued',
  'monthly close enqueue is idempotent'
);

insert into public.ops_backfill_queue (
  service_id,
  job_type,
  target_key
)
values (
  'service-jobs-ai-test',
  'decision_outcomes',
  'backfill-1'
);

select is(
  (
    select count(*)::integer
    from app_private.claim_ops_backfill_jobs(
      'worker-a',
      1,
      interval '5 minutes'
    )
  ),
  1,
  'first worker claims the queued job'
);

select is(
  (
    select count(*)::integer
    from app_private.claim_ops_backfill_jobs(
      'worker-b',
      1,
      interval '5 minutes'
    )
  ),
  0,
  'second worker cannot claim an active lease'
);

select throws_ok(
  $$
    select app_private.complete_ops_backfill_job(
      (
        select id
        from public.ops_backfill_queue
        where service_id = 'service-jobs-ai-test'
          and target_key = 'backfill-1'
      ),
      'worker-b',
      true,
      null
    )
  $$,
  'job lease is not owned by worker',
  'only the lease owner may complete a job'
);

select is(
  app_private.complete_ops_backfill_job(
    (
      select id
      from public.ops_backfill_queue
      where service_id = 'service-jobs-ai-test'
        and target_key = 'backfill-1'
    ),
    'worker-a',
    true,
    null
  ) ->> 'status',
  'succeeded',
  'lease owner completes the claimed job'
);

insert into public.ops_holiday_calendars (
  service_id,
  version,
  valid_from,
  status
)
values (
  'service-jobs-ai-test',
  1,
  '2026-01-01',
  'active'
);

select throws_like(
  $$
    insert into public.ops_holiday_calendars (
      service_id,
      version,
      valid_from,
      status
    )
    values (
      'service-jobs-ai-test',
      2,
      '2026-07-01',
      'active'
    )
  $$,
  '%ops_holiday_calendars_one_active_idx%',
  'only one holiday calendar version is active per service'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.ops_decision_outcomes'::regclass
  ),
  'decision outcomes has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.ops_backfill_queue'::regclass
  ),
  'backfill queue has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.ops_automation_policies'::regclass
  ),
  'automation policies has RLS'
);

select function_privs_are(
  'app_private',
  'claim_ops_backfill_jobs',
  array['text', 'integer', 'interval'],
  'service_role',
  array['EXECUTE'],
  'only service role claims queue jobs'
);

select * from finish();
rollback;
