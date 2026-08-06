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

create temporary table projection_results (
  test_case text primary key,
  result jsonb not null
) on commit drop;

select has_function(
  'public',
  'apply_ops_booking_projection',
  array['jsonb', 'jsonb', 'jsonb', 'jsonb'],
  'projection RPC exists with its contractual signature'
);

select is(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_ops_booking_projection'
      and pg_get_function_identity_arguments(p.oid) =
        'p_booking jsonb, p_crew jsonb, p_addons jsonb, p_events jsonb'
  ),
  false,
  'projection RPC is security invoker'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_ops_booking_projection'
      and pg_get_function_identity_arguments(p.oid) =
        'p_booking jsonb, p_crew jsonb, p_addons jsonb, p_events jsonb'
  ),
  array['search_path=""']::text[],
  'projection RPC fixes an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where n.nspname = 'public'
      and p.proname = 'apply_ops_booking_projection'
      and pg_get_function_identity_arguments(p.oid) =
        'p_booking jsonb, p_crew jsonb, p_addons jsonb, p_events jsonb'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the projection RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.apply_ops_booking_projection(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute the projection RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_ops_booking_projection(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute the projection RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.apply_ops_booking_projection(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute the projection RPC'
);

select is(
  (
    select count(*)
    from unnest(array[
      'bookings',
      'booking_crew',
      'booking_addons',
      'booking_events'
    ]) as table_names(name)
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
  ),
  16::bigint,
  'service_role receives explicit CRUD grants on every projection table'
);

insert into projection_results (test_case, result)
select
  'legacy_inserted',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-legacy",
      "appointment_id": "appointment-legacy",
      "source_revision": 0,
      "source_hash": "4444444444444444444444444444444444444444444444444444444444444444",
      "source_updated_at": null,
      "status": "PENDING",
      "fulfillment": "single",
      "crew_size": 1
    }'::jsonb,
    '[]'::jsonb,
    '[{
      "addon_id": "legacy-addon",
      "minutes": 10,
      "price_cop": 5000,
      "sold_at": "checkout"
    }]'::jsonb,
    '[{
      "event": "creado",
      "payload": {"legacy": true},
      "actor": "system"
    }]'::jsonb
  );

select is(
  (select result ->> 'reason' from projection_results where test_case = 'legacy_inserted'),
  'inserted',
  'legacy revision zero with null source_updated_at is inserted'
);
select results_eq(
  $$
    select source_revision, source_updated_at
    from public.bookings
    where service_id = 'svc-legacy'
      and appointment_id = 'appointment-legacy'
  $$,
  $$values (0::bigint, null::timestamptz)$$,
  'legacy projection preserves revision zero and nullable source_updated_at'
);

insert into projection_results (test_case, result)
select
  'legacy_same_revision',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-legacy",
      "appointment_id": "appointment-legacy",
      "source_revision": 0,
      "source_hash": "4444444444444444444444444444444444444444444444444444444444444444",
      "source_updated_at": null,
      "status": "PENDING",
      "fulfillment": "single",
      "crew_size": 1
    }'::jsonb,
    '[]'::jsonb,
    '[{
      "addon_id": "legacy-addon",
      "minutes": 10,
      "price_cop": 5000,
      "sold_at": "checkout"
    }]'::jsonb,
    '[{
      "event": "creado",
      "payload": {"legacy": true},
      "actor": "system"
    }]'::jsonb
  );

select is(
  (select result ->> 'reason' from projection_results where test_case = 'legacy_same_revision'),
  'same_revision',
  'identical legacy retry is a same-revision no-op'
);
select is(
  (select result ->> 'applied' from projection_results where test_case = 'legacy_same_revision'),
  'false',
  'identical legacy retry reports applied false'
);
select results_eq(
  $$
    select
      (select count(*) from public.bookings where service_id = 'svc-legacy'),
      (select count(*) from public.booking_crew where service_id = 'svc-legacy'),
      (select count(*) from public.booking_addons where service_id = 'svc-legacy'),
      (select count(*) from public.booking_events where service_id = 'svc-legacy')
  $$,
  $$values (1::bigint, 0::bigint, 1::bigint, 1::bigint)$$,
  'identical legacy retry does not duplicate booking or children'
);

insert into public.crm_team_members
  (service_id, id, user_id, name, email)
