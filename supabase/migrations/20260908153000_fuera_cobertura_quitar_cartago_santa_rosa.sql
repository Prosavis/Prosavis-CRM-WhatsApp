-- Cartago y Santa Rosa pasan a cobertura directa: salir de Fuera de cobertura.
-- Cali / Quindío / Manizales / etc. se quedan.

update public.whatsapp_inbox_category_settings s
set
  tag_ids = coalesce(
    (
      select array_agg(x.id)
      from unnest(s.tag_ids) as x(id)
      where x.id not in (
        select t.id
        from public.whatsapp_chat_tags t
        where lower(trim(t.name)) in (
          'cartago',
          'santa rosa',
          'santa rosa de cabal'
        )
      )
    ),
    '{}'::uuid[]
  ),
  updated_at = now()
where s.category_id = 'fuera_cobertura';
