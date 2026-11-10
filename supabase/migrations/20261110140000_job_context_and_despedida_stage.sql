-- Despedida is a stage, not only a tag. The job file also fills cajón A
-- (internal_notes) without erasing an existing sheet.

alter table public.job_applications
  drop constraint if exists job_applications_stage_check;

update public.job_applications a
set
  stage = 'despedida',
  needs_stage_review = false,
  legacy_stage = null,
  updated_at = now()
from public.crm_directory d
where a.directory_id = d.id
  and a.deleted_at is null
  and a.stage not in ('hired', 'despedida')
  and exists (
    select 1 from unnest(coalesce(d.tags, '{}'::text[])) t
    where lower(t) in ('despedida', 'auxiliares desactivadas')
  );

insert into public.job_application_events (
  application_id, event_type, from_stage, to_stage, actor_kind, actor_id, actor_label, payload
)
select
  a.id, 'stage_changed', 'inbound', 'despedida', 'system', 'despedida-tag', 'Etiqueta Despedida',
  jsonb_build_object('note', 'La etiqueta Despedida pasa la etapa a Despedida')
from public.job_applications a
where a.deleted_at is null
  and a.stage = 'despedida'
  and a.updated_at > now() - interval '5 minutes'
  and not exists (
    select 1 from public.job_application_events e
    where e.application_id = a.id
      and e.to_stage = 'despedida'
      and e.actor_id = 'despedida-tag'
  );

alter table public.job_applications
  add constraint job_applications_stage_check check (
    stage in (
      'inbound',
      'interview_pending',
      'interview_scheduled',
      'interview_declined',
      'no_show',
      'hired',
      'rejected',
      'despedida'
    )
  );

