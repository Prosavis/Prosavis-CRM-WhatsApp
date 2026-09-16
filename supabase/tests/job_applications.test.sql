begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

select has_table('public', 'document_assets', 'document assets exist');
select has_table('public', 'document_analysis_jobs', 'analysis jobs exist');
select has_table('public', 'job_candidates', 'candidates exist');
select has_table('public', 'job_applications', 'applications exist');
select has_table('public', 'job_application_events', 'events exist');
select has_table('public', 'data_processing_evidence', 'processing evidence exists');

select has_function(
  'public',
  'ingest_job_application_from_directory',
  'directory ingest RPC exists'
);
select has_function(
  'public',
  'claim_document_analysis_jobs',
  'lease claim RPC exists'
);
select has_function(
  'public',
  'link_job_application_hire',
  'hire link RPC exists'
);

insert into public.crm_directory (
  id, full_name, display_name, phone, email, classification, tags, status, source, channels, service_id
) values (
  '51000000-0000-4000-8000-000000000001',
  'Luisa Postula',
  'Luisa Postula',
  '+573001119991',
  'luisa.job@example.com',
  'user',
  array['Job'],
  'active',
  'WHATSAPP_INBOUND',
  array['WHATSAPP'],
  'svc-jobs-test'
);

select is(
  (public.ingest_job_application_from_directory(
    '51000000-0000-4000-8000-000000000001',
    'system',
    'system/test',
    'tester',
    'tag'
  ) -> 'applicationIds' ->> 0)
  is not null,
  true,
  'tag Job creates an application'
);

select is(
  (
    select count(*)::int
    from public.job_applications
    where directory_id = '51000000-0000-4000-8000-000000000001'
      and deleted_at is null
  ),
  1,
  'directory ingest is idempotent on first pass'
);

select is(
  jsonb_array_length(
    public.ingest_job_application_from_directory(
      '51000000-0000-4000-8000-000000000001',
      'system',
      'system/test',
      'tester',
      'tag'
    ) -> 'applicationIds'
  ),
  1,
  'second ingest returns the same primary application'
);

select is(
  (
    select sensitive_consent_status
    from public.data_processing_evidence
    where directory_id = '51000000-0000-4000-8000-000000000001'
    limit 1
  ),
  'not_collected',
  'consent is recorded as not_collected'
);

select throws_ok(
  $$
    select public.transition_job_application_stage(
      (select id from public.job_applications where directory_id = '51000000-0000-4000-8000-000000000001' limit 1),
      'hired',
      'system',
      'tester',
      'tester',
      null
    )
  $$,
  'hired requires a team member link',
  'hired without Equipo is rejected'
);

select lives_ok(
  $$
    select public.transition_job_application_stage(
      (select id from public.job_applications where directory_id = '51000000-0000-4000-8000-000000000001' limit 1),
      'contacted',
      'system',
      'tester',
      'tester',
      'llamada'
    )
  $$,
  'valid stage transition writes'
);

select is(
  (
    select count(*)::int
    from public.job_application_events
    where application_id = (
      select id from public.job_applications
      where directory_id = '51000000-0000-4000-8000-000000000001'
      limit 1
    )
    and event_type = 'stage_changed'
  ),
  1,
  'stage change is append-only'
);

insert into public.document_assets (id, sha256, mime_type, kind, byte_size, bucket_id, storage_path)
values (
  '61000000-0000-4000-8000-000000000001',
  'aa' || repeat('b', 62),
  'application/pdf',
  'pdf',
  1200,
  'crm-documents',
  'tests/cv-luisa.pdf'
);

insert into public.document_analysis_jobs (asset_id, kind, schema_version)
values (
  '61000000-0000-4000-8000-000000000001',
  'resume_extract',
  'empleo-extract-v1'
);

select is(
  (
    select count(*)::int
    from public.claim_document_analysis_jobs('worker-a', 2, interval '5 minutes')
  ),
  1,
  'worker can claim a queued analysis job'
);

select is(
  (
    select status from public.document_analysis_jobs
    where asset_id = '61000000-0000-4000-8000-000000000001'
  ),
  'running',
  'claimed job is leased as running'
);

select throws_ok(
  $$
    select public.complete_document_analysis_job(
      (select id from public.document_analysis_jobs where asset_id = '61000000-0000-4000-8000-000000000001'),
      'other-worker',
      'gemini-test',
      '{}'::jsonb
    )
  $$,
  'job lease is not owned by worker',
  'completion requires the lease owner'
);

select lives_ok(
  $$
    select public.complete_document_analysis_job(
      (select id from public.document_analysis_jobs where asset_id = '61000000-0000-4000-8000-000000000001'),
      'worker-a',
      'gemini-test',
      '{"ok":true}'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      0.8
    )
  $$,
  'lease owner can complete the job'
);

select is(
  public.job_applications_metrics(false) ->> 'job',
  '1',
  'main KPIs count the Job cohort'
);

select is(
  public.backfill_job_applications(true, null, 50) ->> 'dryRun',
  'true',
  'backfill dry-run does not write'
);

insert into public.crm_team_members (
  id, service_id, user_id, name, email, phone_number, is_active
) values (
  'tm-jobs-1',
  'svc-jobs-test',
  'tm-jobs-1',
  'Luisa Postula',
  'luisa.job@example.com',
  '+573001119991',
  true
);

select is(
  public.reconcile_job_hire_from_team_member(
    'svc-jobs-test',
    'tm-jobs-1',
    'system',
    'firebase/syncTeamMember',
    'Sincronización Equipo'
  ) ->> 'stage',
  'hired',
  'exact identity hire links automatically'
);

select is(
  (
    select stage from public.job_applications
    where directory_id = '51000000-0000-4000-8000-000000000001'
    limit 1
  ),
  'hired',
  'application becomes hired after Equipo link'
);

insert into public.crm_directory (
  id, full_name, phone, classification, tags, status, source, channels, service_id
) values (
  '51000000-0000-4000-8000-000000000002',
  'Marta Marian',
  '+573001119992',
  'user',
  array['Marian'],
  'active',
  'WHATSAPP_INBOUND',
  array['WHATSAPP'],
  'svc-jobs-test'
);

select is(
  public.ingest_job_application_from_directory(
    '51000000-0000-4000-8000-000000000002',
    'system',
    'system/test',
    'tester',
    'tag'
  ) -> 'cohorts' ->> 0,
  'marian_special',
  'Marian becomes a secondary cohort'
);

select is(
  public.job_applications_metrics(false) ->> 'marianSpecial',
  '1',
  'Marian is counted separately and excluded from main total'
);

select is(
  (public.job_applications_metrics(false) ->> 'total')::int,
  1,
  'main total ignores Marian'
);

select lives_ok(
  $$
    select public.split_job_application(
      (select id from public.job_applications where directory_id = '51000000-0000-4000-8000-000000000002' limit 1),
      'Otra Persona',
      '{}'::uuid[],
      'system',
      'tester',
      'tester',
      null,
      null,
      null
    )
  $$,
  'split creates a second candidate from the same sender'
);

select is(
  (
    select count(*)::int
    from public.job_applications
    where directory_id = '51000000-0000-4000-8000-000000000002'
      and deleted_at is null
  ),
  2,
  'one sender can own several applications after split'
);

select is(
  (
    select relrowsecurity from pg_class
    where oid = 'public.job_applications'::regclass
  ),
  true,
  'job_applications has RLS enabled'
);

select * from finish();
rollback;
