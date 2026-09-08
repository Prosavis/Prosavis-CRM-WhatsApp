-- Fuera de cobertura: incluir todas las tags activas del folder Ciudades
-- (Cali, Chinchiná, Ginebra Valle, Manizales, etc.). Pereira/Dosquebradas/Cerritos
-- no viven en ese folder.

update public.whatsapp_inbox_category_settings s
set
  tag_ids = (
    select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    from (
      select unnest(s.tag_ids) as id
      union
      select t.id
      from public.whatsapp_chat_tags t
      join public.whatsapp_tag_folders f on f.id = t.folder_id
      where f.name = 'Ciudades'
        and coalesce(t.archived, false) = false
    ) x
  ),
  updated_at = now()
where s.category_id = 'fuera_cobertura';