values
  ('svc-projection', 'cleaner-1', 'projection-user-1', 'Cleaner 1', 'projection-1@example.test'),
  ('svc-projection', 'cleaner-2', 'projection-user-2', 'Cleaner 2', 'projection-2@example.test'),
  ('svc-projection', 'cleaner-3', 'projection-user-3', 'Cleaner 3', 'projection-3@example.test'),
  (
    'svc-service-role',
    'cleaner-service-role',
    'projection-service-role-user',
    'Cleaner Service Role',
    'projection-service-role@example.test'
  );

set local role service_role;

select is(
  (
    public.apply_ops_booking_projection(
      '{
        "service_id": "svc-service-role",
        "appointment_id": "appointment-service-role",
        "source_revision": 1,
        "source_hash": "3333333333333333333333333333333333333333333333333333333333333333",
        "source_updated_at": "2026-08-06T09:59:00Z",
        "status": "CONFIRMED",
        "fulfillment": "single",
        "crew_size": 1
      }'::jsonb,
      '[{
        "cleaner_id": "cleaner-service-role",
        "assigned_minutes": 60,
        "is_lead": true
      }]'::jsonb,
      '[{
        "addon_id": "service-role-addon",
        "minutes": 15,
        "price_cop": 5000,
        "sold_at": "checkout"
      }]'::jsonb,
      '[{
        "event": "confirmado",
        "payload": {"source": "service_role"},
        "actor": "system"
      }]'::jsonb
    ) ->> 'reason'
  ),
  'inserted',
  'service_role executes a complete projection successfully'
);

reset role;

select results_eq(
  $$
    select
      (select count(*) from public.bookings where service_id = 'svc-service-role'),
      (select count(*) from public.booking_crew where service_id = 'svc-service-role'),
      (select count(*) from public.booking_addons where service_id = 'svc-service-role'),
      (select count(*) from public.booking_events where service_id = 'svc-service-role')
  $$,
  $$values (1::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'service_role persists booking and all child projections'
);

insert into projection_results (test_case, result)
select
  'inserted',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 100,
      "source_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "source_created_at": "2026-08-06T10:00:00Z",
      "source_updated_at": "2026-08-06T10:05:00Z",
      "status": "CONFIRMED",
      "required_cleaner_minutes": 180,
      "scheduled_start": "2026-08-07T13:00:00Z",
      "scheduled_end": "2026-08-07T16:00:00Z",
      "fulfillment": "composite",
      "crew_size": 2,
      "client_name": "Cliente V5",
      "payment_status": "PAGO_ACEPTADO",
      "subtotal_cop": 120000,
      "total_cop": 145000,
      "paid_cop": 145000,
      "pending_cop": 0,
      "has_addons": true,
      "addon_total_cop": 25000
    }'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "cleaner_id": "cleaner-1",
        "assigned_minutes": 90,
        "is_lead": true,
        "estimated_marginal_cost_cop": 18000
      },
      {
        "cleaner_id": "cleaner-2",
        "assigned_minutes": 90,
        "is_lead": false,
        "estimated_marginal_cost_cop": 17000
      }
    ]'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "addon_id": "inside-fridge",
        "minutes": 30,
        "price_cop": 25000,
        "sold_at": "checkout"
      }
    ]'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "event": "creado",
        "payload": {"channel": "app"},
        "actor": "client"
      },
      {"event": "confirmado", "payload": {"payment": "approved"}, "actor": "system"}
    ]'::jsonb
  );

