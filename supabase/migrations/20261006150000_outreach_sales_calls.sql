-- Llamadas de venta (piloto ElevenLabs). El pool sigue en outreach_leads.
-- El fijo no entra en phone_key. La supresión es contact_suppression.

alter table public.outreach_leads
  add column if not exists call_status text,
  add column if not exists landline_e164 text,
  add column if not exists call_attempts jsonb not null default '[]'::jsonb,
  add column if not exists next_call_at timestamptz,
  add column if not exists call_discard_reason text,
  add column if not exists call_contact jsonb not null default '{}'::jsonb,
  add column if not exists active_conversation_id text,
  add column if not exists last_person_at timestamptz;

do $$
begin
  alter table public.outreach_leads
    add constraint outreach_leads_call_status_chk check (
      call_status is null or call_status in (
        'pendiente', 'en_cola', 'llamando', 'contactado', 'calificado',
        'traspasado', 'referido', 'rellamar', 'descartado', 'suprimido',
        'traspaso_fallido'
      )
    );
exception
  when duplicate_object then null;
end $$;

create unique index if not exists outreach_leads_landline_e164_uidx
  on public.outreach_leads (landline_e164)
  where landline_e164 is not null;

create index if not exists outreach_leads_call_queue_idx
  on public.outreach_leads (next_call_at nulls first)
  where call_status in ('pendiente', 'en_cola', 'rellamar')
    and landline_e164 is not null;

