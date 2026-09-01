-- Inventario crudo del pool (sin LIMIT 50, sin NOT EXISTS de pase).
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
    ) as whatsapp_pending,
    (
      select count(*)
      from public.outreach_leads l
      where l.email_status = 'pending'
        and l.email is not null
        and position('@' in l.email) > 1
        and l.email not ilike '%@privaterelay.appleid.com'
    ) as email_pending;
$$;

grant execute on function public.count_empresas_outreach_pool() to authenticated, service_role;
