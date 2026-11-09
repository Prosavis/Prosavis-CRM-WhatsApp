-- El encabezado del inbox lee los tags del directorio. Sin esta publicación
-- el chip se queda con la ficha anterior hasta que vence la caché.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_directory'
  ) then
    alter publication supabase_realtime add table public.crm_directory;
  end if;
end $$;