select is(
  (select result ->> 'applied' from projection_results where test_case = 'inserted'),
  'true',
  'first projection is applied'
);
select is(
  (select result ->> 'reason' from projection_results where test_case = 'inserted'),
  'inserted',
  'first projection reports inserted'
);
select is(
  (select (result ->> 'source_revision')::bigint from projection_results where test_case = 'inserted'),
  100::bigint,
  'first projection reports the incoming revision'
);
select is(
  (
    select result ->> 'booking_id'
    from projection_results
    where test_case = 'inserted'
  ),
  (
    select id::text
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  ),
  'first projection returns the resolved booking id'
);
select is(
  (
    select total_cop
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  ),
  145000::bigint,
  'first projection persists the known booking total'
);
select is(
  (
    select count(*)
    from public.booking_crew
    where service_id = 'svc-projection'
  ),
  2::bigint,
  'first projection inserts the full crew snapshot'
);
select is(
  (
    select sum(estimated_marginal_cost_cop)
    from public.booking_crew
    where service_id = 'svc-projection'
  ),
  35000::numeric,
  'first projection preserves known crew costs'
);
select is(
  (
    select count(*)
    from public.booking_addons
    where service_id = 'svc-projection'
  ),
  1::bigint,
  'first projection inserts the addon snapshot'
);
select is(
  (
    select count(*)
    from public.booking_events
    where service_id = 'svc-projection'
  ),
  2::bigint,
  'first projection inserts the event snapshot'
);
select is(
  (
    select count(*)
    from (
      select service_id, booking_id from public.booking_crew
      union all
      select service_id, booking_id from public.booking_addons
      union all
      select service_id, booking_id from public.booking_events
    ) as children
    where service_id is distinct from 'svc-projection'
      or booking_id is distinct from (
        select id
        from public.bookings
        where service_id = 'svc-projection'
          and appointment_id = 'appointment-1'
      )
  ),
  0::bigint,
  'all children are forced onto the resolved booking and service'
);
select results_eq(
  $$
    select
      (id is not null)
      and (created_at is not null)
      and (updated_at is not null)
    from public.booking_crew
    where service_id = 'svc-projection'
    order by cleaner_id
  $$,
  $$values (true), (true)$$,
  'crew rows receive generated ids and timestamps'
);
select results_eq(
  $$
    select (id is not null) and (created_at is not null) and (updated_at is not null)
    from public.booking_addons
    where service_id = 'svc-projection'
  $$,
  $$values (true)$$,
  'addon rows receive generated ids and timestamps'
);
select results_eq(
  $$
    select (id is not null) and (created_at is not null)
    from public.booking_events
    where service_id = 'svc-projection'
    order by event
  $$,
  $$values (true), (true)$$,
  'event rows receive generated ids and timestamps'
);

insert into projection_results (test_case, result)
select
  'same_revision',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 100,
      "source_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "source_created_at": "2026-08-06T10:00:00Z",
      "source_updated_at": "2026-08-06T10:05:00Z",
      "status": "CONFIRMED",
      "required_cleaner_minutes": 180,
      "scheduled_start": "2026-08-07T13:00:00Z",
      "scheduled_end": "2026-08-07T16:00:00Z",
      "fulfillment": "composite",
      "crew_size": 2,
      "client_name": "Cliente V5",
      "payment_status": "PAGO_ACEPTADO",
      "subtotal_cop": 120000,
      "total_cop": 145000,
      "paid_cop": 145000,
      "pending_cop": 0,
      "has_addons": true,
      "addon_total_cop": 25000
    }'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "cleaner_id": "cleaner-1",
        "assigned_minutes": 90,
        "is_lead": true,
        "estimated_marginal_cost_cop": 18000
      },
      {
        "cleaner_id": "cleaner-2",
        "assigned_minutes": 90,
        "is_lead": false,
        "estimated_marginal_cost_cop": 17000
      }
    ]'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "addon_id": "inside-fridge",
        "minutes": 30,
        "price_cop": 25000,
        "sold_at": "checkout"
      }
    ]'::jsonb,
    '[
      {
        "service_id": "svc-projection",
        "booking_id": "99999999-9999-9999-9999-999999999999",
        "event": "creado",
        "payload": {"channel": "app"},
        "actor": "client"
      },
      {"event": "confirmado", "payload": {"payment": "approved"}, "actor": "system"}
    ]'::jsonb
  );

select is(
  (select result ->> 'reason' from projection_results where test_case = 'same_revision'),
  'same_revision',
  'identical revision and hash is a no-op'
);
select is(
  (select result ->> 'applied' from projection_results where test_case = 'same_revision'),
  'false',
  'identical retry reports applied false'
);
select is(
  (
    select total_cop
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  ),
  145000::bigint,
  'identical retry does not overwrite booking data'
);
select results_eq(
  $$
    select
      (select count(*) from public.booking_crew where service_id = 'svc-projection'),
      (select count(*) from public.booking_addons where service_id = 'svc-projection'),
      (select count(*) from public.booking_events where service_id = 'svc-projection')
  $$,
  $$values (2::bigint, 1::bigint, 2::bigint)$$,
  'identical retry does not delete or duplicate children'
);

insert into projection_results (test_case, result)
select
  'stale_revision',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 99,
      "source_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "source_updated_at": "2026-08-06T10:04:00Z",
      "status": "CANCELED",
      "fulfillment": "single",
      "crew_size": 1,
      "total_cop": 0
    }'::jsonb
  );

