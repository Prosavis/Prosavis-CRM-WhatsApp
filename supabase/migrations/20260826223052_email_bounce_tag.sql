-- Catálogo inbox para goteo email (DSN / mailer-daemon).
-- El directorio ya usa crm_directory.tags = 'email bounce'.
-- No crea mailer: solo tag de inbox + backfill por phone_key.

insert into public.whatsapp_chat_tags (name, color, archived, sort_order)
select 'email bounce', '#c62828', false, 0
where not exists (
  select 1
  from public.whatsapp_chat_tags t
  where lower(t.name) = 'email bounce'
);

with bounce as (
  select id
  from public.whatsapp_chat_tags
  where lower(name) = 'email bounce'
  limit 1
),
targets as (
  select distinct c.stable_key
  from public.whatsapp_conversations c
  join public.crm_directory d
    on d.phone_key is not null
   and d.tags @> array['email bounce']::text[]
   and (
     c.phone_key = d.phone_key
     or c.stable_key = d.phone_key
     or (
       length(d.phone_key) = 10
       and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = d.phone_key
     )
   )
)
update public.whatsapp_conversations c
set tag_ids = array_append(coalesce(c.tag_ids, '{}'), (select id from bounce))
from targets t
where c.stable_key = t.stable_key
  and (select id from bounce) is not null
  and not ((select id from bounce) = any (coalesce(c.tag_ids, '{}')));

with enviado as (
  select id
  from public.whatsapp_chat_tags
  where lower(name) = 'email enviado'
  limit 1
),
targets as (
  select distinct c.stable_key
  from public.whatsapp_conversations c
  join public.crm_directory d
    on d.phone_key is not null
   and d.tags @> array['email enviado']::text[]
   and (
     c.phone_key = d.phone_key
     or c.stable_key = d.phone_key
     or (
       length(d.phone_key) = 10
       and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = d.phone_key
     )
   )
)
update public.whatsapp_conversations c
set tag_ids = array_append(coalesce(c.tag_ids, '{}'), (select id from enviado))
from targets t
where c.stable_key = t.stable_key
  and (select id from enviado) is not null
  and not ((select id from enviado) = any (coalesce(c.tag_ids, '{}')));
