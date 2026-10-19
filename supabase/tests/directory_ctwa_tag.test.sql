begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

insert into public.whatsapp_conversations (
  stable_key,
  phone,
  contact_phone,
  contact_name,
  phone_number_id,
  last_message_text,
  last_message_at,
  state,
  ctwa_clid,
  ctwa_source_id,
  ctwa_captured_at
)
values (
  '573009990191',
  '573009990191',
  '573009990191',
  'Prueba Anuncio',
  '1035566289641219',
  'Hola, quiero agendar una limpieza.',
  '2026-10-19T15:00:00Z',
  'active',
  'clid-prueba',
  '120250397337640691',
  '2026-10-19T15:00:00Z'
);

select ok(
  exists (
    select 1
    from public.crm_directory
    where whatsapp_conversation_id = '573009990191'
      and ctwa_clid = 'clid-prueba'
      and 'anuncio-meta' = any (coalesce(tags, array[]::text[]))
  ),
  'el chat con clic deja la marca y el tag en la ficha'
);

update public.crm_directory
set
  ctwa_clid = null,
  ctwa_source_id = null,
  ctwa_first_at = null,
  whatsapp_conversation_id = null,
  tags = array[]::text[]
where whatsapp_conversation_id = '573009990191';

select ok(
  exists (
    select 1
    from public.crm_directory
    where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = '3009990191'
      and ctwa_clid is null
      and not ('anuncio-meta' = any (coalesce(tags, array[]::text[])))
  ),
  'la ficha puede quedar sin marca para probar el enlace posterior'
);

update public.crm_directory
set whatsapp_conversation_id = '573009990191'
where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = '3009990191'
  and ctwa_clid is null;

select is(
  (
    select ctwa_clid
    from public.crm_directory
    where whatsapp_conversation_id = '573009990191'
  ),
  'clid-prueba',
  'enlazar la ficha despues del chat copia el clic'
);

select ok(
  'anuncio-meta' = any (
    coalesce(
      (
        select tags
        from public.crm_directory
        where whatsapp_conversation_id = '573009990191'
      ),
      array[]::text[]
    )
  ),
  'enlazar la ficha despues del chat pone el tag'
);

update public.crm_directory
set tags = array['Job']
where whatsapp_conversation_id = '573009990191';

select ok(
  'anuncio-meta' = any (
    (
      select tags
      from public.crm_directory
      where whatsapp_conversation_id = '573009990191'
    )
  )
  and 'Job' = any (
    (
      select tags
      from public.crm_directory
      where whatsapp_conversation_id = '573009990191'
    )
  )
  and (
    select ctwa_clid
    from public.crm_directory
    where whatsapp_conversation_id = '573009990191'
  ) = 'clid-prueba'
  and (
    select ctwa_source_id
    from public.crm_directory
    where whatsapp_conversation_id = '573009990191'
  ) = '120250397337640691',
  'reemplazar los tags del inbox conserva anuncio-meta y el clic'
);

select * from finish();
rollback;
