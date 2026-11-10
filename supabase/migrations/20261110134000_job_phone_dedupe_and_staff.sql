-- One person, one application: +57 and the 10-digit number are the same phone.
-- Auxiliares activas quedan Contratadas. Quienes ya no están en el equipo
-- reciben la etiqueta Despedida.

create or replace function app_private.ensure_job_application_for_sender(
  p_directory_id uuid,
  p_cohort text,
  p_conversation_stable_key text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text,
  p_origin text,
  p_tag_name text default null,
  p_intent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dir public.crm_directory%rowtype;
  v_app public.job_applications%rowtype;
  v_candidate_id uuid;
  v_application_id uuid;
  v_channel text;
  v_phone_key text;
begin
  if p_directory_id is null then
    raise exception 'directory_id is required';
  end if;
  if p_cohort not in ('job', 'marian_special') then
    raise exception 'invalid cohort';
  end if;

  select * into v_dir
  from public.crm_directory
  where id = p_directory_id;
  if not found then
    raise exception 'directory not found';
  end if;

  select * into v_app
  from public.job_applications
  where directory_id = p_directory_id
    and cohort = p_cohort
    and deleted_at is null
    and is_primary
  limit 1;

  if not found then
    v_phone_key := app_private.job_phone_key(v_dir.phone);
    if v_phone_key is not null then
      select a.* into v_app
      from public.job_applications a
      join public.job_candidates c on c.id = a.candidate_id
      where a.deleted_at is null
        and a.cohort = p_cohort
        and c.phone_key = v_phone_key
      order by (a.stage = 'hired') desc, a.created_at
      limit 1;
    end if;
  end if;

  if v_app.id is not null then
    v_application_id := v_app.id;
    if v_app.directory_id is null then
      update public.job_applications
      set directory_id = p_directory_id, updated_at = now()
      where id = v_application_id;
    end if;
    insert into public.job_application_sources (
      application_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
    ) values (
      v_application_id,
      case when p_conversation_stable_key is not null then 'conversation' else 'directory_tag' end,
      p_directory_id,
      p_conversation_stable_key,
      p_tag_name,
      p_intent,
      jsonb_build_object('origin', p_origin)
    )
    on conflict do nothing;
    return v_application_id;
  end if;

  insert into public.job_candidates (
    full_name, display_name, phone, phone_key, email, email_key, identity_basis
  ) values (
    coalesce(nullif(btrim(v_dir.full_name), ''), nullif(btrim(v_dir.display_name), ''), 'Candidata sin nombre'),
    v_dir.display_name,
    v_dir.phone,
    app_private.job_phone_key(v_dir.phone),
    v_dir.email,
    app_private.job_email_key(v_dir.email),
    'sender_directory'
  )
  returning id into v_candidate_id;

  v_channel := case
    when p_origin = 'manual' then 'manual'
    when p_origin = 'backfill' then 'backfill'
    else 'whatsapp'
  end;

  insert into public.job_applications (
    candidate_id, directory_id, cohort, stage, source_channel, origin_label,
    created_by_kind, created_by, created_by_label
  ) values (
    v_candidate_id,
    p_directory_id,
    p_cohort,
    'inbound',
    v_channel,
    case
      when p_origin = 'backfill' then 'Migración histórica / actor desconocido'
      else p_actor_label
    end,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    coalesce(p_actor_label, 'system')
  )
  returning id into v_application_id;

  insert into public.job_application_sources (
    application_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
  ) values (
    v_application_id, 'directory_tag', p_directory_id, p_conversation_stable_key,
    coalesce(p_tag_name, p_cohort), p_intent, jsonb_build_object('origin', p_origin)
  )
  on conflict do nothing;

  if p_conversation_stable_key is not null then
    insert into public.job_application_sources (
      application_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
    ) values (
      v_application_id, 'conversation', p_directory_id, p_conversation_stable_key,
      p_tag_name, p_intent, jsonb_build_object('origin', p_origin)
    )
    on conflict do nothing;
  end if;

  insert into public.data_processing_evidence (
    application_id, directory_id, purpose, notice_version,
    sensitive_consent_status, retention_policy, origin
  ) values (
    v_application_id, p_directory_id, 'recruitment_evaluation', 'empleo-v1-2026-09-16',
    'not_collected', 'until_deletion_request', p_origin
  );

  perform app_private.record_job_application_event(
    v_application_id,
    case when p_origin = 'backfill' then 'backfilled' else 'created' end,
    null, 'inbound',
    coalesce(nullif(p_actor_kind, ''), 'system'), p_actor_id, coalesce(p_actor_label, 'system'),
    jsonb_build_object('cohort', p_cohort, 'directoryId', p_directory_id, 'origin', p_origin)
  );

  return v_application_id;
end;
$$;

do $$
declare
  r record;
  v_keep uuid;
  v_other uuid;
  m record;
  v_ids uuid[];
begin
  for r in
    select c.phone_key
    from public.job_applications a
    join public.job_candidates c on c.id = a.candidate_id
    where a.deleted_at is null
      and c.phone_key is not null
    group by c.phone_key
    having count(*) > 1
  loop
    select a.id into v_keep
    from public.job_applications a
    join public.job_candidates c on c.id = a.candidate_id
    left join public.crm_directory d on d.id = a.directory_id
    where a.deleted_at is null
      and c.phone_key = r.phone_key
    order by
      (a.stage = 'hired') desc,
      (exists (
        select 1 from unnest(coalesce(d.tags, '{}'::text[])) t
        where lower(t) in ('auxiliares', 'auxiliar')
      )) desc,
      (a.directory_id is not null) desc,
      a.created_at asc
    limit 1;

    for v_other in
      select a.id
      from public.job_applications a
      join public.job_candidates c on c.id = a.candidate_id
      where a.deleted_at is null
        and c.phone_key = r.phone_key
        and a.id <> v_keep
    loop
      perform public.merge_job_applications(
        v_keep, v_other, 'system', 'phone-dedupe', 'Mismo número'
      );
    end loop;
  end loop;

  for m in
    select id, service_id, phone_number, name
    from public.crm_team_members
    where is_active is true
      and app_private.job_phone_key(phone_number) is not null
  loop
    select coalesce(array_agg(a.id), '{}'::uuid[]) into v_ids
    from public.job_applications a
    join public.job_candidates c on c.id = a.candidate_id
    left join public.crm_directory d on d.id = a.directory_id
    where a.deleted_at is null
      and a.stage <> 'hired'
      and c.phone_key = app_private.job_phone_key(m.phone_number)
      and (
        exists (
          select 1 from unnest(coalesce(d.tags, '{}'::text[])) t
          where lower(t) in ('auxiliares', 'auxiliar')
        )
        or app_private.job_name_key(c.full_name) = app_private.job_name_key(m.name)
      );
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      perform public.link_job_application_hire(
        v_ids[1], m.service_id, m.id, 'system', 'auxiliares-tag', 'Tag Auxiliares'
      );
    end if;
  end loop;

  update public.job_applications a
  set needs_review = false, review_reason = null, updated_at = now()
  where a.deleted_at is null
    and a.review_reason = 'hire_ambiguous'
    and not exists (
      select 1
      from public.job_applications a2
      join public.job_candidates c2 on c2.id = a2.candidate_id
      join public.job_candidates c on c.id = a.candidate_id
      where a2.deleted_at is null
        and a2.id <> a.id
        and c2.phone_key = c.phone_key
    );

  update public.crm_directory d
  set tags = coalesce(d.tags, '{}'::text[]) || array['Despedida']
  where d.phone_key is not null
    and exists (
      select 1 from public.crm_directory other
      where other.phone_key = d.phone_key
        and exists (
          select 1 from unnest(coalesce(other.tags, '{}'::text[])) t
          where lower(t) = 'auxiliares desactivadas'
        )
    )
    and not exists (
      select 1 from unnest(coalesce(d.tags, '{}'::text[])) t
      where lower(t) = 'despedida'
    )
    and exists (
      select 1
      from public.job_applications a
      join public.job_candidates c on c.id = a.candidate_id
      where a.deleted_at is null
        and c.phone_key = d.phone_key
    );
end $$;
