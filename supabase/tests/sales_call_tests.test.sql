begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select has_table('public', 'sales_call_tests', 'sales_call_tests exists');
select has_table('public', 'sales_call_test_events', 'sales_call_test_events exists');
select has_pk('public', 'sales_call_tests', 'conversation id is the key');

select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sales_call_tests'),
  'rls on sales_call_tests'
);

select is_empty(
  $$ select 1 from pg_policies where schemaname = 'public' and tablename = 'sales_call_tests' $$,
  'sales_call_tests has no browser policies'
);

select * from finish();
rollback;