create table if not exists public.outreach_calls (
  conversation_id text primary key,
  lead_id uuid references public.outreach_leads(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  answered_by text,
  outcome text,
  transcript jsonb,
  analysis jsonb not null default '{}'::jsonb,
  evaluation jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  recording_url text,
  template_message_id text,
  handoff_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_calls_answered_by_chk check (
    answered_by is null or answered_by in (
      'persona', 'buzon', 'ivr', 'no_contesta', 'ocupado', 'fallo'
    )
  ),
  constraint outreach_calls_outcome_chk check (
    outcome is null or outcome in (
      'no_contesta', 'buzon', 'ocupado', 'ivr', 'numero_equivocado',
      'fuera_cobertura', 'no_interesado', 'no_llamar', 'rellamar', 'referido',
      'calificado_email', 'calificado_whatsapp', 'cortada'
    )
  )
);

create unique index if not exists outreach_calls_template_message_uidx
  on public.outreach_calls (template_message_id)
  where template_message_id is not null;

create index if not exists outreach_calls_started_at_idx
  on public.outreach_calls (started_at);

drop trigger if exists set_outreach_calls_updated_at on public.outreach_calls;
create trigger set_outreach_calls_updated_at
before update on public.outreach_calls
for each row execute function public.set_updated_at();

create table if not exists public.contact_consents (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  value text not null,
  holder_name text,
  holder_role text,
  company text,
  is_holder boolean not null default false,
  conversation_id text not null,
  transcript_excerpt text,
  created_at timestamptz not null default now(),
  constraint contact_consents_channel_chk check (channel in ('whatsapp', 'email')),
  constraint contact_consents_unique unique (conversation_id, channel, value)
);

create table if not exists public.contact_suppression (
  value text primary key,
  reason text,
  source text not null default 'llamada',
  created_at timestamptz not null default now()
);

alter table public.outreach_calls enable row level security;
alter table public.contact_consents enable row level security;
alter table public.contact_suppression enable row level security;

drop policy if exists "CRM admins manage outreach calls" on public.outreach_calls;
create policy "CRM admins manage outreach calls"
on public.outreach_calls for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists "CRM admins manage contact consents" on public.contact_consents;
create policy "CRM admins manage contact consents"
on public.contact_consents for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists "CRM admins manage contact suppression" on public.contact_suppression;
create policy "CRM admins manage contact suppression"
on public.contact_suppression for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

grant select, insert, update, delete on public.outreach_calls to authenticated, service_role;
grant select, insert, update, delete on public.contact_consents to authenticated, service_role;
grant select, insert, update, delete on public.contact_suppression to authenticated, service_role;

create or replace function public.is_contact_suppressed(p_e164 text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with keys as (
    select
      nullif(lower(trim(coalesce(p_e164, ''))), '') as e164,
      nullif(lower(trim(coalesce(p_email, ''))), '') as email,
      case
        when length(regexp_replace(coalesce(p_e164, ''), '[^0-9]', '', 'g')) >= 10
          then right(regexp_replace(p_e164, '[^0-9]', '', 'g'), 10)
        else null
      end as phone_key
  )
  select
    exists (
      select 1
      from public.contact_suppression s
      cross join keys k
      where s.value <> ''
        and s.value in (k.e164, k.email, k.phone_key)
    )
    or exists (
      select 1
      from public.crm_directory d
      cross join keys k
      where coalesce(d.opt_out, false) = true
        and (
          (k.phone_key is not null and d.phone_key = k.phone_key)
          or (k.email is not null and lower(trim(d.email)) = k.email)
        )
    )
    or exists (
      select 1
      from public.whatsapp_blocklist b
      cross join keys k
      where k.phone_key is not null
        and right(regexp_replace(b.phone, '[^0-9]', '', 'g'), 10) = k.phone_key
    );
$$;

create or replace function public.list_outreach_call_eligible(p_limit integer default 1)
returns table (
  id uuid,
  name text,
  landline_e164 text,
  phone_key text,
  email text,
  municipio text,
  nit text,
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
    l.landline_e164,
    l.phone_key,
    l.email,
    l.municipio,
    l.nit,
    l.sources
  from public.outreach_leads l
  where l.call_status in ('pendiente', 'en_cola', 'rellamar')
    and l.landline_e164 like '+57606%'
    and (l.next_call_at is null or l.next_call_at <= now())
    and (
      l.call_status = 'rellamar'
      or l.last_person_at is null
      or l.last_person_at < now() - interval '7 days'
    )
    and (
      l.municipio is null
      or btrim(l.municipio) = ''
      or lower(translate(l.municipio, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
        in ('pereira', 'dosquebradas', 'cerritos')
    )
    and not public.is_contact_suppressed(l.landline_e164, l.email)
    and (l.phone_key is null or not public.is_contact_suppressed('+57' || l.phone_key, null))
    and (l.last_wa_at is null or l.last_wa_at < now() - interval '90 days')
    and not exists (
      select 1
      from public.crm_directory d
      where l.phone_key is not null
        and d.phone_key = l.phone_key
        and exists (
          select 1
          from unnest(coalesce(d.tags, '{}'::text[])) as tag(name)
          where lower(trim(tag.name)) in ('cliente', 'agendado')
            or lower(trim(tag.name)) like 'cliente %'
        )
    )
    and not exists (
      select 1
      from public.bookings a
      where a.client_phone is not null
        and a.source_deleted_at is null
        and a.scheduled_start > now() - interval '180 days'
        and a.status not ilike '%cancel%'
        and right(regexp_replace(a.client_phone, '[^0-9]', '', 'g'), 10) in (
          l.phone_key,
          right(regexp_replace(l.landline_e164, '[^0-9]', '', 'g'), 10)
        )
    )
    and not exists (
      select 1
      from public.whatsapp_conversations c
      where c.last_message_at > now() - interval '90 days'
        and c.phone_key is not null
        and c.phone_key in (
          l.phone_key,
          right(regexp_replace(l.landline_e164, '[^0-9]', '', 'g'), 10)
        )
    )
  order by l.next_call_at nulls first, l.name nulls last
  limit greatest(1, least(coalesce(p_limit, 1), 20));
$$;

create or replace view public.outreach_call_funnel_daily
with (security_invoker = true) as
select
  (started_at at time zone 'America/Bogota')::date as day,
  count(*) as llamadas,
  count(*) filter (where answered_by = 'persona') as contesto_persona,
  count(*) filter (where coalesce(analysis->>'es_encargado', '') in ('true', 'si', 'sí')) as decidio,
  count(*) filter (where outcome in ('calificado_whatsapp', 'calificado_email')) as calificados,
  count(*) filter (where outcome = 'calificado_whatsapp') as permiso_whatsapp,
  count(*) filter (where template_message_id is not null) as plantilla_entregada,
  count(*) filter (where outcome = 'no_llamar') as no_llamar,
  count(*) filter (where coalesce(flags->>'revisarAntesDeCotizar', '') = 'true') as revisar_antes
from public.outreach_calls
where started_at is not null
group by 1;

revoke execute on function public.is_contact_suppressed(text, text) from public, anon, authenticated;
revoke execute on function public.list_outreach_call_eligible(integer) from public, anon, authenticated;
grant execute on function public.is_contact_suppressed(text, text) to service_role;
grant execute on function public.list_outreach_call_eligible(integer) to service_role;
grant select on public.outreach_call_funnel_daily to authenticated, service_role;
