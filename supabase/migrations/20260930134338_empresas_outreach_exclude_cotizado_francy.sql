-- Outreach empresas: no enviar WA/email a contactos con tag "Cotizado - Francy".
-- Match por NOMBRE (trim + case-insensitive), no por id.
-- Fuentes: whatsapp_conversations.tag_ids → whatsapp_chat_tags.name
--          y crm_directory.tags (nombres).

create or replace function public.empresas_outreach_has_cotizado_francy(
  p_phone_key text default null,
  p_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with keys as (
    select
      nullif(btrim(p_phone_key), '') as phone_key,
      nullif(btrim(p_email), '') as email
  )
  select
    exists (
      select 1
      from public.crm_directory d
      cross join keys k
      where k.phone_key is not null
        and d.phone_key = k.phone_key
        and exists (
          select 1
          from unnest(coalesce(d.tags, '{}'::text[])) as x(tag)
          where lower(btrim(x.tag)) = 'cotizado - francy'
        )
    )
    or exists (
      select 1
      from public.crm_directory d
      cross join keys k
      where k.email is not null
        and d.email is not null
        and lower(btrim(d.email)) = lower(k.email)
        and exists (
          select 1
          from unnest(coalesce(d.tags, '{}'::text[])) as x(tag)
          where lower(btrim(x.tag)) = 'cotizado - francy'
        )
    )
    or exists (
      select 1
      from public.whatsapp_conversations c
      join public.whatsapp_chat_tags t
        on t.id = any (coalesce(c.tag_ids, '{}'::uuid[]))
      cross join keys k
      where k.phone_key is not null
        and length(k.phone_key) = 10
        and lower(btrim(t.name)) = 'cotizado - francy'
        and (
          c.phone_key = k.phone_key
          or (
            c.phone_key is null
            and right(
              regexp_replace(
                coalesce(c.contact_phone, c.phone, c.stable_key, ''),
                '[^0-9]',
                '',
                'g'
              ),
              10
            ) = k.phone_key
          )
        )
    );
$$;

revoke all on function public.empresas_outreach_has_cotizado_francy(text, text) from public;
grant execute on function public.empresas_outreach_has_cotizado_francy(text, text)
  to authenticated, service_role;

create or replace function public.list_empresas_outreach_wa_eligible(
  p_limit integer default 50
)
returns table (
  id uuid,
  name text,
  phone_key text,
  email text,
  address text,
  municipio text,
  nit text,
  ciiu text,
  sources text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.name,
    l.phone_key,
    l.email,
    l.address,
    l.municipio,
    l.nit,
    l.ciiu,
    l.sources
  from public.outreach_leads l
  where l.wa_status = 'pending'
    and l.phone_key is not null
    and length(l.phone_key) = 10
    and l.phone_key like '3%'
    and not exists (
      select 1 from public.crm_directory d
      where d.phone_key = l.phone_key
        and (
          coalesce(d.opt_out, false) = true
          or coalesce(d.tags, '{}') && array['failed to be sent','undeliverable Meta']::text[]
        )
    )
    and not exists (
      select 1 from public.whatsapp_message_log m
      where right(regexp_replace(m.recipient_phone, '[^0-9]', '', 'g'), 10) = l.phone_key
        and m.direction = 'outbound'
        and m.wa_message_id is not null
        and m.template_name in (
          'outreach_empresas_limpieza',
          'outreach_empresas_limpieza_v2',
          'outreach_empresas_limpieza_v3'
        )
    )
    and not public.empresas_outreach_has_cotizado_francy(l.phone_key, l.email)
  order by l.name nulls last, l.phone_key
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

create or replace function public.list_empresas_outreach_email_eligible(
  p_limit integer default 50
)
returns table (
  id uuid,
  name text,
  phone_key text,
  email text,
  address text,
  municipio text,
  nit text,
  ciiu text,
  sources text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.name,
    l.phone_key,
    l.email,
    l.address,
    l.municipio,
    l.nit,
    l.ciiu,
    l.sources
  from public.outreach_leads l
  where l.email_status = 'pending'
    and l.email is not null
    and position('@' in l.email) > 1
    and l.email not ilike '%@privaterelay.appleid.com'
    and not exists (
      select 1 from public.crm_directory d
      where lower(trim(d.email)) = lower(trim(l.email))
        and (
          coalesce(d.opt_out, false) = true
          or coalesce(d.tags, '{}') && array['email bounce','email enviado']::text[]
        )
    )
    and not public.empresas_outreach_has_cotizado_francy(l.phone_key, l.email)
  order by l.name nulls last, l.email
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

create or replace function public.count_empresas_outreach_pool()
returns table (
  whatsapp_pending bigint,
  email_pending bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)
      from public.outreach_leads l
      where l.wa_status = 'pending'
        and l.phone_key is not null
        and length(l.phone_key) = 10
        and l.phone_key like '3%'
        and not public.empresas_outreach_has_cotizado_francy(l.phone_key, l.email)
    ) as whatsapp_pending,
    (
      select count(*)
      from public.outreach_leads l
      where l.email_status = 'pending'
        and l.email is not null
        and position('@' in l.email) > 1
        and l.email not ilike '%@privaterelay.appleid.com'
        and not public.empresas_outreach_has_cotizado_francy(l.phone_key, l.email)
    ) as email_pending;
$$;
