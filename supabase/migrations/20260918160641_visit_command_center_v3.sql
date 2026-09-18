-- Visitas v3: deuda solo de servicios COMPLETED, workspace unificado,
-- identidad histórica y versionado del análisis.

alter table public.visit_client_intelligence
  add column if not exists analysis_contract_version integer not null default 2;

alter table public.visit_client_intelligence
  drop constraint if exists visit_client_intelligence_analysis_contract_check;
alter table public.visit_client_intelligence
  add constraint visit_client_intelligence_analysis_contract_check check (
    analysis_contract_version >= 1
  );

create index if not exists visit_client_intelligence_contract_idx
  on public.visit_client_intelligence (service_id, analysis_contract_version, analysis_status);

update public.client_visits cv
set directory_id = d.id
from public.crm_directory d
where cv.directory_id is null
  and cv.client_reference = d.id::text;

update public.opportunities op
set directory_id = d.id
from public.crm_directory d
where op.directory_id is null
  and op.client_reference = d.id::text;

update public.referrals rf
set directory_id = d.id
from public.crm_directory d
where rf.directory_id is null
  and rf.client_reference = d.id::text;

create index if not exists client_visits_service_visited_idx
  on public.client_visits (service_id, visited_at desc nulls last);

create index if not exists client_visits_directory_visited_idx
  on public.client_visits (service_id, directory_id, visited_at desc nulls last);

create index if not exists opportunities_service_status_idx
  on public.opportunities (service_id, status, next_action_on);

create index if not exists opportunities_directory_idx
  on public.opportunities (service_id, directory_id, created_at desc);

create index if not exists referrals_service_created_idx
  on public.referrals (service_id, created_at desc);

create index if not exists referrals_directory_idx
  on public.referrals (service_id, directory_id, created_at desc);

