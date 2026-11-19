-- Estudio de chats de Sofía. Guarda el inventario y el diagnóstico por teléfono.
-- No envía mensajes. La lectura es solo para administradores del CRM.

create or replace function app_private.study_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    when length(digits) = 10 then '57' || digits
    when length(digits) >= 12 and right(digits, 12) like '57%' then right(digits, 12)
    else null
  end
  from (
    select regexp_replace(split_part(coalesce(raw, ''), '__', 1), '\D', '', 'g') as digits
  ) cleaned
$$;

alter table public.whatsapp_client_cards
  add column if not exists propuesta_cajon jsonb not null default '{}'::jsonb,
  add column if not exists tipo_contacto text,
  add column if not exists motivo_propuesto text,
  add column if not exists resultado text,
  add column if not exists version_estudio text;

create table if not exists public.whatsapp_study_contacts (
  phone text primary key,
  phone_key text not null,
  has_inbound boolean not null default false,
  inbound_count integer not null default 0,
  outbound_count integer not null default 0,
  message_count integer not null default 0,
  lines text[] not null default '{}',
  intake text,
  directory_id text,
  directory_tags text[] not null default '{}',
  classification text,
  is_app_user boolean not null default false,
  app_user_id text,
  has_cajon boolean not null default false,
  b2b boolean not null default false,
  job_stage text,
  appointment_count integer not null default 0,
  last_appointment_at timestamptz,
  off_catalog_duration boolean not null default false,
  first_real_hours numeric,
  template_name text,
  clase text not null,
  clase_detalle text,
  version_estudio text not null default '1',
  updated_at timestamptz not null default now(),
  constraint whatsapp_study_contacts_clase_check
    check (clase in ('con_respuesta', 'sin_respuesta'))
);

create index if not exists whatsapp_study_contacts_clase_idx
  on public.whatsapp_study_contacts (clase, message_count desc);