create or replace function public.transition_job_application_stage(
  p_application_id uuid,
  p_to_stage text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text,
  p_note text default null,
  p_interview_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $transition$
declare
  v_app public.job_applications%rowtype;
  v_interview_at timestamptz;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_app
  from public.job_applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'application not found';
  end if;
  if p_to_stage not in (
    'inbound', 'interview_pending', 'interview_scheduled', 'interview_declined',
    'no_show', 'hired', 'rejected', 'despedida'
  ) then
    raise exception 'invalid stage';
  end if;
  if p_to_stage = 'hired' and v_app.team_member_id is null then
    raise exception 'hired requires a team member link';
  end if;
  if p_to_stage = 'interview_scheduled' and p_interview_at is null then
    raise exception 'interview requires a date';
  end if;
  if p_to_stage in ('interview_declined', 'no_show', 'rejected', 'despedida')
    and nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'a note is required';
  end if;
  if v_app.stage = p_to_stage
    and not (
      p_to_stage = 'interview_scheduled'
      and p_interview_at is distinct from v_app.interview_at
    ) then
    return jsonb_build_object('id', v_app.id, 'stage', v_app.stage, 'unchanged', true);
  end if;

  v_interview_at := case
    when p_to_stage = 'interview_scheduled' then p_interview_at
    when p_to_stage = 'no_show' then coalesce(v_app.interview_at, p_interview_at)
    else null
  end;

  update public.job_applications
  set
    stage = p_to_stage,
    interview_at = v_interview_at,
    needs_stage_review = false,
    legacy_stage = null,
    hired_at = case
      when p_to_stage = 'hired' then coalesce(hired_at, now())
      else hired_at
    end,
    updated_at = now()
  where id = p_application_id;

  if p_to_stage = 'despedida' and v_app.directory_id is not null then
    update public.crm_directory
    set tags = coalesce(tags, '{}'::text[]) || array['Despedida']
    where id = v_app.directory_id
      and not exists (
        select 1 from unnest(coalesce(tags, '{}'::text[])) t
        where lower(t) = 'despedida'
      );
  end if;

  perform app_private.record_job_application_event(
    p_application_id,
    'stage_changed',
    v_app.stage,
    p_to_stage,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label,
    jsonb_build_object(
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'interview_at', coalesce(p_interview_at, v_app.interview_at)
    )
  );

  return jsonb_build_object('id', p_application_id, 'stage', p_to_stage);
end;
$transition$;

create or replace function public.job_applications_metrics(
  p_include_marian boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $metrics$
declare
  v_result jsonb;
begin
  perform app_private.assert_job_admin_or_service();

  select jsonb_build_object(
    'total', count(*) filter (where p_include_marian or cohort = 'job'),
    'job', count(*) filter (where cohort = 'job'),
    'marianSpecial', count(*) filter (where cohort = 'marian_special'),
    'needsReview', count(*) filter (where needs_review and (p_include_marian or cohort = 'job')),
    'needsStageReview', count(*) filter (where needs_stage_review and (p_include_marian or cohort = 'job')),
    'inbound', count(*) filter (where stage = 'inbound' and (p_include_marian or cohort = 'job')),
    'priority', count(*) filter (
      where fit_rank = 2 and stage = 'inbound' and (p_include_marian or cohort = 'job')
    ),
    'interviewsOpen', count(*) filter (
      where stage in ('interview_pending', 'interview_scheduled')
        and (p_include_marian or cohort = 'job')
    ),
    'hired', count(*) filter (where stage = 'hired' and (p_include_marian or cohort = 'job')),
    'closures', count(*) filter (
      where stage in ('rejected', 'interview_declined', 'no_show', 'despedida')
        and (p_include_marian or cohort = 'job')
    ),
    'rejectedOrWithdrawn', count(*) filter (
      where stage in ('rejected', 'interview_declined', 'no_show', 'despedida')
        and (p_include_marian or cohort = 'job')
    ),
    'byStage', coalesce(
      (
        select jsonb_object_agg(stage, n)
        from (
          select stage, count(*)::int as n
          from public.job_applications
          where deleted_at is null
            and (p_include_marian or cohort = 'job')
          group by stage
        ) s
      ),
      '{}'::jsonb
    ),
    'bySourceChannel', coalesce(
      (
        select jsonb_object_agg(source_channel, n)
        from (
          select source_channel, count(*)::int as n
          from public.job_applications
          where deleted_at is null
            and (p_include_marian or cohort = 'job')
          group by source_channel
        ) s
      ),
      '{}'::jsonb
    )
  )
  into v_result
  from public.job_applications
  where deleted_at is null;

  return v_result;
end;
$metrics$;

create or replace function public.append_job_context_from_application(
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $ctx$
declare
  v_dir_id uuid;
  v_notes text;
  v_name text;
  v_phone text;
  v_stage text;
  v_summary text;
  v_evidence text;
  v_stamp text;
  v_vigente text;
  v_entry text;
  v_block text;
begin
  select a.directory_id, c.full_name, c.phone, a.stage
  into v_dir_id, v_name, v_phone, v_stage
  from public.job_applications a
  join public.job_candidates c on c.id = a.candidate_id
  where a.id = p_application_id
    and a.deleted_at is null;
  if v_dir_id is null then
    return;
  end if;

  select d.internal_notes into v_notes
  from public.crm_directory d
  where d.id = v_dir_id
  for update;
  if not found then
    return;
  end if;
  if position('Expediente de empleo' in coalesce(v_notes, '')) > 0 then
    return;
  end if;

  select e.summary,
    nullif(e.scores->'cleaning_experience'->>'evidence', 'null')
  into v_summary, v_evidence
  from public.job_candidate_evaluations e
  where e.application_id = p_application_id
  order by e.created_at desc
  limit 1;

  v_stamp := to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI');
  v_summary := nullif(btrim(coalesce(v_summary, '')), '');
  v_vigente := left(coalesce(
    v_summary,
    'Postulante ' || coalesce(v_name, 'sin nombre') || '. Aún no hay hoja de vida analizada.'
  ), 280);
  v_entry := left(
    'Expediente de empleo. ' || coalesce(v_name, 'Sin nombre')
    || '. Teléfono ' || coalesce(v_phone, 'sin teléfono')
    || '. Etapa ' || coalesce(v_stage, 'inbound')
    || '. ' || coalesce(v_summary, 'Sin análisis de hoja de vida.')
    || case when v_evidence is not null and v_evidence <> '' and v_evidence <> '[]'
      then ' Experiencia citada: ' || v_evidence else '' end,
    1200
  );
  v_block := '### ' || v_stamp || ' · bot 312' || E'\n' || v_entry;

  if nullif(btrim(coalesce(v_notes, '')), '') is null then
    v_notes := '[Vigente ' || v_stamp || ' Bogotá] ' || v_vigente
      || E'\n---\n## Diario\n' || v_block || E'\n';
  elsif v_notes ~ '^\[Vigente ' and position('## Diario' in v_notes) > 0 then
    v_notes := btrim(v_notes) || E'\n\n' || v_block || E'\n';
  else
    v_notes := '[Vigente ' || v_stamp || ' Bogotá] ' || v_vigente
      || E'\n---\n## Diario\n### ' || v_stamp || ' · campo' || E'\n' || btrim(v_notes)
      || E'\n\n' || v_block || E'\n';
  end if;

  update public.crm_directory
  set internal_notes = v_notes
  where id = v_dir_id;
end;
$ctx$;

revoke all on function public.append_job_context_from_application(uuid) from public, anon, authenticated;
grant execute on function public.append_job_context_from_application(uuid) to service_role;

do $$
declare
  r record;
begin
  for r in
    select a.id
    from public.job_applications a
    where a.deleted_at is null
      and a.cohort = 'job'
      and a.directory_id is not null
  loop
    perform public.append_job_context_from_application(r.id);
  end loop;
end $$;
