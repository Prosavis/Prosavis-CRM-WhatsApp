-- Excluir también plantilla v3 (APPROVED 01/09/2026) del pool WA.
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
  order by l.name nulls last, l.phone_key
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;
