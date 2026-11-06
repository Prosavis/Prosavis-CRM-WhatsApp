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

create temporary table affinity_rpcs (
  signature text primary key
) on commit drop;

insert into affinity_rpcs (signature)
values
  ('public.crm_directory_set_cleaner_affinity(uuid,text,jsonb)'),
  ('public.crm_directory_append_cleaner_affinity_override(uuid,text,jsonb)'),
  ('public.crm_directory_rekey_cleaner_affinity(text,text)'),
  ('public.crm_directory_get_cleaner_affinity(uuid[])');

-- Esquema y permisos

select has_table('public', 'crm_client_cleaner_affinity', 'affinity table exists');
select col_type_is(
  'public', 'crm_client_cleaner_affinity', 'directory_id', 'uuid',
  'directory_id matches crm_directory.id (uuid)'
);
select col_is_pk(
  'public', 'crm_client_cleaner_affinity', array['directory_id', 'member_id'],
  'primary key is (directory_id, member_id)'
);
select has_index(
  'public', 'crm_client_cleaner_affinity', 'crm_client_cleaner_affinity_member_idx',
  array['member_id'],
  'member_id index exists for rekey and per-member summaries'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.crm_client_cleaner_affinity'::regclass),
  'RLS is enabled on the affinity table'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_client_cleaner_affinity'
  ),
  0::bigint,
  'affinity table has no policies'
);

select is(
  (
    select count(*)::bigint
    from unnest(array['anon', 'authenticated']) as roles(role_name)
    cross join unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) as privileges(privilege)
    where has_table_privilege(role_name, 'public.crm_client_cleaner_affinity', privilege)
  ),
  0::bigint,
  'anon and authenticated hold no table privilege on the affinity table'
);
select ok(
  has_table_privilege('service_role', 'public.crm_client_cleaner_affinity', 'SELECT')
    and has_table_privilege('service_role', 'public.crm_client_cleaner_affinity', 'INSERT')
    and has_table_privilege('service_role', 'public.crm_client_cleaner_affinity', 'UPDATE')
    and has_table_privilege('service_role', 'public.crm_client_cleaner_affinity', 'DELETE'),
  'service_role holds CRUD on the affinity table'
);

select ok(
  (
    select p.prosecdef
      and p.proconfig = array['search_path=public']::text[]
    from pg_proc p
    where p.oid = signature::regprocedure
  ),
  format('%s is security definer with search_path=public', signature)
)
from affinity_rpcs;

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = signature::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  format('PUBLIC cannot execute %s', signature)
)
from affinity_rpcs;

select ok(
  not has_function_privilege('anon', signature, 'EXECUTE'),
  format('anon cannot execute %s', signature)
)
from affinity_rpcs;

select ok(
  not has_function_privilege('authenticated', signature, 'EXECUTE'),
  format('authenticated cannot execute %s', signature)
)
from affinity_rpcs;

select ok(
  has_function_privilege('service_role', signature, 'EXECUTE'),
  format('service_role can execute %s', signature)
)
from affinity_rpcs;

-- Datos

insert into public.crm_directory (id, full_name, phone, source, channels)
values
  ('a7000000-0000-4000-8000-000000000001', 'AFINIDAD UNO', '+573000000701', 'LEAD', array['WHATSAPP']),
  ('a7000000-0000-4000-8000-000000000002', 'AFINIDAD DOS', '+573000000702', 'LEAD', array['WHATSAPP']),
  ('a7000000-0000-4000-8000-000000000003', 'AFINIDAD TRES', '+573000000703', 'LEAD', array['WHATSAPP']),
  ('a7000000-0000-4000-8000-000000000004', 'AFINIDAD CUATRO', '+573000000704', 'LEAD', array['WHATSAPP']),
  ('a7000000-0000-4000-8000-000000000005', 'AFINIDAD CINCO', '+573000000705', 'LEAD', array['WHATSAPP']);

-- set

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000001',
    'member-a',
    '{"verdict":"favorita","source":"cliente","note":"Pidió que sea ella","setAt":"2026-11-01T10:00:00.000Z"}'
  ),
  '{"member-a":{"verdict":"favorita","source":"cliente","note":"Pidió que sea ella","setAt":"2026-11-01T10:00:00.000Z"}}'::jsonb,
  'set returns the full map with the new entry'
);

select is(
  (
    select array_agg(k order by k)
    from jsonb_object_keys(public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000001',
      'member-b',
      '{"verdict":"no_enviar","source":"prosavis","note":"Cliente reporta retraso el 21 oct","setAt":"2026-11-02T10:00:00.000Z"}'
    )) as keys(k)
  ),
  array['member-a', 'member-b'],
  'set on a second member returns both keys'
);

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000002',
    'member-a',
    '{"verdict":"normal","source":"prosavis","note":"Solo nota","setAt":"2026-11-02T10:00:00.000Z"}'
  ) ? 'member-b',
  false,
  'map is scoped to one directory'
);

-- overrides: append, preserve on set, replace when provided

