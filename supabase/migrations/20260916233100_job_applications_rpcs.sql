-- RPC, triggers y cron del módulo de solicitudes / documentos.

create or replace function app_private.job_normalize_tag(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'))), '');
$$;

create or replace function app_private.job_cohort_from_tag(p_tag text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case app_private.job_normalize_tag(p_tag)
    when 'marian' then 'marian_special'
    when 'job' then 'job'
    when 'jobs' then 'job'
    when 'trabajo' then 'job'
    when 'trabajo/cv' then 'job'
    when 'trabajo / cv' then 'job'
    else null
  end;
$$;

create or replace function app_private.job_cohorts_from_tag_names(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(distinct c order by c)
      from (
        select app_private.job_cohort_from_tag(t) as c
        from unnest(coalesce(p_tags, '{}'::text[])) as t
      ) s
      where c is not null
    ),
    '{}'::text[]
  );
$$;

create or replace function app_private.job_phone_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or length(regexp_replace(p_value, '\D', '', 'g')) < 7 then null
    else right(regexp_replace(p_value, '\D', '', 'g'), 10)
  end;
$$;

create or replace function app_private.job_document_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or length(regexp_replace(p_value, '\D', '', 'g')) < 5 then null
    else regexp_replace(p_value, '\D', '', 'g')
  end;
$$;

create or replace function app_private.job_email_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or position('@' in lower(btrim(p_value))) = 0 then null
    else lower(btrim(p_value))
  end;
$$;

create or replace function app_private.job_name_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    lower(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'))),
    ''
  );
$$;

create or replace function app_private.assert_job_admin_or_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is not null and not app_private.is_crm_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.record_job_application_event(
  p_application_id uuid,
  p_event_type text,
  p_from_stage text,
  p_to_stage text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.job_application_events (
    application_id, event_type, from_stage, to_stage,
    actor_kind, actor_id, actor_label, payload
  ) values (
    p_application_id,
    p_event_type,
    p_from_stage,
    p_to_stage,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

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

  if found then
    v_application_id := v_app.id;
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
    full_name,
    display_name,
    phone,
    phone_key,
    email,
    email_key,
    identity_basis
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
    candidate_id,
    directory_id,
    cohort,
    stage,
    source_channel,
    origin_label,
    created_by_kind,
    created_by,
    created_by_label
  ) values (
    v_candidate_id,
    p_directory_id,
    p_cohort,
    'new',
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
    v_application_id,
    'directory_tag',
    p_directory_id,
    p_conversation_stable_key,
    coalesce(p_tag_name, p_cohort),
    p_intent,
    jsonb_build_object('origin', p_origin)
  )
  on conflict do nothing;

  if p_conversation_stable_key is not null then
    insert into public.job_application_sources (
      application_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
    ) values (
      v_application_id,
      'conversation',
      p_directory_id,
      p_conversation_stable_key,
      p_tag_name,
      p_intent,
      jsonb_build_object('origin', p_origin)
    )
    on conflict do nothing;
  end if;

  insert into public.data_processing_evidence (
    application_id, directory_id, purpose, notice_version,
    sensitive_consent_status, retention_policy, origin
  ) values (
    v_application_id,
    p_directory_id,
    'recruitment_evaluation',
    'empleo-v1-2026-09-16',
    'not_collected',
    'until_deletion_request',
    p_origin
  );

  perform app_private.record_job_application_event(
    v_application_id,
    case when p_origin = 'backfill' then 'backfilled' else 'created' end,
    null,
    'new',
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    coalesce(p_actor_label, 'system'),
    jsonb_build_object(
      'cohort', p_cohort,
      'directoryId', p_directory_id,
      'origin', p_origin
    )
  );

  return v_application_id;
end;
$$;

create or replace function public.ingest_job_application_from_directory(
  p_directory_id uuid,
  p_actor_kind text default 'system',
  p_actor_id text default null,
  p_actor_label text default null,
  p_origin text default 'tag',
  p_conversation_stable_key text default null,
  p_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dir public.crm_directory%rowtype;
  v_cohorts text[];
  v_cohort text;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_dir from public.crm_directory where id = p_directory_id;
  if not found then
    raise exception 'directory not found';
  end if;

  v_cohorts := app_private.job_cohorts_from_tag_names(v_dir.tags);
  if coalesce(array_length(v_cohorts, 1), 0) = 0 then
    return jsonb_build_object('applicationIds', '[]'::jsonb, 'skipped', true);
  end if;

  foreach v_cohort in array v_cohorts
  loop
    v_id := app_private.ensure_job_application_for_sender(
      p_directory_id,
      v_cohort,
      p_conversation_stable_key,
      p_actor_kind,
      p_actor_id,
      p_actor_label,
      p_origin,
      v_cohort,
      p_intent
    );
    v_ids := array_append(v_ids, v_id);
    perform public.enqueue_whatsapp_media_for_application(v_id);
  end loop;

  return jsonb_build_object(
    'applicationIds', to_jsonb(v_ids),
    'cohorts', to_jsonb(v_cohorts)
  );
end;
$$;

create or replace function public.ingest_job_application_from_conversation(
  p_stable_key text,
  p_actor_kind text default 'system',
  p_actor_id text default null,
  p_actor_label text default null,
  p_origin text default 'tag'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.whatsapp_conversations%rowtype;
  v_tag_names text[];
  v_cohorts text[];
  v_directory_id uuid;
  v_phone text;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_conv
  from public.whatsapp_conversations
  where stable_key = p_stable_key;
  if not found then
    return jsonb_build_object('skipped', true, 'reason', 'conversation_not_found');
  end if;

  select coalesce(array_agg(t.name), '{}'::text[])
  into v_tag_names
  from unnest(coalesce(v_conv.tag_ids, '{}'::uuid[])) as tid
  join public.whatsapp_chat_tags t on t.id = tid;

  v_cohorts := app_private.job_cohorts_from_tag_names(v_tag_names);
  if coalesce(array_length(v_cohorts, 1), 0) = 0 then
    return jsonb_build_object('skipped', true, 'reason', 'no_trabajo_tags');
  end if;

  v_phone := coalesce(v_conv.contact_phone, v_conv.phone);
  select id into v_directory_id
  from public.crm_directory
  where whatsapp_conversation_id = v_conv.stable_key
     or whatsapp_commercial_conversation_id = v_conv.stable_key
  limit 1;

  if v_directory_id is null and app_private.job_phone_key(v_phone) is not null then
    select id into v_directory_id
    from public.crm_directory
    where phone_key = app_private.job_phone_key(v_phone)
    order by updated_at desc
    limit 1;
  end if;

  if v_directory_id is null then
    return jsonb_build_object('skipped', true, 'reason', 'directory_not_found');
  end if;

  return public.ingest_job_application_from_directory(
    v_directory_id,
    p_actor_kind,
    p_actor_id,
    p_actor_label,
    p_origin,
    v_conv.stable_key,
    null
  );
end;
$$;

create or replace function app_private.trg_ingest_job_from_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  v_actor := coalesce(auth.uid()::text, 'system/tag_sync');
  perform public.ingest_job_application_from_conversation(
    new.stable_key,
    case when auth.uid() is null then 'system' else 'supabase' end,
    v_actor,
    case when auth.uid() is null then 'Sincronización de tags' else v_actor end,
    'tag'
  );
  return new;
end;
$$;

drop trigger if exists trg_ingest_job_from_conversation on public.whatsapp_conversations;
create trigger trg_ingest_job_from_conversation
  after insert or update of tag_ids
  on public.whatsapp_conversations
  for each row
  execute function app_private.trg_ingest_job_from_conversation();

create or replace function public.enqueue_whatsapp_media_for_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications%rowtype;
  v_keys text[];
  v_enqueued int := 0;
  v_linked int := 0;
  r record;
  v_kind text;
  v_asset_id uuid;
  v_source_id uuid;
  v_role text;
  v_analysis_kind text;
  v_sha text;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_app
  from public.job_applications
  where id = p_application_id and deleted_at is null;
  if not found then
    raise exception 'application not found';
  end if;

  select coalesce(array_agg(distinct key), '{}')
  into v_keys
  from (
    select conversation_stable_key as key
    from public.job_application_sources
    where application_id = p_application_id
      and conversation_stable_key is not null
    union
    select d.whatsapp_conversation_id
    from public.crm_directory d
    where d.id = v_app.directory_id
      and d.whatsapp_conversation_id is not null
    union
    select d.whatsapp_commercial_conversation_id
    from public.crm_directory d
    where d.id = v_app.directory_id
      and d.whatsapp_commercial_conversation_id is not null
  ) keys
  where key is not null;

  for r in
    select
      l.id,
      l.conversation_stable_key,
      l.media_type,
      l.mime_type,
      l.storage_path,
      l.size_bytes,
      l.filename,
      l.voice_transcription,
      a.sha256,
      a.bucket_id
    from public.whatsapp_message_log l
    left join public.whatsapp_media_assets a on a.message_log_id = l.id
    where l.direction = 'inbound'
      and l.conversation_stable_key = any (v_keys)
      and l.media_type in ('document', 'image', 'audio', 'video')
      and l.crm_deleted_at is null
  loop
    if r.storage_path is null and r.sha256 is null then
      continue;
    end if;

    v_kind := case
      when coalesce(r.mime_type, '') ilike '%pdf%' then 'pdf'
      when r.media_type = 'image' or coalesce(r.mime_type, '') like 'image/%' then 'image'
      when r.media_type = 'audio' or coalesce(r.mime_type, '') like 'audio/%' then 'audio'
      when r.media_type = 'video' or coalesce(r.mime_type, '') like 'video/%' then 'video'
      else 'other'
    end;

    v_sha := nullif(r.sha256, '');
    if v_sha is not null then
      select id into v_asset_id
      from public.document_assets
      where sha256 = v_sha
      limit 1;
    else
      v_asset_id := null;
    end if;

    if v_asset_id is null and r.storage_path is not null then
      select id into v_asset_id
      from public.document_assets
      where bucket_id = coalesce(nullif(r.bucket_id, ''), 'whatsapp-media')
        and storage_path = r.storage_path
      limit 1;
    end if;

    if v_asset_id is null and r.storage_path is not null then
      insert into public.document_assets (
        sha256, mime_type, kind, byte_size, bucket_id, storage_path, original_filename
      ) values (
        v_sha,
        coalesce(nullif(r.mime_type, ''), 'application/octet-stream'),
        v_kind,
        r.size_bytes,
        coalesce(nullif(r.bucket_id, ''), 'whatsapp-media'),
        r.storage_path,
        r.filename
      )
      returning id into v_asset_id;
    end if;

    if v_asset_id is null then
      continue;
    end if;

    insert into public.document_sources (
      asset_id, source_kind, whatsapp_message_log_id, conversation_stable_key,
      directory_id, metadata
    ) values (
      v_asset_id,
      case when v_app.source_channel = 'backfill' then 'backfill' else 'whatsapp_message' end,
      r.id,
      r.conversation_stable_key,
      v_app.directory_id,
      jsonb_build_object(
        'mediaType', r.media_type,
        'hasTranscript', r.voice_transcription is not null
      )
    )
    on conflict (whatsapp_message_log_id)
    do update set asset_id = excluded.asset_id
    returning id into v_source_id;

    v_role := case
      when v_kind = 'pdf' then 'cv'
      when v_kind = 'audio' then 'audio'
      when v_kind = 'image' then 'image'
      when v_kind = 'video' then 'video'
      else 'supporting'
    end;

    insert into public.job_application_documents (
      application_id, asset_id, source_id, role
    ) values (
      p_application_id, v_asset_id, v_source_id, v_role
    )
    on conflict (application_id, asset_id) do nothing;
    if found then
      v_linked := v_linked + 1;
    end if;

    if v_kind = 'video' then
      continue;
    end if;

    v_analysis_kind := case
      when v_kind = 'audio' then 'audio_transcript'
      when v_kind = 'image' then 'image_extract'
      else 'resume_extract'
    end;

    insert into public.document_analysis_jobs (
      asset_id, kind, schema_version, payload
    ) values (
      v_asset_id,
      v_analysis_kind,
      'empleo-extract-v1',
      jsonb_build_object(
        'applicationId', p_application_id,
        'messageLogId', r.id,
        'reuseTranscript', r.voice_transcription is not null
      )
    )
    on conflict do nothing;
    if found then
      v_enqueued := v_enqueued + 1;
    end if;
  end loop;

  if v_enqueued > 0 then
    perform app_private.record_job_application_event(
      p_application_id,
      'media_enqueued',
      null,
      null,
      'system',
      'enqueue_whatsapp_media',
      'Ingesta de adjuntos',
      jsonb_build_object('enqueued', v_enqueued, 'linked', v_linked)
    );
  end if;

  return jsonb_build_object('enqueued', v_enqueued, 'linked', v_linked);
end;
$$;

create or replace function public.claim_document_analysis_jobs(
  p_worker text,
  p_limit integer default 4,
  p_lease_duration interval default interval '8 minutes'
)
returns setof public.document_analysis_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(btrim(p_worker), ''), '') = '' then
    raise exception 'worker is required';
  end if;
  if p_limit < 1 or p_limit > 20 then
    raise exception 'limit must be between 1 and 20';
  end if;
  if p_lease_duration < interval '30 seconds' or p_lease_duration > interval '30 minutes' then
    raise exception 'lease duration out of range';
  end if;

  update public.document_analysis_jobs
  set
    status = case
      when attempts + 1 >= max_attempts then 'failed'
      else 'queued'
    end,
    lock_owner = null,
    locked_at = null,
    lease_expires_at = null,
    available_at = case
      when attempts + 1 >= max_attempts then available_at
      else now() + interval '30 seconds'
    end,
    last_error = case
      when attempts + 1 >= max_attempts
        then coalesce(last_error, 'maximum attempts reached after stale lease')
      else last_error
    end,
    updated_at = now()
  where status = 'running'
    and lease_expires_at <= now();

  return query
  with claimed as (
    select j.id
    from public.document_analysis_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
    order by j.priority, j.available_at, j.created_at
    limit p_limit
    for update skip locked
  )
  update public.document_analysis_jobs j
  set
    status = 'running',
    lock_owner = p_worker,
    locked_at = now(),
    lease_expires_at = now() + p_lease_duration,
    attempts = j.attempts + 1,
    updated_at = now()
  from claimed
  where j.id = claimed.id
  returning j.*;
end;
$$;

create or replace function public.complete_document_analysis_job(
  p_job_id uuid,
  p_worker text,
  p_model text,
  p_result jsonb,
  p_facts jsonb default '[]'::jsonb,
  p_subjects jsonb default '[]'::jsonb,
  p_evidence jsonb default '[]'::jsonb,
  p_confidence numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.document_analysis_jobs%rowtype;
  v_result_id uuid;
begin
  select * into v_job
  from public.document_analysis_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.status <> 'running' or v_job.lock_owner is distinct from p_worker then
    raise exception 'job lease is not owned by worker';
  end if;
  if v_job.lease_expires_at <= now() then
    raise exception 'job lease has expired';
  end if;

  insert into public.document_analysis_results (
    job_id, asset_id, kind, schema_version, model, result, facts, subjects, evidence, confidence
  ) values (
    v_job.id,
    v_job.asset_id,
    v_job.kind,
    v_job.schema_version,
    coalesce(nullif(p_model, ''), 'unknown'),
    coalesce(p_result, '{}'::jsonb),
    coalesce(p_facts, '[]'::jsonb),
    coalesce(p_subjects, '[]'::jsonb),
    coalesce(p_evidence, '[]'::jsonb),
    p_confidence
  )
  on conflict (asset_id, kind, schema_version, model)
  do update set
    job_id = excluded.job_id,
    result = excluded.result,
    facts = excluded.facts,
    subjects = excluded.subjects,
    evidence = excluded.evidence,
    confidence = excluded.confidence
  returning id into v_result_id;

  update public.document_analysis_jobs
  set
    status = 'succeeded',
    model = coalesce(nullif(p_model, ''), model),
    lock_owner = null,
    locked_at = null,
    lease_expires_at = null,
    last_error = null,
    updated_at = now()
  where id = p_job_id;

  return v_result_id;
end;
$$;

create or replace function public.fail_document_analysis_job(
  p_job_id uuid,
  p_worker text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.document_analysis_jobs%rowtype;
begin
  select * into v_job
  from public.document_analysis_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.lock_owner is distinct from p_worker then
    raise exception 'job lease is not owned by worker';
  end if;

  update public.document_analysis_jobs
  set
    status = case when attempts >= max_attempts then 'failed' else 'queued' end,
    lock_owner = null,
    locked_at = null,
    lease_expires_at = null,
    available_at = case
      when attempts >= max_attempts then available_at
      else now() + (interval '20 seconds' * attempts)
    end,
    last_error = left(coalesce(p_error, 'unknown error'), 1000),
    updated_at = now()
  where id = p_job_id;
end;
$$;

create or replace function public.transition_job_application_stage(
  p_application_id uuid,
  p_to_stage text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications%rowtype;
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
    'new', 'pending_review', 'contacted', 'interviewed', 'trial',
    'possible', 'hired', 'rejected', 'withdrawn'
  ) then
    raise exception 'invalid stage';
  end if;
  if p_to_stage = 'hired' and v_app.team_member_id is null then
    raise exception 'hired requires a team member link';
  end if;
  if v_app.stage = p_to_stage then
    return jsonb_build_object('id', v_app.id, 'stage', v_app.stage, 'unchanged', true);
  end if;

  update public.job_applications
  set
    stage = p_to_stage,
    hired_at = case when p_to_stage = 'hired' then coalesce(hired_at, now()) else hired_at end,
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
    jsonb_build_object('note', p_note)
  );

  return jsonb_build_object('id', p_application_id, 'stage', p_to_stage);
end;
$$;

create or replace function public.assign_job_application(
  p_application_id uuid,
  p_assigned_to text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_job_admin_or_service();
  update public.job_applications
  set assigned_to = nullif(p_assigned_to, ''), updated_at = now()
  where id = p_application_id and deleted_at is null;
  if not found then
    raise exception 'application not found';
  end if;
  perform app_private.record_job_application_event(
    p_application_id,
    'assigned',
    null,
    null,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label,
    jsonb_build_object('assignedTo', p_assigned_to)
  );
  return jsonb_build_object('id', p_application_id, 'assignedTo', p_assigned_to);
end;
$$;

create or replace function public.split_job_application(
  p_application_id uuid,
  p_full_name text,
  p_asset_ids uuid[],
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text,
  p_phone text default null,
  p_email text default null,
  p_document_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications%rowtype;
  v_candidate_id uuid;
  v_new_id uuid;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_app
  from public.job_applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'application not found';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'full_name is required';
  end if;

  insert into public.job_candidates (
    full_name, phone, phone_key, email, email_key, document_number, document_key, identity_basis
  ) values (
    btrim(p_full_name),
    p_phone,
    app_private.job_phone_key(p_phone),
    p_email,
    app_private.job_email_key(p_email),
    p_document_number,
    app_private.job_document_key(p_document_number),
    'extracted'
  )
  returning id into v_candidate_id;

  insert into public.job_applications (
    candidate_id, directory_id, cohort, stage, source_channel, origin_label,
    is_primary, split_from_id, created_by_kind, created_by, created_by_label
  ) values (
    v_candidate_id,
    v_app.directory_id,
    v_app.cohort,
    'new',
    v_app.source_channel,
    v_app.origin_label,
    false,
    v_app.id,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label
  )
  returning id into v_new_id;

  if p_asset_ids is not null then
    update public.job_application_documents
    set application_id = v_new_id
    where application_id = p_application_id
      and asset_id = any (p_asset_ids);
  end if;

  insert into public.data_processing_evidence (
    application_id, directory_id, origin
  ) values (
    v_new_id, v_app.directory_id, 'split'
  );

  perform app_private.record_job_application_event(
    p_application_id, 'split', v_app.stage, v_app.stage,
    coalesce(nullif(p_actor_kind, ''), 'system'), p_actor_id, p_actor_label,
    jsonb_build_object('newApplicationId', v_new_id)
  );
  perform app_private.record_job_application_event(
    v_new_id, 'created', null, 'new',
    coalesce(nullif(p_actor_kind, ''), 'system'), p_actor_id, p_actor_label,
    jsonb_build_object('splitFrom', p_application_id)
  );

  return jsonb_build_object('id', v_new_id, 'candidateId', v_candidate_id);
end;
$$;

create or replace function public.merge_job_applications(
  p_keep_id uuid,
  p_absorb_id uuid,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.job_applications%rowtype;
  v_absorb public.job_applications%rowtype;
begin
  perform app_private.assert_job_admin_or_service();
  if p_keep_id = p_absorb_id then
    raise exception 'cannot merge an application with itself';
  end if;

  select * into v_keep from public.job_applications
  where id = p_keep_id and deleted_at is null for update;
  if not found then raise exception 'keep application not found'; end if;
  select * into v_absorb from public.job_applications
  where id = p_absorb_id and deleted_at is null for update;
  if not found then raise exception 'absorb application not found'; end if;

  update public.job_application_documents
  set application_id = p_keep_id
  where application_id = p_absorb_id
    and not exists (
      select 1 from public.job_application_documents d
      where d.application_id = p_keep_id and d.asset_id = job_application_documents.asset_id
    );
  delete from public.job_application_documents where application_id = p_absorb_id;

  insert into public.job_application_sources (
    application_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
  )
  select p_keep_id, source_kind, directory_id, conversation_stable_key, tag_name, intent, metadata
  from public.job_application_sources
  where application_id = p_absorb_id
  on conflict do nothing;

  update public.job_applications
  set deleted_at = now(), deleted_by = p_actor_id, updated_at = now()
  where id = p_absorb_id;

  perform app_private.record_job_application_event(
    p_keep_id, 'merged', v_keep.stage, v_keep.stage,
    coalesce(nullif(p_actor_kind, ''), 'system'), p_actor_id, p_actor_label,
    jsonb_build_object('absorbedId', p_absorb_id)
  );
  perform app_private.record_job_application_event(
    p_absorb_id, 'merged', v_absorb.stage, v_absorb.stage,
    coalesce(nullif(p_actor_kind, ''), 'system'), p_actor_id, p_actor_label,
    jsonb_build_object('keptId', p_keep_id)
  );

  return jsonb_build_object('id', p_keep_id, 'absorbedId', p_absorb_id);
end;
$$;

create or replace function public.link_job_application_hire(
  p_application_id uuid,
  p_service_id text,
  p_member_id text,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications%rowtype;
  v_member public.crm_team_members%rowtype;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_member
  from public.crm_team_members
  where service_id = p_service_id and id = p_member_id;
  if not found then
    raise exception 'team member not found';
  end if;

  select * into v_app
  from public.job_applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'application not found';
  end if;

  update public.job_applications
  set
    team_member_service_id = p_service_id,
    team_member_id = p_member_id,
    stage = 'hired',
    hired_at = coalesce(hired_at, now()),
    needs_review = false,
    updated_at = now()
  where id = p_application_id;

  perform app_private.record_job_application_event(
    p_application_id,
    'hire_linked',
    v_app.stage,
    'hired',
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label,
    jsonb_build_object(
      'teamMemberId', p_member_id,
      'serviceId', p_service_id,
      'memberName', v_member.name
    )
  );

  return jsonb_build_object(
    'id', p_application_id,
    'stage', 'hired',
    'teamMemberId', p_member_id
  );
end;
$$;

create or replace function public.reconcile_job_hire_from_team_member(
  p_service_id text,
  p_member_id text,
  p_actor_kind text default 'system',
  p_actor_id text default 'firebase/syncTeamMember',
  p_actor_label text default 'Sincronización Equipo'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.crm_team_members%rowtype;
  v_matches uuid[];
  v_id uuid;
begin
  select * into v_member
  from public.crm_team_members
  where service_id = p_service_id and id = p_member_id;
  if not found then
    return jsonb_build_object('linked', false, 'reason', 'member_not_found');
  end if;
  if v_member.is_active is not true then
    return jsonb_build_object('linked', false, 'reason', 'member_inactive');
  end if;

  select coalesce(array_agg(a.id), '{}')
  into v_matches
  from public.job_applications a
  join public.job_candidates c on c.id = a.candidate_id
  where a.deleted_at is null
    and a.stage not in ('hired', 'rejected', 'withdrawn')
    and (
      (
        app_private.job_email_key(v_member.email) is not null
        and c.email_key = app_private.job_email_key(v_member.email)
      )
      or (
        app_private.job_phone_key(v_member.phone_number) is not null
        and c.phone_key = app_private.job_phone_key(v_member.phone_number)
        and app_private.job_name_key(c.full_name) = app_private.job_name_key(v_member.name)
      )
    );

  if coalesce(array_length(v_matches, 1), 0) = 0 then
    return jsonb_build_object('linked', false, 'reason', 'no_open_match');
  end if;
  if array_length(v_matches, 1) > 1 then
    update public.job_applications
    set needs_review = true, review_reason = 'hire_ambiguous', updated_at = now()
    where id = any (v_matches);
    return jsonb_build_object('linked', false, 'reason', 'ambiguous', 'applicationIds', to_jsonb(v_matches));
  end if;

  v_id := v_matches[1];
  return public.link_job_application_hire(
    v_id, p_service_id, p_member_id, p_actor_kind, p_actor_id, p_actor_label
  );
end;
$$;

create or replace function public.delete_job_application(
  p_application_id uuid,
  p_actor_kind text,
  p_actor_id text,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications%rowtype;
begin
  perform app_private.assert_job_admin_or_service();

  select * into v_app
  from public.job_applications
  where id = p_application_id and deleted_at is null
  for update;
  if not found then
    raise exception 'application not found';
  end if;

  update public.job_applications
  set deleted_at = now(), deleted_by = p_actor_id, updated_at = now()
  where id = p_application_id;

  update public.job_candidates
  set deleted_at = now(), updated_at = now()
  where id = v_app.candidate_id
    and not exists (
      select 1 from public.job_applications a
      where a.candidate_id = v_app.candidate_id
        and a.id <> p_application_id
        and a.deleted_at is null
    );

  update public.job_application_events
  set payload = jsonb_build_object(
    'anonymized', true,
    'eventType', event_type,
    'deletedAt', now()
  )
  where application_id = p_application_id;

  perform app_private.record_job_application_event(
    p_application_id,
    'deleted',
    v_app.stage,
    v_app.stage,
    coalesce(nullif(p_actor_kind, ''), 'system'),
    p_actor_id,
    p_actor_label,
    jsonb_build_object('anonymized', true)
  );

  return jsonb_build_object('id', p_application_id, 'deleted', true);
end;
$$;

create or replace function public.job_applications_metrics(
  p_include_marian boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform app_private.assert_job_admin_or_service();

  select jsonb_build_object(
    'total', count(*) filter (where p_include_marian or cohort = 'job'),
    'job', count(*) filter (where cohort = 'job'),
    'marianSpecial', count(*) filter (where cohort = 'marian_special'),
    'needsReview', count(*) filter (where needs_review and (p_include_marian or cohort = 'job')),
    'hired', count(*) filter (where stage = 'hired' and (p_include_marian or cohort = 'job')),
    'rejectedOrWithdrawn', count(*) filter (
      where stage in ('rejected', 'withdrawn') and (p_include_marian or cohort = 'job')
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
$$;

create or replace function public.backfill_job_applications(
  p_dry_run boolean default true,
  p_cohort text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job int := 0;
  v_marian int := 0;
  v_created int := 0;
  r record;
  v_result jsonb;
begin
  perform app_private.assert_job_admin_or_service();

  select
    count(*) filter (
      where 'job' = any (app_private.job_cohorts_from_tag_names(tags))
    ),
    count(*) filter (
      where 'marian_special' = any (app_private.job_cohorts_from_tag_names(tags))
    )
  into v_job, v_marian
  from public.crm_directory;

  if p_dry_run then
    return jsonb_build_object(
      'dryRun', true,
      'jobDirectories', v_job,
      'marianDirectories', v_marian,
      'existingApplications', (
        select count(*) from public.job_applications where deleted_at is null
      )
    );
  end if;

  for r in
    select d.id, app_private.job_cohorts_from_tag_names(d.tags) as cohorts
    from public.crm_directory d
    where app_private.job_cohorts_from_tag_names(d.tags) <> '{}'::text[]
      and (p_cohort is null or p_cohort = any (app_private.job_cohorts_from_tag_names(d.tags)))
      and exists (
        select 1
        from unnest(app_private.job_cohorts_from_tag_names(d.tags)) as c(cohort)
        where (p_cohort is null or c.cohort = p_cohort)
          and not exists (
            select 1
            from public.job_applications a
            where a.directory_id = d.id
              and a.cohort = c.cohort
              and a.deleted_at is null
              and a.is_primary
          )
      )
    order by d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    v_result := public.ingest_job_application_from_directory(
      r.id,
      'system',
      'system/backfill',
      'Migración histórica / actor desconocido',
      'backfill',
      null,
      null
    );
    if v_result ? 'applicationIds' then
      v_created := v_created + jsonb_array_length(v_result -> 'applicationIds');
    end if;
  end loop;

  return jsonb_build_object(
    'dryRun', false,
    'jobDirectories', v_job,
    'marianDirectories', v_marian,
    'processed', v_created
  );
end;
$$;

create or replace function app_private.invoke_document_analysis_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_pending integer;
begin
  select count(*) into v_pending
  from public.document_analysis_jobs
  where status = 'queued' and available_at <= now();
  if v_pending = 0 then
    return;
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'vault' and table_name = 'decrypted_secrets'
  ) then
    return;
  end if;

  begin
    select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds
    where ds.name = 'document_analysis_worker_url'
    limit 1;
    select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
    where ds.name in ('document_analysis_worker_auth', 'service_role_key')
    order by case when ds.name = 'document_analysis_worker_auth' then 0 else 1 end
    limit 1;
  exception when others then
    return;
  end;

  if v_url is null or v_key is null then
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('action', 'process', 'limit', 4)
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'document-analysis-worker';
    perform cron.schedule(
      'document-analysis-worker',
      '* * * * *',
      $job$select app_private.invoke_document_analysis_worker()$job$
    );
  end if;
end
$$;

revoke all on function public.ingest_job_application_from_directory(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ingest_job_application_from_conversation(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.enqueue_whatsapp_media_for_application(uuid) from public, anon, authenticated;
revoke all on function public.claim_document_analysis_jobs(text, integer, interval) from public, anon, authenticated;
revoke all on function public.complete_document_analysis_job(uuid, text, text, jsonb, jsonb, jsonb, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.fail_document_analysis_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.transition_job_application_stage(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.assign_job_application(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.split_job_application(uuid, text, uuid[], text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.merge_job_applications(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.link_job_application_hire(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_job_hire_from_team_member(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_job_application(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.job_applications_metrics(boolean) from public, anon, authenticated;
revoke all on function public.backfill_job_applications(boolean, text, integer) from public, anon, authenticated;

grant execute on function public.ingest_job_application_from_directory(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.ingest_job_application_from_conversation(text, text, text, text, text) to service_role;
grant execute on function public.enqueue_whatsapp_media_for_application(uuid) to service_role;
grant execute on function public.claim_document_analysis_jobs(text, integer, interval) to service_role;
grant execute on function public.complete_document_analysis_job(uuid, text, text, jsonb, jsonb, jsonb, jsonb, numeric) to service_role;
grant execute on function public.fail_document_analysis_job(uuid, text, text) to service_role;
grant execute on function public.transition_job_application_stage(uuid, text, text, text, text, text) to service_role;
grant execute on function public.assign_job_application(uuid, text, text, text, text) to service_role;
grant execute on function public.split_job_application(uuid, text, uuid[], text, text, text, text, text, text) to service_role;
grant execute on function public.merge_job_applications(uuid, uuid, text, text, text) to service_role;
grant execute on function public.link_job_application_hire(uuid, text, text, text, text, text) to service_role;
grant execute on function public.reconcile_job_hire_from_team_member(text, text, text, text, text) to service_role;
grant execute on function public.delete_job_application(uuid, text, text, text) to service_role;
grant execute on function public.job_applications_metrics(boolean) to service_role;
grant execute on function public.backfill_job_applications(boolean, text, integer) to service_role;
