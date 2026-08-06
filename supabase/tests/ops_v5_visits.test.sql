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

select has_table('public', 'quejas', 'quejas exists');
select has_table('public', 'client_visits', 'client_visits exists');
select has_table('public', 'visit_routes', 'visit_routes exists');
select has_table('public', 'opportunities', 'opportunities exists');
select has_table('public', 'referrals', 'referrals exists');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'quejas',
        'client_visits',
        'visit_routes',
        'opportunities',
        'referrals'
      )
      and c.relrowsecurity
  $$,
  array[5::bigint],
  'RLS is enabled on every visits table'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'quejas',
      'client_visits',
      'visit_routes',
      'opportunities',
      'referrals'
    ]) as tables(name)
    cross join unnest(array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE'
    ]) as privileges(privilege)
    where has_table_privilege(
      'service_role',
      format('public.%I', name),
      privilege
    )
  $$,
  array[20::bigint],
  'service_role receives explicit CRUD on visits tables'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'quejas',
      'client_visits',
      'visit_routes',
      'opportunities',
      'referrals'
    ]) as tables(name)
    where has_table_privilege('anon', format('public.%I', name), 'SELECT')
  $$,
  array[0::bigint],
  'anon cannot read visits tables'
);

insert into public.visit_routes (
  id,
  service_id,
  route_date,
  weekly_quota,
  completed_this_week,
  effective_quota,
  generated_by,
  idempotency_key
) values (
  '10000000-0000-0000-0000-000000000001',
  'svc-visits',
  '2026-08-06',
  5,
  2,
  3,
  'admin-test',
  'route:2026-08-06:admin-test'
);

select lives_ok(
  $$
    insert into public.client_visits (
      id,
      service_id,
      client_reference,
      status,
      visited_at,
      satisfaction,
      performed_by,
      idempotency_key
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'svc-visits',
      'client-minimum',
      'completed',
      '2026-08-06 15:00+00',
      4,
      'admin-test',
      'visit:client-minimum:2026-08-06'
    )
  $$,
  'mobile registration accepts satisfaction as its only outcome field'
);

select is(
  pg_temp.sqlstate_of(
    $$
      insert into public.client_visits (
        service_id,
        client_reference,
        status,
        visited_at,
        performed_by,
        idempotency_key
      ) values (
        'svc-visits',
        'client-no-satisfaction',
        'completed',
        '2026-08-06 15:00+00',
        'admin-test',
        'visit:client-no-satisfaction'
      )
    $$
  ),
  '23514',
  'completed visit requires satisfaction'
);

select is(
  pg_temp.sqlstate_of(
    $$
      insert into public.client_visits (
        service_id,
        client_reference,
        status,
        visited_at,
        satisfaction,
        performed_by,
        idempotency_key
      ) values (
        'svc-visits',
        'client-duplicate',
        'completed',
        '2026-08-06 15:00+00',
        5,
        'admin-test',
        'visit:client-minimum:2026-08-06'
      )
    $$
  ),
  '23505',
  'visit idempotency key prevents duplicate registration'
);

insert into public.quejas (
  service_id,
  client_reference,
  source_visit_id,
  severity,
  summary,
  idempotency_key
) values (
  'svc-visits',
  'client-minimum',
  '20000000-0000-0000-0000-000000000001',
  'high',
  'Calidad requiere atención inmediata',
  'complaint:client-minimum:2026-08-06'
);

select is(
  (
    select attention_due_on
    from public.quejas
    where idempotency_key = 'complaint:client-minimum:2026-08-06'
  ),
  (now() at time zone 'America/Bogota')::date,
  'open complaint is due today in Bogota'
);

insert into public.referrals (
  id,
  service_id,
  client_reference,
  source_visit_id,
  referred_name,
  referred_phone,
  idempotency_key,
  created_by
) values (
  '30000000-0000-0000-0000-000000000001',
  'svc-visits',
  'client-minimum',
  '20000000-0000-0000-0000-000000000001',
  'Persona referida',
  '+573001112233',
  'referral:visit-minimum:1',
  'admin-test'
);

insert into public.opportunities (
  service_id,
  client_reference,
  source_visit_id,
  source_referral_id,
  opportunity_type,
  title,
  idempotency_key
) values (
  'svc-visits',
  'client-minimum',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'referral',
  'Lead por referido',
  'opportunity:referral:visit-minimum:1'
);

select is(
  pg_temp.sqlstate_of(
    $$
      insert into public.opportunities (
        service_id,
        client_reference,
        source_referral_id,
        opportunity_type,
        title,
        idempotency_key
      ) values (
        'svc-visits',
        'client-minimum',
        '30000000-0000-0000-0000-000000000001',
        'referral',
        'Lead duplicado',
        'opportunity:referral:duplicate'
      )
    $$
  ),
  '23505',
  'a referral can create only one opportunity lead'
);

select is(
  pg_temp.sqlstate_of(
    $$
      insert into public.client_visits (
        service_id,
        client_reference,
        route_id,
        route_sequence,
        status,
        scheduled_for,
        performed_by,
        idempotency_key
      ) values (
        'other-service',
        'cross-service',
        '10000000-0000-0000-0000-000000000001',
        1,
        'scheduled',
        '2026-08-06',
        'admin-test',
        'visit:cross-service:route'
      )
    $$
  ),
  '23503',
  'route foreign key prevents cross-service references'
);

select * from finish();
rollback;
