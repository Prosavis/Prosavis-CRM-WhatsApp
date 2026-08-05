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
    select count(*)::bigint
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
      and qual is not null
      and with_check is not null
  $$,
  array[6::bigint],
  'each admin CRUD policy has USING and WITH CHECK'
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
    where has_table_privilege(
      'authenticated',
      format('public.%I', name),
      'SELECT, INSERT, UPDATE, DELETE'
    )
  $$,
  array[6::bigint],
  'authenticated receives explicit CRUD grants'
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
    where has_table_privilege(
      'anon',
      format('public.%I', name),
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  $$,
  array[0::bigint],
  'anon receives no foundation table privileges'
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

insert into public.buildings
  (id, service_id, name, building_type)
values (
  '40000000-0000-0000-0000-000000000001',
  'svc-rls',
  'RLS Seed',
  'edificio'
);

set local role anon;
select is(
  pg_temp.sqlstate_of($$select * from public.buildings$$),
  '42501',
  'anon cannot read buildings'
);
select is(
  pg_temp.sqlstate_of($$insert into public.buildings
    (service_id, name, building_type)
    values ('svc-rls', 'Anon write', 'edificio')$$),
  '42501',
  'anon cannot write buildings'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000002';
set local "request.jwt.claim.role" = 'authenticated';

select results_eq(
  $$select count(*) from public.buildings$$,
  array[0::bigint],
  'authenticated non-admin cannot read buildings'
);
select is(
  pg_temp.sqlstate_of($$insert into public.buildings
    (service_id, name, building_type)
    values ('svc-rls', 'Non-admin write', 'edificio')$$),
  '42501',
  'authenticated non-admin cannot write buildings'
);

set local "request.jwt.claim.sub" = '30000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.buildings$$,
  array[1::bigint],
  'active CRM admin can read buildings'
);
select lives_ok(
  $$insert into public.buildings
    (id, service_id, name, building_type)
    values (
      '40000000-0000-0000-0000-000000000002',
      'svc-rls',
      'Admin CRUD',
      'edificio'
    )$$,
  'active CRM admin can insert buildings'
);
select lives_ok(
  $$update public.buildings
    set name = 'Admin updated'
    where id = '40000000-0000-0000-0000-000000000002'$$,
  'active CRM admin can update buildings'
);
select lives_ok(
  $$delete from public.buildings
    where id = '40000000-0000-0000-0000-000000000002'$$,
  'active CRM admin can delete buildings'
);

select * from finish();
rollback;
