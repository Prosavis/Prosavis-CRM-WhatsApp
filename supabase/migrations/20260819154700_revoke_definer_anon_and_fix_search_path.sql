-- Lock down public SECURITY DEFINER execute from anon/PUBLIC.
-- Keep authenticated + service_role so the CRM panel and Edge Functions still work.
-- Also pin search_path on public functions that still have it mutable.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        p.proconfig is null
        or not exists (
          select 1
          from unnest(p.proconfig) as c(cfg)
          where c.cfg like 'search_path=%'
        )
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end
$$;
