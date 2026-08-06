begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table(
  'public',
  'ops_v5_rating_payroll_config',
  'rating and payroll configuration exists'
);
select has_table('public', 'rating_events', 'rating event ledger exists');
select has_table('public', 'cleaner_scores', 'Bayesian score projection exists');
select has_table(
  'public',
  'cleaner_compliance_snapshots',
  'compliance snapshot ledger exists'
);
select has_table(
  'public',
  'cleaner_monthly_payroll',
  'monthly payroll ledger exists'
);

select has_function(
  'public',
  'apply_ops_rating_event',
  array['jsonb'],
  'idempotent rating projection RPC exists'
);
select has_function(
  'public',
  'refresh_cleaner_compliance_snapshot',
  array['text', 'text', 'date'],
  'compliance snapshot RPC exists'
);
select has_function(
  'public',
  'refresh_cleaner_monthly_payroll',
  array['text', 'text', 'date', 'text'],
  'monthly payroll projection RPC exists'
);

select function_privs_are(
  'public',
  'apply_ops_rating_event',
  array['jsonb'],
  'service_role',
  array['EXECUTE'],
  'only service role projects rating events'
);

insert into public.crm_team_members (
  service_id,
  id,
  user_id,
  name,
  email,
  hire_date,
  labor_regime,
  alturas_certified,
  arl_risk_class
)
values (
  'service-rating-payroll-test',
  'cleaner-rating-payroll-test',
  'user-rating-payroll-test',
  'Operaria Rating Payroll',
  'rating-payroll@example.test',
  '2026-01-15',
  'configured_test_regime',
  false,
  null
);

insert into public.ops_v5_rating_payroll_config (
  service_id,
  bayesian_prior_mean,
  bayesian_prior_weight,
  rating_half_life_days,
  standard_day_minutes,
  minimum_day_fraction,
  day_rate_cop,
  rounding_increment_cop,
  requires_hire_date,
  requires_labor_regime,
  requires_alturas,
  requires_arl_risk_class,
  require_compliance_for_payroll_close,
  is_active
)
values (
  'service-rating-payroll-test',
  4,
  2,
  30,
  480,
  0.5,
  80001,
  100,
  true,
  true,
  false,
  false,
  true,
  true
);

insert into public.ops_v5_rating_payroll_config (
  service_id,
  is_active
)
values (
  'service-incomplete-config-test',
  false
);

select throws_ok(
  $$
    update public.ops_v5_rating_payroll_config
    set is_active = true
    where service_id = 'service-incomplete-config-test'
  $$,
  'rating/payroll config is incomplete',
  'activation is blocked instead of inventing unknown constants'
);

select is(
  public.apply_ops_rating_event(
    jsonb_build_object(
      'service_id', 'service-rating-payroll-test',
      'cleaner_id', 'cleaner-rating-payroll-test',
      'appointment_id', 'appointment-rating-new',
      'source', 'firebase_team_member_review',
      'source_event_id', 'appointment-rating-new:cleaner-rating-payroll-test',
      'rating', 5,
      'occurred_at', '2026-08-06T12:00:00Z'
    )
  ) ->> 'applied',
  'true',
  'first rating event is applied'
);

select is(
  public.apply_ops_rating_event(
    jsonb_build_object(
      'service_id', 'service-rating-payroll-test',
      'cleaner_id', 'cleaner-rating-payroll-test',
      'appointment_id', 'appointment-rating-new',
      'source', 'firebase_team_member_review',
      'source_event_id', 'appointment-rating-new:cleaner-rating-payroll-test',
      'rating', 5,
      'occurred_at', '2026-08-06T12:00:00Z'
    )
  ) ->> 'applied',
  'false',
  'duplicate source event is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.rating_events
    where service_id = 'service-rating-payroll-test'
  ),
  1,
  'idempotent projection stores one event'
);

select is(
  public.apply_ops_rating_event(
    jsonb_build_object(
      'service_id', 'service-rating-payroll-test',
      'cleaner_id', 'cleaner-rating-payroll-test',
      'appointment_id', 'appointment-rating-old',
      'source', 'firebase_team_member_review',
      'source_event_id', 'appointment-rating-old:cleaner-rating-payroll-test',
      'rating', 1,
      'occurred_at', '2026-07-07T12:00:00Z'
    )
  ) ->> 'applied',
  'true',
  'older rating event is applied'
);

select lives_ok(
  $$
    select app_private.refresh_cleaner_score(
      'service-rating-payroll-test',
      'cleaner-rating-payroll-test',
      '2026-08-06T12:00:00Z'::timestamptz
    )
  $$,
  'Bayesian score can be refreshed at a deterministic instant'
);

select is(
  (
    select round(score, 6)
    from public.cleaner_scores
    where service_id = 'service-rating-payroll-test'
      and cleaner_id = 'cleaner-rating-payroll-test'
  ),
  3.857143::numeric,
  'score combines prior and half-life-decayed observations'
);

insert into public.cleaner_day_facts (
  service_id,
  cleaner_id,
  operational_date,
  sold_minutes
)
values
  (
    'service-rating-payroll-test',
    'cleaner-rating-payroll-test',
    '2026-08-05',
    120
  ),
  (
    'service-rating-payroll-test',
    'cleaner-rating-payroll-test',
    '2026-08-06',
    600
  );

select throws_ok(
  $$
    select public.refresh_cleaner_monthly_payroll(
      'service-rating-payroll-test',
      'cleaner-rating-payroll-test',
      '2026-08-01',
      'closed'
    )
  $$,
  'compliant snapshot required before payroll close',
  'payroll close is blocked without its compliance snapshot'
);

select ok(
  public.refresh_cleaner_compliance_snapshot(
    'service-rating-payroll-test',
    'cleaner-rating-payroll-test',
    '2026-08-31'
  ) is not null,
  'compliance snapshot is captured'
);

select is(
  (
    select compliance_status
    from public.cleaner_compliance_snapshots
    where service_id = 'service-rating-payroll-test'
      and cleaner_id = 'cleaner-rating-payroll-test'
      and snapshot_date = '2026-08-31'
  ),
  'compliant',
  'configured compliance policy determines snapshot status'
);

select is(
  public.refresh_cleaner_monthly_payroll(
    'service-rating-payroll-test',
    'cleaner-rating-payroll-test',
    '2026-08-01',
    'estimated'
  ) ->> 'payable_day_units',
  '1.750000',
  'hybrid model applies the minimum day to short days'
);

select is(
  public.refresh_cleaner_monthly_payroll(
    'service-rating-payroll-test',
    'cleaner-rating-payroll-test',
    '2026-08-01',
    'closed'
  ) ->> 'rounded_payable_cop',
  '140000',
  'closed payroll uses configured rounding increment'
);

select is(
  (
    select rounding_slack_cop
    from public.cleaner_monthly_payroll
    where service_id = 'service-rating-payroll-test'
      and cleaner_id = 'cleaner-rating-payroll-test'
      and period_month = '2026-08-01'
      and ledger_status = 'closed'
  ),
  (-1.75)::numeric,
  'rounding slack is preserved explicitly'
);

select throws_ok(
  $$
    update public.cleaner_monthly_payroll
    set rounded_payable_cop = 1
    where service_id = 'service-rating-payroll-test'
      and cleaner_id = 'cleaner-rating-payroll-test'
      and period_month = '2026-08-01'
      and ledger_status = 'closed'
  $$,
  'closed payroll rows are immutable',
  'closed payroll cannot be rewritten'
);

select * from finish();
rollback;