select is(
  (select result from projection_results where test_case = 'stale_revision'),
  (
    select pg_catalog.jsonb_build_object(
      'booking_id', id,
      'applied', false,
      'reason', 'stale_revision',
      'source_revision', 99
    )
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  ),
  'older revision returns the complete no-op response'
);
select results_eq(
  $$
    select source_revision, status, total_cop
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  $$,
  $$values (100::bigint, 'CONFIRMED'::text, 145000::bigint)$$,
  'older revision does not revert the current booking'
);

insert into projection_results (test_case, result)
select
  'revision_conflict',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 100,
      "source_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "source_updated_at": "2026-08-06T10:05:00Z",
      "status": "CANCELED",
      "fulfillment": "single",
      "crew_size": 1,
      "total_cop": 0
    }'::jsonb
  );

select is(
  (select result from projection_results where test_case = 'revision_conflict'),
  (
    select pg_catalog.jsonb_build_object(
      'booking_id', id,
      'applied', false,
      'reason', 'revision_conflict',
      'source_revision', 100
    )
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  ),
  'revision conflict returns the complete no-op response'
);
select results_eq(
  $$
    select
      source_revision,
      source_hash,
      status,
      (select count(*) from public.booking_crew where service_id = 'svc-projection'),
      (select count(*) from public.booking_events where service_id = 'svc-projection')
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  $$,
  $$values (
    100::bigint,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'::text,
    'CONFIRMED'::text,
    2::bigint,
    2::bigint
  )$$,
  'revision conflict leaves booking and children untouched'
);

insert into projection_results (test_case, result)
select
  'updated',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 101,
      "source_hash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "source_updated_at": "2026-08-06T10:06:00Z",
      "status": "COMPLETED",
      "required_cleaner_minutes": 120,
      "fulfillment": "single",
      "crew_size": 1,
      "payment_status": "PAGO_ACEPTADO",
      "subtotal_cop": 150000,
      "total_cop": 180000,
      "paid_cop": 180000,
      "pending_cop": 0,
      "has_addons": true,
      "addon_total_cop": 30000
    }'::jsonb,
    '[
      {
        "cleaner_id": "cleaner-3",
        "assigned_minutes": 120,
        "is_lead": true,
        "estimated_marginal_cost_cop": 26000
      }
    ]'::jsonb,
    '[
      {"addon_id": "oven", "minutes": 20, "price_cop": 12000, "sold_at": "onsite"},
      {"addon_id": "windows", "minutes": 30, "price_cop": 18000, "sold_at": "rebook"}
    ]'::jsonb,
    '[
      {"event": "finalizado", "payload": {"rating": 5}, "actor": "cleaner-3"}
    ]'::jsonb
  );

