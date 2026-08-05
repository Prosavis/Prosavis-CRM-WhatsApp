-- Activación en frío (app users): columnas por destinatario + RPC de elegibles.
-- campaign_type COLD_APP_USER vive en whatsapp_message_log (texto libre; sin enum).

alter table public.whatsapp_broadcast_jobs
  add column if not exists job_kind text;

comment on column public.whatsapp_broadcast_jobs.job_kind is
  'Tipo de job: bulk | cold_app_user | null (legacy bulk)';

alter table public.whatsapp_broadcast_recipients
  add column if not exists directory_id uuid references public.crm_directory(id) on delete set null,
  add column if not exists template_name text;

create index if not exists whatsapp_broadcast_jobs_job_kind_created_at_idx
  on public.whatsapp_broadcast_jobs (job_kind, created_at desc)
  where job_kind is not null;

create index if not exists whatsapp_broadcast_recipients_directory_id_idx
  on public.whatsapp_broadcast_recipients (directory_id)
  where directory_id is not null;

-- Elegibles: app users activos, móvil CO, sin REACTIVACION/opt-out/blocklist/WA 7d/equipo.
-- Refuerzo Equipo (activos+inactivos): ver 20260804140000_cold_exclude_team_members.sql
create or replace function public.list_cold_app_user_outreach_eligible(
  p_limit integer default 5000,
  p_offset integer default 0
)
returns table (
  id uuid,
  phone text,
  phone_key text,
  display_name text,
  full_name text,
  app_user_id text,
  tags text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with recent_outbound as (
    select distinct
      right(regexp_replace(coalesce(ml.conversation_stable_key, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_message_log ml
    where ml.direction = 'outbound'
      and ml.created_at >= (now() - interval '7 days')
      and length(right(regexp_replace(coalesce(ml.conversation_stable_key, ''), '\D', '', 'g'), 10)) = 10
    union
    select distinct
      right(regexp_replace(coalesce(ml.recipient_phone, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_message_log ml
    where ml.direction = 'outbound'
      and ml.created_at >= (now() - interval '7 days')
      and length(right(regexp_replace(coalesce(ml.recipient_phone, ''), '\D', '', 'g'), 10)) = 10
  ),
  blocked_keys as (
    select distinct
      right(regexp_replace(coalesce(b.phone, b.stable_key, b.bsuid, ''), '\D', '', 'g'), 10) as pk
    from public.whatsapp_blocklist b
    where length(right(regexp_replace(coalesce(b.phone, b.stable_key, b.bsuid, ''), '\D', '', 'g'), 10)) = 10
  )
  select
    d.id,
    d.phone,
    d.phone_key,
    d.display_name,
    d.full_name,
    d.app_user_id,
    d.tags
  from public.crm_directory d
  left join public.whatsapp_reactivation_preferences pref
    on pref.directory_id = d.id
  where d.is_app_user = true
    and d.status = 'active'
    and coalesce(d.opt_out, false) = false
    and d.active_sequence is distinct from 'REACTIVACION'
    and d.phone_key is not null
    and length(d.phone_key) = 10
    and d.phone_key like '3%'
    and d.phone is not null
    and nullif(trim(d.phone), '') is not null
    and coalesce(pref.reactivations_enabled, true) = true
    and not exists (
      select 1
      from unnest(coalesce(d.tags, '{}'::text[])) t(tag)
      where lower(trim(t.tag)) in (
        'auxiliares', 'auxiliar', 'test', 'decline', 'bloqueado', '🚫',
        'marian', 'job', 'jobs', 'francy', 'entrevista', 'trabajo',
        'empresas', 'empresa', 'cliente problemática', 'cliente problematica',
        'no priorizar',
        -- fuera de cobertura (reactivación/cold): no Pereira/Dosquebradas/Santa Rosa
        'fuera de cobertura', 'bogotá', 'bogota', 'quindío', 'quindio',
        'armenia', 'cartago', 'medellín', 'medellin', 'cali', 'barranquilla',
        'manizales', 'cerritos',
        -- fallos cold outreach (Negativos)
        'undeliverable meta',
        'bug uuid log (sin confirmación)',
        'cold falló: undeliverable meta',
        'cold falló: bug uuid log (sin confirmación)'
      )
    )
    and not exists (
      select 1 from blocked_keys bk where bk.pk = d.phone_key
    )
    and not exists (
      select 1 from recent_outbound ro where ro.pk = d.phone_key
    )
  order by d.created_at asc nulls last, d.id asc
  limit case
    when p_limit is null then null
    else greatest(p_limit, 0)
  end
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.count_cold_app_user_outreach_eligible()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.list_cold_app_user_outreach_eligible(null, 0);
$$;

grant execute on function public.list_cold_app_user_outreach_eligible(integer, integer)
  to authenticated, service_role;
grant execute on function public.count_cold_app_user_outreach_eligible()
  to authenticated, service_role;