create or replace function app_private.visit_completed_debt_stats(p_service_id text)
returns table (
  directory_id uuid,
  outstanding_total_cop bigint,
  completed_service_count bigint,
  pending_count bigint,
  partial_count bigint,
  rejected_count bigint,
  payment_headline text,
  computed_at timestamptz
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with completed as (
    select distinct on (mb.directory_id, mb.appointment_id)
      mb.directory_id,
      mb.appointment_id,
      mb.payment_status,
      greatest(coalesce(mb.pending_cop, 0), 0)::bigint as pending_cop
    from app_private.directory_workspace_booking_matches(p_service_id) mb
    where mb.status = 'COMPLETED'
    order by mb.directory_id, mb.appointment_id, mb.updated_at desc nulls last
  ),
  aggregated as (
    select
      directory_id,
      coalesce(sum(pending_cop) filter (
        where pending_cop > 0 and payment_status is distinct from 'PAGO_ACEPTADO'
      ), 0)::bigint as outstanding_total_cop,
      count(*) filter (
        where pending_cop > 0 and payment_status is distinct from 'PAGO_ACEPTADO'
      )::bigint as completed_service_count,
      count(*) filter (
        where pending_cop > 0 and payment_status = 'PAGO_PENDIENTE'
      )::bigint as pending_count,
      count(*) filter (
        where pending_cop > 0 and payment_status = 'PAGO_EN_PROCESO'
      )::bigint as partial_count,
      count(*) filter (
        where pending_cop > 0 and payment_status = 'PAGO_RECHAZADO'
      )::bigint as rejected_count
    from completed
    group by directory_id
  )
  select
    directory_id,
    outstanding_total_cop,
    completed_service_count,
    pending_count,
    partial_count,
    rejected_count,
    case
      when outstanding_total_cop <= 0 then 'AL_DIA'
      when rejected_count > 0 then 'PAGO_RECHAZADO'
      when partial_count > 0 then 'PAGO_PARCIAL'
      else 'COBRO_PENDIENTE'
    end as payment_headline,
    now() as computed_at
  from aggregated;
$$;

create or replace function public.visit_clients_workspace(
  p_service_id text,
  p_limit integer default 80,
  p_offset integer default 0,
  p_filter text default 'all',
  p_search text default null
)
returns table (
  directory_id uuid,
  display_name text,
  phone text,
  analysis_status text,
  has_ficha boolean,
  visit_need text,
  visit_reason text,
  pending_reply boolean,
  latest_activity_at timestamptz,
  urgency text,
  outstanding_total_cop bigint,
  completed_service_count bigint,
  pending_count bigint,
  partial_count bigint,
  rejected_count bigint,
  payment_headline text,
  analysis_contract_version integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with debt as (
    select * from app_private.visit_completed_debt_stats(p_service_id)
  ),
  intel as (
    select
      v.directory_id,
      v.analysis_status,
      v.visit_need,
      v.pending_reply,
      v.latest_activity_at,
      v.urgency,
      v.analysis_contract_version,
      nullif(v.profile->>'displayName', '') as profile_name,
      coalesce(v.profile->'visitReasons'->>0, v.profile->>'summary') as visit_reason
    from public.visit_client_intelligence v
    where v.service_id = p_service_id
  ),
  unioned as (
    select
      d.id as directory_id,
      coalesce(
        nullif(i.profile_name, ''),
        nullif(d.display_name, ''),
        nullif(d.full_name, ''),
        'Cliente'
      ) as display_name,
      d.phone,
      i.analysis_status,
      (i.directory_id is not null) as has_ficha,
      i.visit_need,
      i.visit_reason,
      coalesce(i.pending_reply, false) as pending_reply,
      i.latest_activity_at,
      i.urgency,
      coalesce(debt.outstanding_total_cop, 0) as outstanding_total_cop,
      coalesce(debt.completed_service_count, 0) as completed_service_count,
      coalesce(debt.pending_count, 0) as pending_count,
      coalesce(debt.partial_count, 0) as partial_count,
      coalesce(debt.rejected_count, 0) as rejected_count,
      coalesce(debt.payment_headline, 'AL_DIA') as payment_headline,
      coalesce(i.analysis_contract_version, 0) as analysis_contract_version
    from public.crm_directory d
    left join intel i on i.directory_id = d.id
    left join debt on debt.directory_id = d.id
    where d.service_id = p_service_id
      and lower(coalesce(d.status, 'active')) = 'active'
      and coalesce(d.opt_out, false) = false
      and (
        i.directory_id is not null
        or coalesce(debt.outstanding_total_cop, 0) > 0
      )
  ),
  filtered as (
    select *
    from unioned
    where (
      p_filter is null
      or p_filter = 'all'
      or (p_filter = 'cobro' and outstanding_total_cop > 0)
      or (p_filter = 'pending_reply' and pending_reply)
      or (
        p_filter = 'pending_analysis'
        and (analysis_status is distinct from 'ready' or analysis_contract_version < 3)
      )
    )
    and (
      p_search is null
      or length(trim(p_search)) = 0
      or display_name ilike '%' || trim(p_search) || '%'
      or coalesce(phone, '') ilike '%' || trim(p_search) || '%'
    )
  )
  select
    f.directory_id,
    f.display_name,
    f.phone,
    f.analysis_status,
    f.has_ficha,
    f.visit_need,
    f.visit_reason,
    f.pending_reply,
    f.latest_activity_at,
    f.urgency,
    f.outstanding_total_cop,
    f.completed_service_count,
    f.pending_count,
    f.partial_count,
    f.rejected_count,
    f.payment_headline,
    f.analysis_contract_version,
    count(*) over() as total_count
  from filtered f
  order by
    case when f.outstanding_total_cop > 0 then 0 else 1 end,
    f.latest_activity_at desc nulls last,
    f.display_name
  limit greatest(1, least(coalesce(p_limit, 80), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.visit_history_timeline(
  p_service_id text,
  p_limit integer default 80
)
returns table (
  event_kind text,
  event_id uuid,
  directory_id uuid,
  display_name text,
  occurred_at timestamptz,
  title text,
  detail text,
  status text,
  satisfaction smallint,
  pending boolean
)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with named as (
    select
      d.id,
      coalesce(nullif(d.display_name, ''), nullif(d.full_name, ''), 'Cliente') as display_name
    from public.crm_directory d
    where d.service_id = p_service_id
  ),
  events as (
    select
      'visit'::text as event_kind,
      cv.id as event_id,
      coalesce(cv.directory_id, n.id) as directory_id,
      coalesce(n.display_name, 'Cliente') as display_name,
      coalesce(cv.visited_at, cv.created_at) as occurred_at,
      case cv.visit_type
        when 'complaint' then 'Visita por queja'
        when 'follow_up' then 'Visita de seguimiento'
        when 'referral' then 'Visita por referido'
        else 'Visita registrada'
      end as title,
      coalesce(nullif(cv.notes, ''), 'Sin notas') as detail,
      cv.status,
      cv.satisfaction,
      false as pending
    from public.client_visits cv
    left join named n
      on n.id = cv.directory_id
      or n.id::text = cv.client_reference
    where cv.service_id = p_service_id

    union all

    select
      'opportunity'::text,
      op.id,
      coalesce(op.directory_id, n.id),
      coalesce(n.display_name, 'Cliente'),
      coalesce(op.next_action_on::timestamptz, op.created_at),
      coalesce(nullif(op.title, ''), 'Seguimiento'),
      coalesce(nullif(op.notes, ''), op.opportunity_type),
      op.status,
      null::smallint,
      op.status in ('open', 'contacted')
    from public.opportunities op
    left join named n
      on n.id = op.directory_id
      or n.id::text = op.client_reference
    where op.service_id = p_service_id

    union all

    select
      'referral'::text,
      rf.id,
      coalesce(rf.directory_id, n.id),
      coalesce(n.display_name, 'Cliente'),
      rf.created_at,
      'Referido · ' || rf.referred_name,
      coalesce(rf.relationship, rf.status),
      rf.status,
      null::smallint,
      rf.status in ('lead', 'contacted', 'qualified')
    from public.referrals rf
    left join named n
      on n.id = rf.directory_id
      or n.id::text = rf.client_reference
    where rf.service_id = p_service_id
  )
  select *
  from events
  order by pending desc, occurred_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 80), 200));
$$;

revoke all on function public.visit_clients_workspace(text, integer, integer, text, text) from public;
revoke all on function public.visit_clients_workspace(text, integer, integer, text, text) from anon;
revoke all on function public.visit_clients_workspace(text, integer, integer, text, text) from authenticated;
grant execute on function public.visit_clients_workspace(text, integer, integer, text, text) to service_role;

revoke all on function public.visit_history_timeline(text, integer) from public;
revoke all on function public.visit_history_timeline(text, integer) from anon;
revoke all on function public.visit_history_timeline(text, integer) from authenticated;
grant execute on function public.visit_history_timeline(text, integer) to service_role;
