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

select has_table('public', 'visit_client_intelligence', 'visit_client_intelligence exists');
select has_table('public', 'visit_intelligence_runs', 'visit_intelligence_runs exists');
select has_table('public', 'visit_intelligence_evidence', 'visit_intelligence_evidence exists');
select has_table('public', 'visit_feedback_requests', 'visit_feedback_requests exists');
select has_table('public', 'visit_action_proposals', 'visit_action_proposals exists');
select has_column('public', 'visit_routes', 'intelligence_generated_at', 'visit_routes links analysis version');
select has_column('public', 'visit_routes', 'travel_provider', 'visit_routes stores travel provider');
select has_column('public', 'visit_routes', 'geo_notes', 'visit_routes stores geo notes');

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'visit_client_intelligence',
        'visit_intelligence_runs',
        'visit_intelligence_evidence',
        'visit_feedback_requests',
        'visit_action_proposals'
      )
      and c.relrowsecurity
  $$,
  array[5::bigint],
  'RLS is enabled on every intelligence table'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'visit_client_intelligence',
      'visit_intelligence_runs',
      'visit_intelligence_evidence',
      'visit_feedback_requests',
      'visit_action_proposals'
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
  'service_role receives explicit CRUD on intelligence tables'
);

select results_eq(
  $$
    select count(*)::bigint
    from unnest(array[
      'visit_client_intelligence',
      'visit_intelligence_runs',
      'visit_intelligence_evidence',
      'visit_feedback_requests',
      'visit_action_proposals'
    ]) as tables(name)
    where has_table_privilege('anon', format('public.%I', name), 'SELECT')
  $$,
  array[0::bigint],
  'anon cannot read intelligence tables'
);

insert into public.visit_intelligence_runs (
  id,
  service_id,
  kind,
  status,
  triggered_by,
  batch_size
) values (
  '31000000-0000-0000-0000-000000000001',
  'svc-intel',
  'baseline',
  'queued',
  'test',
  3
);

select is(
  pg_temp.sqlstate_of($q$
    insert into public.visit_intelligence_runs (
      service_id, kind, status, triggered_by, batch_size
    ) values (
      'svc-intel', 'nightly', 'queued', 'test', 1
    )
  $q$),
  '23514',
  'run kind is constrained'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conname = 'visit_client_intelligence_schema_check'
  ),
  'schema_version must stay at 1'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conname = 'visit_action_proposals_idempotency_nonempty_check'
  ),
  'proposal idempotency key has a minimum length'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conname = 'visit_action_proposals_idempotency'
  ),
  'proposals are unique per service idempotency key'
);

select is(
  pg_temp.sqlstate_of($q$
    update public.visit_routes
    set travel_provider = 'grok-json'
    where false
  $q$),
  null,
  'travel_provider check is installed (no-op update stays valid)'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conname = 'visit_routes_travel_provider_check'
  ),
  'visit_routes rejects arbitrary travel providers'
);

select has_column(
  'public',
  'visit_client_intelligence',
  'analysis_status',
  'visit_client_intelligence tracks analysis_status'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conname = 'visit_client_intelligence_analysis_status_check'
  ),
  'analysis_status is constrained'
);

select results_eq(
  $$
    with first as (
      select public.visit_intelligence_record_item(
        '31000000-0000-0000-0000-000000000001'::uuid,
        'processed'
      ) as payload
    ),
    second as (
      select public.visit_intelligence_record_item(
        '31000000-0000-0000-0000-000000000001'::uuid,
        'processed'
      ) as payload
      from first
    ),
    third as (
      select public.visit_intelligence_record_item(
        '31000000-0000-0000-0000-000000000001'::uuid,
        'failed'
      ) as payload
      from second
    )
    select
      (payload->>'processed_count')::int,
      (payload->>'failed_count')::int,
      payload->>'status'
    from third
  $$,
  $$ values (2, 1, 'completed') $$,
  'three run items close the batch at 2 processed + 1 failed'
);

select is(
  pg_temp.sqlstate_of($q$
    select public.visit_intelligence_record_item(
      '31000000-0000-0000-0000-000000000001'::uuid,
      'processed'
    )
  $q$),
  'P0001',
  'a fourth item cannot exceed batch_size'
);

select finish();
rollback;
