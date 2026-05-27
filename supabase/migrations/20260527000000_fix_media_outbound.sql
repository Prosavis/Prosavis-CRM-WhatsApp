-- Fase: Corrección de envío de archivos multimedia salientes
-- Garantiza que los objetos del bucket whatsapp-media sean accesibles vía signed URLs
-- y que los MIME types necesarios estén permitidos

-- 1. Asegurar que el bucket whatsapp-media acepte TODOS los formatos de Meta
update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = null
where id = 'whatsapp-media';

-- 2. Asegurar que el bucket whatsapp-stickers acepte webp
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp']
where id = 'whatsapp-stickers';

-- 3. Política para permitir que Meta descargue vía signed URL
-- (ya existe: "CRM admins read whatsapp storage" con bucket_id check)
-- Pero necesitamos también que el service_role pueda crear signed URLs
-- Eso ya funciona automáticamente porque service_role bypass RLS.

-- 4. Agregar columna is_animated_sticker si no existe
alter table public.whatsapp_message_log
  add column if not exists is_animated_sticker boolean not null default false;

-- 5. Agregar columna storage_url si no existe (para URLs públicas/signed)
alter table public.whatsapp_message_log
  add column if not exists storage_url text;

-- 6. Asegurar que exista el bucket crm-contact-photos (ya en migración 25170000)
-- pero asegurar políticas de delete para storage
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'CRM admins delete wafa storage'
  ) then
    create policy "CRM admins delete wafa storage"
    on storage.objects for delete to authenticated
    using (bucket_id in ('whatsapp-media', 'whatsapp-stickers', 'crm-contact-photos') and app_private.is_crm_admin());
  end if;
end $$;

-- 7. Realtime publication para tablas de outbound
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_outbound_batches'
  ) then
    alter publication supabase_realtime add table public.whatsapp_outbound_batches;
  end if;
end $$;

-- 8. Añadir índice para búsqueda por storage_path
create index if not exists whatsapp_message_log_storage_path_idx
  on public.whatsapp_message_log (storage_path)
  where storage_path is not null;

-- 9. Añadir índice para búsqueda por media_url
create index if not exists whatsapp_message_log_media_url_idx
  on public.whatsapp_message_log (media_url)
  where media_url is not null;
