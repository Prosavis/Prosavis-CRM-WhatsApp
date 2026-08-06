begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'booking_facts', 'booking facts table exists');
select has_table(
  'public',
  'cleaner_day_facts',
  'cleaner day facts table exists'
);
select has_table(
  'public',
  'daily_ops_rollup',
  'daily ops rollup table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.booking_facts'::regclass
  ),
  'booking facts has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.cleaner_day_facts'::regclass
  ),
  'cleaner day facts has RLS'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.daily_ops_rollup'::regclass
  ),
  'daily ops rollup has RLS'
);

insert into public.crm_team_members (
  service_id,
  id,
  user_id,
  name,
  email
)
values (
  'service-facts-test',
  'cleaner-facts-test',
  'user-facts-test',
  'Operaria Facts',
  'facts@example.test'
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
  'service-facts-test',
  'cleaner-facts-test',
  (now() at time zone 'America/Bogota')::date + 1,
  480,
  480,
  date_trunc('day', now()) + interval '1 day 08 hours',
  date_trunc('day', now()) + interval '1 day 16 hours'
);

insert into public.bookings (
  id,
  service_id,
  appointment_id,
  source_revision,
  status,
  required_cleaner_minutes,
  scheduled_start,
  scheduled_end,
  total_cop,
  paid_cop,
  pending_cop,
  cac_cop
)
values (
  '11111111-1111-4111-8111-111111111111',
  'service-facts-test',
  'appointment-completed',
  1,
  'COMPLETED',
  360,
  date_trunc('day', now()) + interval '1 day 08 hours',
  date_trunc('day', now()) + interval '1 day 14 hours',
  100000,
  0,
  100000,
  10000
);

insert into public.booking_crew (
  service_id,
  booking_id,
  cleaner_id,
  assigned_minutes,
  is_lead,
  estimated_marginal_cost_cop
)
values (
  'service-facts-test',
  '11111111-1111-4111-8111-111111111111',
  'cleaner-facts-test',
  360,
  true,
  20000
);

select is(
  (
    select billed_cop
    from public.booking_facts
    where booking_id = '11111111-1111-4111-8111-111111111111'
  ),
  100000::bigint,
  'completed service is billed by service date'
);

select is(
  (
    select overdue_cop
    from public.booking_facts
    where booking_id = '11111111-1111-4111-8111-111111111111'
  ),
  100000::bigint,
  'completed unpaid service is overdue'
);

select is(
  (
    select contribution_after_cac_cop
    from public.booking_facts
    where booking_id = '11111111-1111-4111-8111-111111111111'
  ),
  70000::bigint,
  'contribution subtracts labor then CAC'
);

update public.bookings
set
  paid_cop = 100000,
  pending_cop = 0,
  payment_status = 'PAGO_ACEPTADO',
  payment_recorded_at = now(),
  source_revision = 2
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (
    select collected_cop
    from public.booking_facts
    where booking_id = '11111111-1111-4111-8111-111111111111'
  ),
  100000::bigint,
  'collected amount requires an effective payment timestamp'
);

select is(
  (
    select collected_cop
    from public.daily_ops_rollup
    where service_id = 'service-facts-test'
      and operational_date =
        (now() at time zone 'America/Bogota')::date
  ),
  100000::bigint,
  'daily collected value is grouped by payment date'
);

select is(
  (
    select utilization
    from public.cleaner_day_facts
    where service_id = 'service-facts-test'
      and cleaner_id = 'cleaner-facts-test'
  ),
  0.75::numeric,
  'eight accepted hours with T6 yields 75 percent utilization'
);

select is(
  (
    select recoverable_minutes
    from public.cleaner_day_facts
    where service_id = 'service-facts-test'
      and cleaner_id = 'cleaner-facts-test'
  ),
  120,
  'T6 leaves a recoverable two-hour gap'
);

select is(
  (
    select billed_cop
    from public.daily_ops_rollup
    where service_id = 'service-facts-test'
      and operational_date =
        (now() at time zone 'America/Bogota')::date + 1
  ),
  100000::bigint,
  'daily rollup reflects booking facts'
);

insert into public.bookings (
  id,
  service_id,
  appointment_id,
  source_revision,
  status,
  required_cleaner_minutes,
  scheduled_start,
  scheduled_end,
  total_cop,
  pending_cop
)
values (
  '22222222-2222-4222-8222-222222222222',
  'service-facts-test',
  'appointment-upcoming',
  1,
  'CONFIRMED',
  120,
  date_trunc('day', now()) + interval '2 day 08 hours',
  date_trunc('day', now()) + interval '2 day 10 hours',
  50000,
  50000
);

select is(
  (
    select upcoming_cop
    from public.booking_facts
    where booking_id = '22222222-2222-4222-8222-222222222222'
  ),
  50000::bigint,
  'only future confirmed pending value is upcoming'
);

insert into public.bookings (
  id,
  service_id,
  appointment_id,
  source_revision,
  status,
  required_cleaner_minutes,
  scheduled_start,
  scheduled_end,
  total_cop
)
values (
  '33333333-3333-4333-8333-333333333333',
  'service-facts-test',
  'appointment-no-entry',
  1,
  'CANCELED',
  60,
  date_trunc('day', now()) + interval '1 day 15 hours',
  date_trunc('day', now()) + interval '1 day 16 hours',
  30000
);

insert into public.booking_crew (
  service_id,
  booking_id,
  cleaner_id,
  assigned_minutes,
  is_lead
)
values (
  'service-facts-test',
  '33333333-3333-4333-8333-333333333333',
  'cleaner-facts-test',
  60,
  true
);

insert into public.booking_events (
  service_id,
  booking_id,
  event
)
values (
  'service-facts-test',
  '33333333-3333-4333-8333-333333333333',
  'no_pudo_ingresar'
);

select ok(
  (
    select capacity_consumed_unbilled
    from public.booking_facts
    where booking_id = '33333333-3333-4333-8333-333333333333'
  ),
  'no-entry consumes capacity'
);

select is(
  (
    select billed_cop
    from public.booking_facts
    where booking_id = '33333333-3333-4333-8333-333333333333'
  ),
  0::bigint,
  'no-entry remains unbilled'
);

select is(
  (
    select utilization
    from public.cleaner_day_facts
    where service_id = 'service-facts-test'
      and cleaner_id = 'cleaner-facts-test'
  ),
  0.875::numeric,
  'no-entry minutes reduce available capacity'
);

select * from finish();
rollback;