select is(
  jsonb_array_length(public.crm_directory_append_cleaner_affinity_override(
    'a7000000-0000-4000-8000-000000000001',
    'member-b',
    '{"appointmentId":"appt-1","reason":"No había otra disponible","byUid":"uid-x","byName":"X","at":"2026-11-03T08:00:00.000Z"}'
  ) -> 'overrides'),
  1,
  'append creates the overrides array on an existing entry'
);

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000001',
    'member-b',
    '{"verdict":"no_enviar","source":"prosavis","note":"Nota corregida por Francy","setAt":"2026-11-04T10:00:00.000Z"}'
  ) -> 'member-b',
  '{"verdict":"no_enviar","source":"prosavis","note":"Nota corregida por Francy","setAt":"2026-11-04T10:00:00.000Z","overrides":[{"appointmentId":"appt-1","reason":"No había otra disponible","byUid":"uid-x","byName":"X","at":"2026-11-03T08:00:00.000Z"}]}'::jsonb,
  'set without overrides key preserves the existing overrides'
);

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000001',
    'member-b',
    '{"verdict":"no_enviar","source":"prosavis","note":"Nota corregida por Francy","setAt":"2026-11-04T11:00:00.000Z","overrides":[]}'
  ) -> 'member-b' -> 'overrides',
  '[]'::jsonb,
  'set with an explicit overrides key replaces them'
);

do $$
begin
  for n in 1..12 loop
    perform public.crm_directory_append_cleaner_affinity_override(
      'a7000000-0000-4000-8000-000000000001',
      'member-b',
      jsonb_build_object(
        'appointmentId', format('appt-%s', n),
        'reason', format('Motivo número %s', n),
        'byUid', 'uid-x',
        'byName', 'X',
        'at', format('2026-11-05T%s:00:00.000Z', lpad(n::text, 2, '0'))
      )
    );
  end loop;
end;
$$;

select is(
  (
    select jsonb_array_length(entry -> 'overrides')
    from public.crm_client_cleaner_affinity
    where directory_id = 'a7000000-0000-4000-8000-000000000001'
      and member_id = 'member-b'
  ),
  10,
  'overrides are capped at 10'
);

select is(
  (
    select array_agg(o ->> 'appointmentId' order by ord)
    from public.crm_client_cleaner_affinity a
    cross join lateral jsonb_array_elements(a.entry -> 'overrides') with ordinality as x(o, ord)
    where a.directory_id = 'a7000000-0000-4000-8000-000000000001'
      and a.member_id = 'member-b'
  ),
  array['appt-12', 'appt-11', 'appt-10', 'appt-9', 'appt-8', 'appt-7', 'appt-6', 'appt-5', 'appt-4', 'appt-3'],
  'overrides keep the most recent first and drop the oldest'
);

select is(
  public.crm_directory_append_cleaner_affinity_override(
    'a7000000-0000-4000-8000-000000000001',
    'member-missing',
    '{"appointmentId":null,"reason":"Asignada sin entrada","byUid":"uid-x","byName":"X","at":"2026-11-05T08:00:00.000Z"}'
  ),
  null::jsonb,
  'append on a missing entry returns null'
);

select is(
  (
    select count(*)::bigint
    from public.crm_client_cleaner_affinity
    where member_id = 'member-missing'
  ),
  0::bigint,
  'append on a missing entry creates nothing'
);

-- borrar con null

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000001',
    'member-a',
    null
  ) ? 'member-a',
  false,
  'set with null entry deletes the member'
);

select is(
  public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000005',
    'member-a',
    null
  ),
  '{}'::jsonb,
  'deleting from a directory without entries returns an empty map'
);

-- validaciones

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000001', '   ', '{"verdict":"favorita"}'
    )
  $sql$),
  '22023',
  'set rejects a blank member id'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000001', 'member-a', '["favorita"]'
    )
  $sql$),
  '22023',
  'set rejects a non-object entry'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000001', 'member-a', '{"verdict":"favorita","overrides":{}}'
    )
  $sql$),
  '22023',
  'set rejects a non-array overrides value'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-0000000000ff', 'member-a', '{"verdict":"favorita"}'
    )
  $sql$),
  'P0002',
  'set rejects an unknown directory'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_append_cleaner_affinity_override(
      'a7000000-0000-4000-8000-000000000001', '', '{"reason":"Motivo válido"}'
    )
  $sql$),
  '22023',
  'append rejects a blank member id'
);

select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_append_cleaner_affinity_override(
      'a7000000-0000-4000-8000-000000000001', 'member-b', '"texto"'
    )
  $sql$),
  '22023',
  'append rejects a non-object override'
);

-- rekey

