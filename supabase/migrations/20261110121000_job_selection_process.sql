-- Selection process: ingreso + interview stages, interview date, and a
-- cleaning-experience rank computed from facts already stored.
-- Inserts that still say "new" are stored as inbound.

alter table public.job_applications
  drop constraint if exists job_applications_stage_check;

alter table public.job_applications
  add column if not exists interview_at timestamptz,
  add column if not exists needs_stage_review boolean not null default false,
  add column if not exists legacy_stage text,
  add column if not exists fit_rank smallint not null default 0;

alter table public.job_applications
  drop constraint if exists job_applications_fit_rank_check;

alter table public.job_applications
  add constraint job_applications_fit_rank_check check (fit_rank between 0 and 2);

do $$
declare
  r record;
  v_to text;
  v_review boolean;
begin
  for r in
    select id, stage
    from public.job_applications
    where stage in (
      'new', 'pending_review', 'contacted', 'interviewed', 'trial', 'possible', 'withdrawn'
    )
  loop
    v_review := r.stage in ('contacted', 'interviewed', 'trial', 'possible');
    v_to := case when r.stage = 'withdrawn' then 'rejected' else 'inbound' end;
    update public.job_applications
    set
      stage = v_to,
      needs_stage_review = v_review,
      legacy_stage = case when v_review then r.stage else null end,
      updated_at = now()
    where id = r.id;
    perform app_private.record_job_application_event(
      r.id,
      'stage_changed',
      r.stage,
      v_to,
      'system',
      'job-stage-reclass',
      'Reclasificación',
      jsonb_build_object('note', 'Reclasificación: etapa anterior ' || r.stage)
    );
  end loop;
end $$;

alter table public.job_applications
  add constraint job_applications_stage_check check (
    stage in (
      'inbound',
      'interview_pending',
      'interview_scheduled',
      'interview_declined',
      'no_show',
      'hired',
      'rejected'
    )
  );

alter table public.job_applications
  drop constraint if exists job_applications_interview_at_check;

alter table public.job_applications
  add constraint job_applications_interview_at_check check (
    stage <> 'interview_scheduled' or interview_at is not null
  );

alter table public.job_applications
  alter column stage set default 'inbound';

create index if not exists job_applications_fit_idx
  on public.job_applications (cohort, stage, fit_rank desc, created_at desc)
  where deleted_at is null;

create or replace function app_private.fold_job_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $fold$
  select translate(
    lower(coalesce(p_text, '')),
    'áéíóúüñàèìòùäëïöâêîôû',
    'aeiouunaeiouaeioaeiou'
  );
$fold$;