create table if not exists public.whatsapp_study_chat_reviews (
  stable_key text primary key,
  phone text not null,
  model text not null,
  rubric jsonb not null default '{}'::jsonb,
  bien text,
  mal text,
  mejor text,
  version_estudio text not null default '1',
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_study_contacts enable row level security;
alter table public.whatsapp_study_chat_reviews enable row level security;

revoke all on table public.whatsapp_study_contacts from public, anon, authenticated;
revoke all on table public.whatsapp_study_chat_reviews from public, anon, authenticated;
grant select on table public.whatsapp_study_contacts to authenticated, service_role;
grant select, insert, update, delete on table public.whatsapp_study_contacts to service_role;
grant select on table public.whatsapp_study_chat_reviews to authenticated, service_role;
grant select, insert, update, delete on table public.whatsapp_study_chat_reviews to service_role;

drop policy if exists whatsapp_study_contacts_admin_read on public.whatsapp_study_contacts;
create policy whatsapp_study_contacts_admin_read
  on public.whatsapp_study_contacts
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

drop policy if exists whatsapp_study_chat_reviews_admin_read on public.whatsapp_study_chat_reviews;
create policy whatsapp_study_chat_reviews_admin_read
  on public.whatsapp_study_chat_reviews
  for select
  to authenticated
  using ((select app_private.is_crm_admin()));

create or replace function public.refresh_whatsapp_study_contacts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written integer;
begin
  with msgs as (
    select
      app_private.study_phone(conversation_stable_key) as phone,
      direction,
      template_name,
      phone_number_id
    from public.whatsapp_message_log
    union all
    select
      app_private.study_phone(conversation_stable_key),
      direction,
      template_name,
      phone_number_id
    from public.whatsapp_message_log_archive
  ),
  per as (
    select
      phone,
      count(*) filter (where direction = 'inbound')::integer as inbound_count,
      count(*) filter (where direction = 'outbound')::integer as outbound_count,
      count(*)::integer as message_count,
      coalesce(array_agg(distinct case phone_number_id
        when '1035566289641219' then '312'
        when '1043086062223440' then '311'
        else 'otra'
      end), '{}') as lines,
      mode() within group (order by template_name) filter (where template_name is not null) as template_name
    from msgs
    where phone is not null
    group by phone
  ),
  intake as (
    select app_private.study_phone(coalesce(contact_phone, phone)) as phone,
      mode() within group (order by intake_intent_label) filter (where intake_intent_label is not null) as intake
    from public.whatsapp_conversations
    group by 1
  ),
  directory as (
    select distinct on (phone_key)
      phone_key,
      id,
      tags,
      classification,
      is_app_user,
      app_user_id,
      coalesce(internal_notes, '') <> '' as has_cajon
    from public.crm_directory
    where phone_key is not null
    order by phone_key, (coalesce(internal_notes, '') <> '') desc, updated_at desc nulls last
  ),
  jobs as (
    select distinct on (d.phone_key)
      d.phone_key,
      ja.stage
    from public.job_applications ja
    join public.crm_directory d on d.id = ja.directory_id
    where d.phone_key is not null
    order by d.phone_key, ja.last_contact_at desc nulls last
  ),
  b2b as (
    select distinct phone_key
    from public.outreach_leads
    where phone_key is not null
  ),
  episodes as (
    select distinct on (app_private.study_phone(stable_key))
      app_private.study_phone(stable_key) as phone,
      round((extract(epoch from (first_real_at - started_at)) / 3600.0)::numeric, 1) as hours
    from public.whatsapp_response_episodes
    where first_real_at is not null
    order by app_private.study_phone(stable_key), started_at desc
  ),
  rows as (
    select
      per.phone,
      right(per.phone, 10) as phone_key,
      per.inbound_count > 0 as has_inbound,
      per.inbound_count,
      per.outbound_count,
      per.message_count,
      per.lines,
      intake.intake,
      directory.id as directory_id,
      coalesce(directory.tags, '{}') as directory_tags,
      directory.classification,
      coalesce(directory.is_app_user, false) as is_app_user,
      directory.app_user_id,
      coalesce(directory.has_cajon, false) as has_cajon,
      b2b.phone_key is not null as b2b,
      jobs.stage as job_stage,
      episodes.hours as first_real_hours,
      per.template_name,
      case when per.inbound_count > 0 then 'con_respuesta' else 'sin_respuesta' end as clase,
      case
        when per.inbound_count > 0 then null
        when per.template_name like 'outreach_empresas%' or b2b.phone_key is not null then 'lote_empresas'
        when per.template_name = 'promo_general' then 'promo'
        when per.template_name like 'contingencia%' then 'contingencia'
        when coalesce(directory.is_app_user, false) then 'app'
        when jobs.stage is not null or intake.intake = 'empleo' then 'empleo'
        else 'otro_saliente'
      end as clase_detalle
    from per
    left join intake on intake.phone = per.phone
    left join directory on directory.phone_key = right(per.phone, 10)
    left join jobs on jobs.phone_key = right(per.phone, 10)
    left join b2b on b2b.phone_key = right(per.phone, 10)
    left join episodes on episodes.phone = per.phone
  )
  insert into public.whatsapp_study_contacts (
    phone, phone_key, has_inbound, inbound_count, outbound_count, message_count,
    lines, intake, directory_id, directory_tags, classification, is_app_user, app_user_id,
    has_cajon, b2b, job_stage, first_real_hours, template_name, clase, clase_detalle,
    version_estudio, updated_at
  )
  select
    phone, phone_key, has_inbound, inbound_count, outbound_count, message_count,
    lines, intake, directory_id, directory_tags, classification, is_app_user, app_user_id,
    has_cajon, b2b, job_stage, first_real_hours, template_name, clase, clase_detalle,
    '1', now()
  from rows
  on conflict (phone) do update set
    phone_key = excluded.phone_key,
    has_inbound = excluded.has_inbound,
    inbound_count = excluded.inbound_count,
    outbound_count = excluded.outbound_count,
    message_count = excluded.message_count,
    lines = excluded.lines,
    intake = excluded.intake,
    directory_id = excluded.directory_id,
    directory_tags = excluded.directory_tags,
    classification = excluded.classification,
    is_app_user = excluded.is_app_user,
    app_user_id = excluded.app_user_id,
    has_cajon = excluded.has_cajon,
    b2b = excluded.b2b,
    job_stage = excluded.job_stage,
    first_real_hours = excluded.first_real_hours,
    template_name = excluded.template_name,
    clase = excluded.clase,
    clase_detalle = excluded.clase_detalle,
    version_estudio = excluded.version_estudio,
    updated_at = excluded.updated_at;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function public.refresh_whatsapp_study_contacts() from public, anon, authenticated;
grant execute on function public.refresh_whatsapp_study_contacts() to service_role;
revoke all on function app_private.study_phone(text) from public;