do $$
begin
  perform public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000002',
    'manual-1',
    '{"verdict":"favorita","source":"cliente","note":null,"setAt":"2026-10-01T10:00:00.000Z"}'
  );

  perform public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000003',
    'manual-1',
    '{"verdict":"no_enviar","source":"prosavis","note":"Gana por ser la más reciente","setAt":"2026-10-20T10:00:00.000Z"}'
  );
  perform public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000003',
    'uid-1',
    '{"verdict":"favorita","source":"cliente","note":null,"setAt":"2026-10-10T10:00:00.000Z"}'
  );

  perform public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000004',
    'manual-1',
    '{"verdict":"favorita","source":"cliente","note":"Sin fecha, cuenta como vieja"}'
  );
  perform public.crm_directory_set_cleaner_affinity(
    'a7000000-0000-4000-8000-000000000004',
    'uid-1',
    '{"verdict":"normal","source":"prosavis","note":"Se conserva","setAt":"2026-09-01T10:00:00.000Z"}'
  );
end;
$$;

select is(
  public.crm_directory_rekey_cleaner_affinity('manual-1', 'manual-1'),
  0,
  'rekey to the same id is a no-op'
);
select is(
  public.crm_directory_rekey_cleaner_affinity('  ', 'uid-1'),
  0,
  'rekey from a blank id is a no-op'
);
select is(
  public.crm_directory_rekey_cleaner_affinity('manual-1', null),
  0,
  'rekey to a null id is a no-op'
);

select is(
  public.crm_directory_rekey_cleaner_affinity('manual-1', 'uid-1'),
  3,
  'rekey reports every directory it touched'
);

select is(
  (
    select count(*)::bigint
    from public.crm_client_cleaner_affinity
    where member_id = 'manual-1'
  ),
  0::bigint,
  'rekey leaves no row under the old id'
);

select is(
  (
    select entry ->> 'setAt'
    from public.crm_client_cleaner_affinity
    where directory_id = 'a7000000-0000-4000-8000-000000000002'
      and member_id = 'uid-1'
  ),
  '2026-10-01T10:00:00.000Z',
  'rekey renames the entry when the target id is free'
);

select is(
  (
    select entry ->> 'note'
    from public.crm_client_cleaner_affinity
    where directory_id = 'a7000000-0000-4000-8000-000000000003'
      and member_id = 'uid-1'
  ),
  'Gana por ser la más reciente',
  'rekey conflict keeps the newer source entry'
);

select is(
  (
    select entry ->> 'note'
    from public.crm_client_cleaner_affinity
    where directory_id = 'a7000000-0000-4000-8000-000000000004'
      and member_id = 'uid-1'
  ),
  'Se conserva',
  'rekey conflict treats a missing setAt as the oldest'
);

select is(
  public.crm_directory_rekey_cleaner_affinity('manual-1', 'uid-1'),
  0,
  'second rekey finds nothing to move'
);

-- lectura

select is(
  (
    select array_agg(format('%s:%s', right(directory_id::text, 1), member_id) order by directory_id, member_id)
    from public.crm_directory_get_cleaner_affinity(array[
      'a7000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000003'
    ]::uuid[])
  ),
  array['1:member-b', '3:uid-1'],
  'get returns the rows of the requested directories only'
);

select is(
  (select count(*)::bigint from public.crm_directory_get_cleaner_affinity(null)),
  0::bigint,
  'get with null ids returns nothing'
);

-- cascada

delete from public.crm_directory where id = 'a7000000-0000-4000-8000-000000000004';

select is(
  (
    select count(*)::bigint
    from public.crm_client_cleaner_affinity
    where directory_id = 'a7000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'deleting the directory removes its affinity rows'
);

-- roles

set local role anon;

select is(
  pg_temp.sqlstate_of('select * from public.crm_client_cleaner_affinity'),
  '42501',
  'anon cannot select the affinity table'
);
select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000001', 'member-z', '{"verdict":"favorita"}'
    )
  $sql$),
  '42501',
  'anon cannot call set'
);
select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_get_cleaner_affinity(array['a7000000-0000-4000-8000-000000000001']::uuid[])
  $sql$),
  '42501',
  'anon cannot call get'
);

reset role;
set local role authenticated;

select is(
  pg_temp.sqlstate_of('select * from public.crm_client_cleaner_affinity'),
  '42501',
  'authenticated cannot select the affinity table'
);
select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_append_cleaner_affinity_override(
      'a7000000-0000-4000-8000-000000000001', 'member-b', '{"reason":"Intento sin permiso"}'
    )
  $sql$),
  '42501',
  'authenticated cannot call append'
);
select is(
  pg_temp.sqlstate_of($sql$
    select public.crm_directory_rekey_cleaner_affinity('member-b', 'member-c')
  $sql$),
  '42501',
  'authenticated cannot call rekey'
);

reset role;
set local role service_role;

select is(
  pg_temp.bigint_result_of('select count(*) from public.crm_client_cleaner_affinity'),
  4::bigint,
  'service_role can select the affinity table'
);
select lives_ok(
  $sql$
    select public.crm_directory_set_cleaner_affinity(
      'a7000000-0000-4000-8000-000000000005', 'member-s', '{"verdict":"favorita","setAt":"2026-11-06T10:00:00.000Z"}'
    )
  $sql$,
  'service_role can call set'
);

reset role;

select * from finish();
rollback;