create or replace function app_private.job_cleaning_fit(p_facts jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fit$
declare
  v_fact jsonb;
  v_quote text;
  v_text text;
  v_matches int := 0;
  v_rich boolean := false;
  v_evidence jsonb := '[]'::jsonb;
  v_score numeric := 0;
begin
  if p_facts is null or jsonb_typeof(p_facts) <> 'array' then
    return jsonb_build_object('score', 0, 'evidence', '[]'::jsonb);
  end if;

  for v_fact in select value from jsonb_array_elements(p_facts)
  loop
    v_quote := btrim(coalesce(v_fact->>'evidence', ''));
    if v_quote = '' then
      continue;
    end if;
    v_text := app_private.fold_job_text(
      coalesce(v_fact->>'key', '') || ' ' || coalesce(v_fact->>'value', '') || ' ' || v_quote
    );
    if v_text !~ 'aseo|limpieza|oficios|empleada domestica|domestica|hogar' then
      continue;
    end if;
    v_matches := v_matches + 1;
    if jsonb_array_length(v_evidence) < 3 then
      v_evidence := v_evidence || jsonb_build_array(v_quote);
    end if;
    if app_private.fold_job_text(coalesce(v_fact->>'value', '') || ' ' || v_quote)
      ~ '\y(19[0-9]{2}|20[0-9]{2}|[0-9]+[[:space:]]*(anos|meses)|bogota|medellin|cali|barranquilla|hospital|empresa|conjunto|casa|oficina|apartamento)\y'
    then
      v_rich := true;
    end if;
  end loop;

  if v_matches = 0 then
    v_score := 0;
    v_evidence := '[]'::jsonb;
  elsif v_matches >= 2 or v_rich then
    v_score := 1;
  else
    v_score := 0.7;
  end if;

  return jsonb_build_object('score', v_score, 'evidence', v_evidence);
end;
$fit$;

revoke all on function app_private.fold_job_text(text) from public, anon, authenticated;
revoke all on function app_private.job_cleaning_fit(jsonb) from public, anon, authenticated;

do $$
declare
  r record;
  v_fit jsonb;
  v_rank smallint;
  v_eval uuid;
  v_rubric uuid;
begin
  select id into v_rubric
  from public.job_evaluation_rubrics
  where is_active
  order by version desc
  limit 1;

  for r in
    with asset_latest as (
      select distinct on (d.application_id, d.asset_id)
        d.application_id,
        rsl.facts
      from public.job_application_documents d
      join public.document_analysis_results rsl on rsl.asset_id = d.asset_id
      order by d.application_id, d.asset_id, rsl.created_at desc
    )
    select
      application_id,
      coalesce(
        jsonb_agg(elem) filter (where elem is not null),
        '[]'::jsonb
      ) as facts
    from asset_latest
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(facts) = 'array' then facts else '[]'::jsonb end
    ) elem on true
    group by application_id
  loop
    v_fit := app_private.job_cleaning_fit(r.facts);
    v_rank := case
      when (v_fit->>'score')::numeric >= 0.7
        and jsonb_typeof(v_fit->'evidence') = 'array'
        and jsonb_array_length(v_fit->'evidence') > 0 then 2
      else 1
    end;

    update public.job_applications
    set fit_rank = v_rank
    where id = r.application_id;

    v_eval := null;
    select id into v_eval
    from public.job_candidate_evaluations
    where application_id = r.application_id
    order by created_at desc
    limit 1;

    if v_eval is not null then
      update public.job_candidate_evaluations
      set scores = jsonb_set(
        case when jsonb_typeof(scores) = 'object' then scores else '{}'::jsonb end,
        '{cleaning_experience}',
        jsonb_build_object(
          'score', (v_fit->>'score')::numeric,
          'evidence', coalesce(v_fit->'evidence', '[]'::jsonb)
        ),
        true
      )
      where id = v_eval;
    elsif v_rubric is not null then
      insert into public.job_candidate_evaluations (
        application_id, rubric_id, scores, model, schema_version
      ) values (
        r.application_id,
        v_rubric,
        jsonb_build_object(
          'cleaning_experience',
          jsonb_build_object(
            'score', (v_fit->>'score')::numeric,
            'evidence', coalesce(v_fit->'evidence', '[]'::jsonb)
          )
        ),
        'empleo-extract-v1',
        'empleo-extract-v1'
      );
    end if;
  end loop;
end $$;

create or replace function app_private.coerce_job_application_stage()
returns trigger
language plpgsql
set search_path = ''
as $coerce$
begin
  if new.stage in ('new', 'pending_review', 'contacted', 'interviewed', 'trial', 'possible') then
    new.stage := 'inbound';
  elsif new.stage = 'withdrawn' then
    new.stage := 'rejected';
  end if;
  return new;
end;
$coerce$;

drop trigger if exists job_applications_coerce_stage on public.job_applications;
create trigger job_applications_coerce_stage
  before insert or update on public.job_applications
  for each row execute function app_private.coerce_job_application_stage();

revoke all on function app_private.coerce_job_application_stage() from public, anon, authenticated;

drop function if exists public.transition_job_application_stage(uuid, text, text, text, text, text);

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
    'no_show', 'hired', 'rejected'
  ) then
    raise exception 'invalid stage';
  end if;
  if p_to_stage = 'hired' and v_app.team_member_id is null then
    raise exception 'hired requires a team member link';
  end if;
  if p_to_stage = 'interview_scheduled' and p_interview_at is null then
    raise exception 'interview requires a date';
  end if;
  if p_to_stage in ('interview_declined', 'no_show', 'rejected')
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

revoke all on function public.transition_job_application_stage(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.transition_job_application_stage(uuid, text, text, text, text, text, timestamptz)
  to service_role;

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
      where stage in ('rejected', 'interview_declined', 'no_show')
        and (p_include_marian or cohort = 'job')
    ),
    'rejectedOrWithdrawn', count(*) filter (
      where stage in ('rejected', 'interview_declined', 'no_show')
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
