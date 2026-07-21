-- Presence multi-admin moved to Supabase Realtime Presence (ephemeral).
-- Stop publishing postgres_changes for whatsapp_admin_presence; keep the table for rollback.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_admin_presence'
  ) then
    alter publication supabase_realtime drop table public.whatsapp_admin_presence;
  end if;
end $$;
