begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table(
  'public',
  'orphan_stacking_candidates',
  'orphan stacking candidates table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.orphan_stacking_candidates'::regclass
  ),
  'orphan stacking candidates has RLS'
);

select has_function(
  'public',
  'run_orphan_stacking_recovery',
  array['text', 'timestamp with time zone'],
  '18:00 recovery job helper exists'
);

insert into public.crm_team_members (
  service_id,
  id,
  user_id,
  name,
  email,
  accepts_composite
)
values (
  'service-recovery-test',
  'cleaner-recovery-test',
  'user-recovery-test',
  'Operaria Recovery',
  'recovery@example.test',
  true
);

insert into public.cleaner_availability (
  service_id,
  cleaner_id,
  operational_date,
  offered_minutes,
  accepted_minutes,
  window_start,
  window_end
)
values (
  'service-recovery-test',
  'cleaner-recovery-test',
  date '2026-08-07',
  480,
  480,
  timestamptz '2026-08-07 08:00:00-05',
  timestamptz '2026-08-07 16:00:00-05'
);

select is(
  (
    public.run_orphan_stacking_recovery(
      'service-recovery-test',
      timestamptz '2026-08-06 17:59:00-05'
    )->>'should_run'
  )::boolean,
  false,
  'job does not run before 18:00 Bogota'
);

select is(
  (
    public.run_orphan_stacking_recovery(
      'service-recovery-test',
      timestamptz '2026-08-06 18:00:00-05'
    )->>'operational_date'
  ),
  '2026-08-07',
  'job targets recoverables for tomorrow'
);

select is(
  (
    select count(*)
    from public.orphan_stacking_candidates
    where service_id = 'service-recovery-test'
      and operational_date = date '2026-08-07'
  ),
  1::bigint,
  'job persists the free stacking window'
);

select is(
  (
    select available_minutes
    from public.orphan_stacking_candidates
    where service_id = 'service-recovery-test'
      and operational_date = date '2026-08-07'
  ),
  480,
  'candidate preserves exact recoverable minutes'
);

select ok(
  (
    select single_price_cop is null and pair_price_cop is null
    from public.orphan_stacking_candidates
    where service_id = 'service-recovery-test'
      and operational_date = date '2026-08-07'
  ),
  'unknown prices remain null'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.orphan_stacking_candidates',
    'select'
  ),
  'anonymous users cannot read candidates'
);

select * from finish();
rollback;