select is(
  (select result ->> 'reason' from projection_results where test_case = 'updated'),
  'updated',
  'newer revision reports updated'
);
select is(
  (select result ->> 'applied' from projection_results where test_case = 'updated'),
  'true',
  'newer revision is applied'
);
select results_eq(
  $$
    select source_revision, status, total_cop
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  $$,
  $$values (101::bigint, 'COMPLETED'::text, 180000::bigint)$$,
  'newer revision replaces the booking projection'
);
select results_eq(
  $$
    select cleaner_id, assigned_minutes, estimated_marginal_cost_cop
    from public.booking_crew
    where service_id = 'svc-projection'
  $$,
  $$values ('cleaner-3'::text, 120, 26000::bigint)$$,
  'newer revision replaces the crew snapshot'
);
select results_eq(
  $$
    select count(*), sum(minutes), sum(price_cop)
    from public.booking_addons
    where service_id = 'svc-projection'
  $$,
  $$values (2::bigint, 50::bigint, 30000::numeric)$$,
  'newer revision replaces addons without duplicate totals'
);
select results_eq(
  $$
    select count(*), min(event)
    from public.booking_events
    where service_id = 'svc-projection'
  $$,
  $$values (1::bigint, 'finalizado'::text)$$,
  'newer revision replaces the event snapshot'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-1",
        "source_revision": 102,
        "source_hash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "source_updated_at": "2026-08-06T10:07:00Z",
        "status": "CONFIRMED",
        "fulfillment": "single",
        "crew_size": 1,
        "total_cop": 190000
      }'::jsonb,
      '[{
        "cleaner_id": "cleaner-1",
        "assigned_minutes": 120,
        "is_lead": false
      }]'::jsonb,
      '[{
        "addon_id": "zero-lead-addon",
        "minutes": 10,
        "price_cop": 10000,
        "sold_at": "onsite"
      }]'::jsonb,
      '[{
        "event": "reasignado",
        "payload": {"reason": "zero lead"},
        "actor": "system"
      }]'::jsonb
    )
  $sql$),
  '22023',
  'non-empty crew with zero leads is rejected'
);
select results_eq(
  $$
    select
      source_revision,
      status,
      total_cop,
      (select count(*) from public.booking_crew where service_id = 'svc-projection'),
      (select min(cleaner_id) from public.booking_crew where service_id = 'svc-projection'),
      (select count(*) from public.booking_addons where service_id = 'svc-projection'),
      (select sum(price_cop) from public.booking_addons where service_id = 'svc-projection'),
      (select count(*) from public.booking_events where service_id = 'svc-projection'),
      (select min(event) from public.booking_events where service_id = 'svc-projection')
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  $$,
  $$values (
    101::bigint,
    'COMPLETED'::text,
    180000::bigint,
    1::bigint,
    'cleaner-3'::text,
    2::bigint,
    30000::numeric,
    1::bigint,
    'finalizado'::text
  )$$,
  'zero-lead rejection rolls back booking and every child snapshot'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-cross-service",
        "source_revision": 1,
        "source_hash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        "source_updated_at": "2026-08-06T11:00:00Z"
      }'::jsonb,
      '[{"service_id": "svc-other", "cleaner_id": "cleaner-1"}]'::jsonb
    )
  $sql$),
  '22023',
  'explicit child service mismatch is rejected'
);
select is(
  (
    select count(*)
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-cross-service'
  ),
  0::bigint,
  'child service mismatch rolls back the booking'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-invalid-status",
        "source_revision": 1,
        "source_hash": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "source_updated_at": "2026-08-06T11:01:00Z",
        "status": "DONE"
      }'::jsonb
    )
  $sql$),
  '23514',
  'invalid booking status is rejected by the schema'
);
select is(
  (
    select count(*)
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-invalid-status'
  ),
  0::bigint,
  'invalid booking status leaves no partial booking'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-1",
        "source_revision": 102,
        "source_hash": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "source_updated_at": "2026-08-06T11:02:00Z",
        "status": "CONFIRMED",
        "fulfillment": "composite",
        "crew_size": 2
      }'::jsonb,
      '[
        {"cleaner_id": "cleaner-1", "is_lead": true},
        {"cleaner_id": "cleaner-2", "is_lead": true}
      ]'::jsonb
    )
  $sql$),
  '22023',
  'two crew leads are rejected'
);
select results_eq(
  $$
    select
      source_revision,
      status,
      (select count(*) from public.booking_crew where service_id = 'svc-projection'),
      (select min(cleaner_id) from public.booking_crew where service_id = 'svc-projection')
    from public.bookings
    where service_id = 'svc-projection'
      and appointment_id = 'appointment-1'
  $$,
  $$values (101::bigint, 'COMPLETED'::text, 1::bigint, 'cleaner-3'::text)$$,
  'child constraint failure rolls back booking and child replacement'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-invalid-arrays",
        "source_revision": 1,
        "source_hash": "1111111111111111111111111111111111111111111111111111111111111111",
        "source_updated_at": "2026-08-06T11:03:00Z"
      }'::jsonb,
      '{}'::jsonb
    )
  $sql$),
  '22023',
  'non-array child payload is rejected'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '[]'::jsonb
    )
  $sql$),
  '22023',
  'non-object booking payload is rejected'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.apply_ops_booking_projection(
      '{
        "service_id": "svc-projection",
        "appointment_id": "appointment-missing-required"
      }'::jsonb
    )
  $sql$),
  '22023',
  'booking missing projection metadata is rejected'
);

insert into projection_results (test_case, result)
select
  'empty_children',
  public.apply_ops_booking_projection(
    '{
      "service_id": "svc-projection",
      "appointment_id": "appointment-1",
      "source_revision": 103,
      "source_hash": "2222222222222222222222222222222222222222222222222222222222222222",
      "source_updated_at": "2026-08-06T11:04:00Z",
      "status": "CANCELED",
      "fulfillment": "single",
      "crew_size": 1
    }'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );

select is(
  (select result ->> 'reason' from projection_results where test_case = 'empty_children'),
  'updated',
  'newer projection with empty arrays is applied'
);
select results_eq(
  $$
    select
      (select count(*) from public.booking_crew where service_id = 'svc-projection'),
      (select count(*) from public.booking_addons where service_id = 'svc-projection'),
      (select count(*) from public.booking_events where service_id = 'svc-projection')
  $$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$,
  'empty arrays remove all existing children'
);

select * from finish();
rollback;
