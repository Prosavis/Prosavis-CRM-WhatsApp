begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create or replace function pg_temp.sqlstate_of(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select has_table('public', 'assignment_decisions', 'assignment decisions exist');
select has_table('public', 'lost_requests', 'lost requests exist');
select has_table('public', 'comuna_travel_matrix', 'travel matrix exists');

select has_column(
  'public',
  'assignment_decisions',
  'saga_status',
  'assignment decisions expose saga status'
);
select has_column(
  'public',
  'assignment_decisions',
  'feature_vector_stamp',
  'assignment decisions persist feature vector stamps'
);
select has_column(
  'public',
  'lost_requests',
  'recovery_status',
  'lost requests expose recovery status'
);

select is(
  (
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
      and n.nspname = 'public'
    where c.relname in (
      'assignment_decisions',
      'lost_requests',
      'comuna_travel_matrix'
    )
      and c.relrowsecurity
  ),
  3::bigint,
  'RLS is enabled on every Phase 1A table'
);

select results_eq(
  $$
    select tablename::text collate "C"
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'assignment_decisions',
        'lost_requests',
        'comuna_travel_matrix'
      )
      and cmd = 'ALL'
      and roles = array['authenticated']::name[]
      and qual ~ 'app_private\.is_crm_admin\(\)'
      and with_check ~ 'app_private\.is_crm_admin\(\)'
    order by tablename
  $$,
  $$
    values
      ('assignment_decisions'::text collate "C"),
      ('comuna_travel_matrix'::text collate "C"),
      ('lost_requests'::text collate "C")
  $$,
  'admin policies gate USING and WITH CHECK'
);

select is(
  (
    select count(*)::bigint
    from unnest(array[
      'assignment_decisions',
      'lost_requests',
      'comuna_travel_matrix'
    ]) as tables(name)
    cross join unnest(array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE'
    ]) as privileges(privilege)
    where has_table_privilege(
      'anon',
      format('public.%I', name),
      privilege
    )
  ),
  0::bigint,
  'anon has no Phase 1A table privileges'
);

select is(
  (
    select count(*)::bigint
    from unnest(array[
      'assignment_decisions',
      'lost_requests',
      'comuna_travel_matrix'
    ]) as tables(name)
    cross join unnest(array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE'
    ]) as privileges(privilege)
    where has_table_privilege(
      'authenticated',
      format('public.%I', name),
      privilege
    )
  ),
  12::bigint,
  'authenticated receives explicit CRUD grants guarded by RLS'
);

select is(
  pg_temp.sqlstate_of($$
    insert into public.assignment_decisions (
      service_id,
      request_id,
      request_hash,
      request_context,
      candidates,
      spec_version,
      engine_weights,
      automation_level,
      saga_status
    ) values (
      'svc-assignment',
      '10000000-0000-0000-0000-000000000001',
      repeat('a', 64),
      '{}'::jsonb,
      '[]'::jsonb,
      '5.0.0',
      '{}'::jsonb,
      1,
      'unknown'
    )
  $$),
  '23514',
  'saga status is exhaustive'
);

select is(
  pg_temp.sqlstate_of($$
    insert into public.lost_requests (
      service_id,
      request_id,
      requested_tier,
      requested_date,
      window_start,
      window_end,
      reason,
      recovery_status
    ) values (
      'svc-assignment',
      '10000000-0000-0000-0000-000000000002',
      'T8',
      '2026-08-07',
      '08:00',
      '16:00',
      'sin_capacidad',
      'unknown'
    )
  $$),
  '23514',
  'recovery status is exhaustive'
);

select is(
  pg_temp.sqlstate_of($$
    insert into public.comuna_travel_matrix (
      service_id,
      origin_comuna,
      destination_comuna,
      hour_bucket,
      minutes_estimate,
      sample_count
    ) values (
      'svc-assignment',
      'Centro',
      'Cuba',
      24,
      30,
      0
    )
  $$),
  '23514',
  'travel hour bucket is valid'
);

select is(
  pg_temp.sqlstate_of($$
    insert into public.comuna_travel_matrix (
      service_id,
      origin_comuna,
      destination_comuna,
      hour_bucket,
      minutes_estimate,
      sample_count
    ) values (
      'svc-assignment',
      'Centro',
      'Cuba',
      8,
      -1,
      0
    )
  $$),
  '23514',
  'travel minutes are positive'
);

insert into public.assignment_decisions (
  id,
  service_id,
  request_id,
  request_hash,
  request_context,
  candidates,
  suggested_option_id,
  spec_version,
  engine_weights,
  automation_level
) values (
  '20000000-0000-0000-0000-000000000001',
  'svc-assignment',
  '10000000-0000-0000-0000-000000000003',
  repeat('b', 64),
  '{"tier":"T8"}'::jsonb,
  '[{"option_id":"pair-a-b"}]'::jsonb,
  'pair-a-b',
  '5.0.0',
  '{"cost":0.25}'::jsonb,
  1
);

insert into public.lost_requests (
  id,
  service_id,
  request_id,
  requested_tier,
  requested_date,
  window_start,
  window_end,
  reason
) values (
  '30000000-0000-0000-0000-000000000001',
  'svc-assignment',
  '10000000-0000-0000-0000-000000000003',
  'T8',
  '2026-08-07',
  '08:00',
  '16:00',
  'sin_capacidad'
);

insert into public.bookings (
  id,
  service_id,
  appointment_id,
  status,
  fulfillment,
  crew_size
) values (
  '40000000-0000-0000-0000-000000000001',
  'svc-assignment',
  'appointment-recovered',
  'CONFIRMED',
  'composite',
  2
);

update public.bookings
set assignment_decision_id = '20000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select
      recovered,
      recovery_status,
      recovered_booking_id
    from public.lost_requests
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  $$
    values (
      true,
      'recovered'::text,
      '40000000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'booking assignment automatically recovers matching lost request'
);

select lives_ok(
  $$
    select public.record_comuna_travel_observation(
      'svc-assignment',
      'Centro',
      'Cuba',
      8,
      30,
      0.2
    )
  $$,
  'travel observation seeds a matrix cell'
);

select lives_ok(
  $$
    select public.record_comuna_travel_observation(
      'svc-assignment',
      'Centro',
      'Cuba',
      8,
      50,
      0.2
    )
  $$,
  'travel observation updates the matrix using configured EWMA alpha'
);

select results_eq(
  $$
    select minutes_estimate, sample_count
    from public.comuna_travel_matrix
    where service_id = 'svc-assignment'
      and origin_comuna = 'Centro'
      and destination_comuna = 'Cuba'
      and hour_bucket = 8
  $$,
  $$ values (34::numeric, 2) $$,
  'EWMA observation uses alpha 0.2 without hidden commercial inputs'
);

select * from finish();
rollback;
