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

create or replace function pg_temp.row_count_of(statement text)
returns bigint
language plpgsql
as $$
declare
  affected_rows bigint;
begin
  execute statement;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function pg_temp.bigint_result_of(statement text)
returns bigint
language plpgsql
as $$
declare
  result bigint;
begin
  execute statement into result;
  return result;
end;
$$;

create temporary table foundation_rls_cases (
  table_name text primary key,
  seed_id uuid not null,
  inserted_id uuid not null,
  insert_sql text not null
) on commit drop;

insert into foundation_rls_cases (table_name, seed_id, inserted_id, insert_sql)
values
  (
    'buildings',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000101',
    $sql$insert into public.buildings
      (id, service_id, name, building_type)
      values (
        '40000000-0000-0000-0000-000000000101',
        'svc-rls',
        'RLS inserted building',
        'edificio'
      )$sql$
  ),
  (
    'bookings',
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000101',
    $sql$insert into public.bookings
      (id, service_id, appointment_id, status, fulfillment, crew_size)
      values (
        '50000000-0000-0000-0000-000000000101',
        'svc-rls',
        'appointment-rls-inserted',
        'PENDING',
        'single',
        1
      )$sql$
  ),
  (
    'booking_crew',
    '60000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000101',
    $sql$insert into public.booking_crew
      (id, service_id, booking_id, cleaner_id, assigned_minutes)
      values (
        '60000000-0000-0000-0000-000000000101',
        'svc-rls',
        '50000000-0000-0000-0000-000000000001',
        'cleaner-rls-b',
        60
      )$sql$
  ),
  (
    'booking_addons',
    '70000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000101',
    $sql$insert into public.booking_addons
      (id, service_id, booking_id, addon_id, minutes, price_cop, sold_at)
      values (
        '70000000-0000-0000-0000-000000000101',
        'svc-rls',
        '50000000-0000-0000-0000-000000000001',
        'addon-rls-inserted',
        15,
        1000,
        'onsite'
      )$sql$
  ),
  (
    'booking_events',
    '80000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000101',
    $sql$insert into public.booking_events
      (id, service_id, booking_id, event)
      values (
        '80000000-0000-0000-0000-000000000101',
        'svc-rls',
        '50000000-0000-0000-0000-000000000001',
        'confirmado'
      )$sql$
  ),
  (
    'cleaner_availability',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000101',
    $sql$insert into public.cleaner_availability
      (id, service_id, cleaner_id, operational_date, source)
      values (
        '90000000-0000-0000-0000-000000000101',
        'svc-rls',
        'cleaner-rls-b',
        '2026-08-06',
        'manual'
      )$sql$
  );

grant select on foundation_rls_cases to anon, authenticated;

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'buildings',
        'bookings',
        'booking_crew',
        'booking_addons',
        'booking_events',
        'cleaner_availability'
      )
      and c.relrowsecurity
  $$,
  array[6::bigint],
  'RLS is enabled on every foundation table'
);

select results_eq(
  $$
    select tablename::text
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'buildings',
        'bookings',
        'booking_crew',
        'booking_addons',
        'booking_events',
        'cleaner_availability'
      )
      and cmd = 'ALL'
      and roles = array['authenticated']::name[]
      and qual ~ 'app_private\.is_crm_admin\(\)'
      and with_check ~ 'app_private\.is_crm_admin\(\)'
    order by tablename
  $$,
  $$
    values
      ('booking_addons'),
      ('booking_crew'),
      ('booking_events'),
      ('bookings'),
      ('buildings'),
      ('cleaner_availability')
  $$,
  'each policy invokes app_private.is_crm_admin() in USING and WITH CHECK'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'buildings',
      'bookings',
      'booking_crew',
      'booking_addons',
      'booking_events',
      'cleaner_availability'
    ]) as table_names(name)
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
  $$,
  array[24::bigint],
  'authenticated receives each CRUD grant on every foundation table'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'buildings',
      'bookings',
      'booking_crew',
      'booking_addons',
      'booking_events',
      'cleaner_availability'
    ]) as table_names(name)
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
  $$,
  array[0::bigint],
  'anon receives none of the individual CRUD grants'
);

insert into auth.users (id, email)
values ('30000000-0000-0000-0000-000000000001', 'admin-foundation@example.test');

