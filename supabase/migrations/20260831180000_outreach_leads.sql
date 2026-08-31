-- Pool crudo de outreach B2B (Cámara / datos públicos).
-- No es crm_directory: se promociona a ficha solo al enviar.

create table if not exists public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone_key text,
  landline text,
  email text,
  address text,
  municipio text,
  nit text,
  ciiu text,
  matricula text,
  organizacion text,
  sectors text[] not null default '{}',
  sources text[] not null default '{}',
  wa_status text not null default 'pending',
  email_status text not null default 'pending',
  exclude_reason text,
  crm_directory_id uuid references public.crm_directory(id) on delete set null,
  last_wa_at timestamptz,
  last_email_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_leads_wa_status_chk check (
    wa_status in ('pending', 'sent', 'failed', 'excluded', 'skipped_no_mobile')
  ),
  constraint outreach_leads_email_status_chk check (
    email_status in ('pending', 'sent', 'failed', 'excluded', 'skipped_no_email')
  )
);

create unique index if not exists outreach_leads_phone_key_uidx
  on public.outreach_leads (phone_key)
  where phone_key is not null;

create unique index if not exists outreach_leads_email_uidx
  on public.outreach_leads (lower(email))
  where email is not null;

create unique index if not exists outreach_leads_nit_uidx
  on public.outreach_leads (nit)
  where nit is not null;

create index if not exists outreach_leads_wa_pending_idx
  on public.outreach_leads (wa_status, name)
  where wa_status = 'pending';

create index if not exists outreach_leads_email_pending_idx
  on public.outreach_leads (email_status, name)
  where email_status = 'pending';

drop trigger if exists set_outreach_leads_updated_at on public.outreach_leads;
create trigger set_outreach_leads_updated_at
before update on public.outreach_leads
for each row execute function public.set_updated_at();

alter table public.outreach_leads enable row level security;

drop policy if exists "CRM admins manage outreach leads" on public.outreach_leads;
create policy "CRM admins manage outreach leads"
on public.outreach_leads for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

grant select, insert, update, delete on public.outreach_leads to authenticated, service_role;

-- Elegibles WhatsApp: celular 3XXXXXXXXX, pending, no opt-out/blocklist/ya escrito.
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
        and m.template_name in ('outreach_empresas_limpieza', 'outreach_empresas_limpieza_v2')
    )
  order by l.name nulls last, l.phone_key
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

-- Elegibles email: correo válido, pending, no bounce/enviado/relay.
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
  order by l.name nulls last, l.email
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

grant execute on function public.list_empresas_outreach_wa_eligible(integer) to authenticated, service_role;
grant execute on function public.list_empresas_outreach_email_eligible(integer) to authenticated, service_role;