insert into public.admin_profiles (id, email, role, is_active)
values (
  '30000000-0000-0000-0000-000000000001',
  'admin-foundation@example.test',
  'admin',
  true
);

insert into public.crm_team_members
  (service_id, id, user_id, name, email)
values
  (
    'svc-rls',
    'cleaner-rls-a',
    'user-rls-a',
    'Cleaner RLS A',
    'cleaner-rls-a@example.test'
  ),
  (
    'svc-rls',
    'cleaner-rls-b',
    'user-rls-b',
    'Cleaner RLS B',
    'cleaner-rls-b@example.test'
  );

insert into public.buildings
  (id, service_id, name, building_type)
values (
  '40000000-0000-0000-0000-000000000001',
  'svc-rls',
  'RLS Seed',
  'edificio'
);

insert into public.bookings
  (id, service_id, appointment_id, status, fulfillment, crew_size)
values (
  '50000000-0000-0000-0000-000000000001',
  'svc-rls',
  'appointment-rls-seed',
  'PENDING',
  'single',
  1
);

insert into public.booking_crew
  (id, service_id, booking_id, cleaner_id, assigned_minutes)
values (
  '60000000-0000-0000-0000-000000000001',
  'svc-rls',
  '50000000-0000-0000-0000-000000000001',
  'cleaner-rls-a',
  60
);

insert into public.booking_addons
  (id, service_id, booking_id, addon_id, minutes, price_cop, sold_at)
values (
  '70000000-0000-0000-0000-000000000001',
  'svc-rls',
  '50000000-0000-0000-0000-000000000001',
  'addon-rls-seed',
  15,
  1000,
  'checkout'
);

insert into public.booking_events
  (id, service_id, booking_id, event)
values (
  '80000000-0000-0000-0000-000000000001',
  'svc-rls',
  '50000000-0000-0000-0000-000000000001',
  'creado'
);

insert into public.cleaner_availability
  (id, service_id, cleaner_id, operational_date, source)
values (
  '90000000-0000-0000-0000-000000000001',
  'svc-rls',
  'cleaner-rls-a',
  '2026-08-05',
  'manual'
);

set local role anon;
select is(
  pg_temp.sqlstate_of(format('select * from public.%I', table_name)),
  '42501',
  format('anon cannot select from %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.sqlstate_of(insert_sql),
  '42501',
  format('anon cannot insert into %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.sqlstate_of(format(
    'update public.%I set id = id where id = %L::uuid',
    table_name,
    seed_id
  )),
  '42501',
  format('anon cannot update %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.sqlstate_of(format(
    'delete from public.%I where id = %L::uuid',
    table_name,
    seed_id
  )),
  '42501',
  format('anon cannot delete from %s', table_name)
)
from foundation_rls_cases;

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000002';
set local "request.jwt.claim.role" = 'authenticated';

select is(
  pg_temp.bigint_result_of(format(
    'select count(*) from public.%I',
    table_name
  )),
  0::bigint,
  format('authenticated non-admin cannot select from %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.sqlstate_of(insert_sql),
  '42501',
  format('authenticated non-admin cannot insert into %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.row_count_of(format(
    'update public.%I set id = id where id = %L::uuid',
    table_name,
    seed_id
  )),
  0::bigint,
  format('authenticated non-admin cannot update %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.row_count_of(format(
    'delete from public.%I where id = %L::uuid',
    table_name,
    seed_id
  )),
  0::bigint,
  format('authenticated non-admin cannot delete from %s', table_name)
)
from foundation_rls_cases;

set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000001';

select is(
  pg_temp.bigint_result_of(format(
    'select count(*) from public.%I',
    table_name
  )),
  1::bigint,
  format('active CRM admin can select from %s', table_name)
)
from foundation_rls_cases;

select lives_ok(
  insert_sql,
  format('active CRM admin can insert into %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.row_count_of(format(
    'update public.%I set id = id where id = %L::uuid',
    table_name,
    inserted_id
  )),
  1::bigint,
  format('active CRM admin can update %s', table_name)
)
from foundation_rls_cases;

select is(
  pg_temp.row_count_of(format(
    'delete from public.%I where id = %L::uuid',
    table_name,
    inserted_id
  )),
  1::bigint,
  format('active CRM admin can delete from %s', table_name)
)
from foundation_rls_cases;

select * from finish();
rollback;
