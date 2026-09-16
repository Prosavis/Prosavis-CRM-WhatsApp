-- Solicitudes de empleo + servicio documental reusable.
-- Auditoría 16/09/2026: crm_directory ya tiene RLS remoto (admins_*);
-- este módulo no altera ese contrato.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Document intelligence (reusable)
-- ---------------------------------------------------------------------------

create table public.document_assets (
  id uuid primary key default gen_random_uuid(),
  sha256 text,
  mime_type text not null,
  kind text not null,
  byte_size bigint,
  bucket_id text not null default 'crm-documents',
  storage_path text not null,
  original_filename text,
  page_count integer,
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  constraint document_assets_kind_check check (
    kind in ('pdf', 'image', 'audio', 'video', 'other')
  ),
  constraint document_assets_byte_size_check check (
    byte_size is null or byte_size >= 0
  )
);

create unique index document_assets_sha256_uidx
  on public.document_assets (sha256);
create unique index document_assets_storage_uidx
  on public.document_assets (bucket_id, storage_path);
create index document_assets_kind_idx
  on public.document_assets (kind, created_at desc);

create table public.document_sources (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.document_assets (id) on delete set null,
  source_kind text not null,
  whatsapp_message_log_id uuid,
  conversation_stable_key text,
  directory_id uuid references public.crm_directory (id) on delete set null,
  uploaded_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_sources_kind_check check (
    source_kind in ('whatsapp_message', 'manual_upload', 'backfill', 'storage_copy')
  ),
  constraint document_sources_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index document_sources_message_uidx
  on public.document_sources (whatsapp_message_log_id);
create index document_sources_asset_idx
  on public.document_sources (asset_id, created_at desc);
create index document_sources_directory_idx
  on public.document_sources (directory_id, created_at desc);

create table public.document_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.document_assets (id) on delete cascade,
  kind text not null,
  schema_version text not null default 'empleo-extract-v1',
  model text,
  status text not null default 'queued',
  priority integer not null default 100,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lock_owner text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_analysis_jobs_kind_check check (
    kind in ('resume_extract', 'audio_transcript', 'image_extract')
  ),
  constraint document_analysis_jobs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  constraint document_analysis_jobs_attempts_check check (
    attempts >= 0 and max_attempts between 1 and 100
  ),
  constraint document_analysis_jobs_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint document_analysis_jobs_lease_check check (
    (
      status = 'running'
      and lock_owner is not null
      and locked_at is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'running'
      and lock_owner is null
      and locked_at is null
      and lease_expires_at is null
    )
  )
);

create unique index document_analysis_jobs_active_uidx
  on public.document_analysis_jobs (asset_id, kind, schema_version)
  where status in ('queued', 'running');
create index document_analysis_jobs_claim_idx
  on public.document_analysis_jobs (available_at, priority, created_at)
  where status = 'queued';
create index document_analysis_jobs_stale_idx
  on public.document_analysis_jobs (lease_expires_at)
  where status = 'running';

drop trigger if exists set_document_analysis_jobs_updated_at on public.document_analysis_jobs;
create trigger set_document_analysis_jobs_updated_at
  before update on public.document_analysis_jobs
  for each row execute function public.set_updated_at();

create table public.document_analysis_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.document_analysis_jobs (id) on delete set null,
  asset_id uuid not null references public.document_assets (id) on delete cascade,
  kind text not null,
  schema_version text not null,
  model text not null,
  result jsonb not null default '{}'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  subjects jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  created_at timestamptz not null default now(),
  constraint document_analysis_results_kind_check check (
    kind in ('resume_extract', 'audio_transcript', 'image_extract')
  ),
  constraint document_analysis_results_result_object_check check (
    jsonb_typeof(result) = 'object'
  ),
  constraint document_analysis_results_confidence_check check (
    confidence is null or confidence between 0 and 1
  )
);

create unique index document_analysis_results_cache_uidx
  on public.document_analysis_results (asset_id, kind, schema_version, model);
create index document_analysis_results_asset_idx
  on public.document_analysis_results (asset_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Recruitment domain
-- ---------------------------------------------------------------------------

create table public.job_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  display_name text,
  phone text,
  phone_key text,
  email text,
  email_key text,
  document_number text,
  document_key text,
  location_text text,
  identity_basis text not null default 'sender_directory',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint job_candidates_identity_basis_check check (
    identity_basis in ('sender_directory', 'extracted', 'manual', 'merged')
  )
);

create index job_candidates_phone_key_idx
  on public.job_candidates (phone_key)
  where phone_key is not null and deleted_at is null;
create index job_candidates_email_key_idx
  on public.job_candidates (email_key)
  where email_key is not null and deleted_at is null;
create index job_candidates_document_key_idx
  on public.job_candidates (document_key)
  where document_key is not null and deleted_at is null;
create index job_candidates_name_idx
  on public.job_candidates (lower(full_name));

drop trigger if exists set_job_candidates_updated_at on public.job_candidates;
create trigger set_job_candidates_updated_at
  before update on public.job_candidates
  for each row execute function public.set_updated_at();

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.job_candidates (id) on delete restrict,
  directory_id uuid references public.crm_directory (id) on delete set null,
  cohort text not null,
  stage text not null default 'new',
  assigned_to text,
  team_member_service_id text,
  team_member_id text,
  source_channel text not null default 'whatsapp',
  needs_review boolean not null default false,
  review_reason text,
  origin_label text,
  is_primary boolean not null default true,
  split_from_id uuid references public.job_applications (id) on delete set null,
  created_by_kind text not null default 'system',
  created_by text,
  created_by_label text,
  hired_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_applications_cohort_check check (
    cohort in ('job', 'marian_special')
  ),
  constraint job_applications_stage_check check (
    stage in (
      'new',
      'pending_review',
      'contacted',
      'interviewed',
      'trial',
      'possible',
      'hired',
      'rejected',
      'withdrawn'
    )
  ),
  constraint job_applications_source_channel_check check (
    source_channel in ('whatsapp', 'manual', 'backfill')
  ),
  constraint job_applications_actor_kind_check check (
    created_by_kind in ('supabase', 'firebase', 'system')
  ),
  constraint job_applications_hired_team_check check (
    (stage <> 'hired')
    or (team_member_id is not null and team_member_service_id is not null)
  ),
  constraint job_applications_team_member_fkey
    foreign key (team_member_service_id, team_member_id)
    references public.crm_team_members (service_id, id)
);

create unique index job_applications_primary_sender_uidx
  on public.job_applications (directory_id, cohort)
  where deleted_at is null and is_primary and directory_id is not null;
create index job_applications_stage_idx
  on public.job_applications (cohort, stage, created_at desc)
  where deleted_at is null;
create index job_applications_review_idx
  on public.job_applications (needs_review, created_at desc)
  where deleted_at is null and needs_review;
create index job_applications_candidate_idx
  on public.job_applications (candidate_id, created_at desc);
create index job_applications_team_member_idx
  on public.job_applications (team_member_service_id, team_member_id)
  where team_member_id is not null;

drop trigger if exists set_job_applications_updated_at on public.job_applications;
create trigger set_job_applications_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

create table public.job_application_sources (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  source_kind text not null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  conversation_stable_key text,
  tag_name text,
  intent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_application_sources_kind_check check (
    source_kind in ('directory_tag', 'conversation', 'message', 'intent', 'manual')
  ),
  constraint job_application_sources_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index job_application_sources_dedupe_uidx
  on public.job_application_sources (
    application_id,
    source_kind,
    coalesce(directory_id::text, ''),
    coalesce(conversation_stable_key, ''),
    coalesce(tag_name, '')
  );
create index job_application_sources_app_idx
  on public.job_application_sources (application_id, created_at desc);

create table public.job_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  asset_id uuid not null references public.document_assets (id) on delete cascade,
  source_id uuid references public.document_sources (id) on delete set null,
  role text not null default 'supporting',
  created_at timestamptz not null default now(),
  constraint job_application_documents_role_check check (
    role in ('cv', 'supporting', 'audio', 'image', 'video')
  )
);

create unique index job_application_documents_uidx
  on public.job_application_documents (application_id, asset_id);
create index job_application_documents_asset_idx
  on public.job_application_documents (asset_id);

create table public.job_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  event_type text not null,
  from_stage text,
  to_stage text,
  actor_kind text not null,
  actor_id text,
  actor_label text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_application_events_type_check check (
    event_type in (
      'created',
      'stage_changed',
      'assigned',
      'split',
      'merged',
      'hire_linked',
      'hire_unlinked',
      'deleted',
      'document_attached',
      'review_flagged',
      'evaluation_scored',
      'backfilled',
      'media_enqueued'
    )
  ),
  constraint job_application_events_actor_kind_check check (
    actor_kind in ('supabase', 'firebase', 'system')
  ),
  constraint job_application_events_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  )
);

create index job_application_events_app_idx
  on public.job_application_events (application_id, created_at desc);
create index job_application_events_type_idx
  on public.job_application_events (event_type, created_at desc);

create table public.job_evaluation_rubrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  is_active boolean not null default false,
  criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_evaluation_rubrics_version_check check (version > 0),
  constraint job_evaluation_rubrics_criteria_array_check check (
    jsonb_typeof(criteria) = 'array'
  )
);

create unique index job_evaluation_rubrics_name_version_uidx
  on public.job_evaluation_rubrics (name, version);
create unique index job_evaluation_rubrics_active_uidx
  on public.job_evaluation_rubrics (is_active)
  where is_active;

create table public.job_candidate_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  rubric_id uuid not null references public.job_evaluation_rubrics (id),
  scores jsonb not null default '{}'::jsonb,
  summary text,
  model text,
  schema_version text,
  created_at timestamptz not null default now(),
  constraint job_candidate_evaluations_scores_object_check check (
    jsonb_typeof(scores) = 'object'
  )
);

create index job_candidate_evaluations_app_idx
  on public.job_candidate_evaluations (application_id, created_at desc);

create table public.data_processing_evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.job_applications (id) on delete set null,
  directory_id uuid references public.crm_directory (id) on delete set null,
  purpose text not null default 'recruitment_evaluation',
  notice_version text not null default 'empleo-v1-2026-09-16',
  sensitive_consent_status text not null default 'not_collected',
  retention_policy text not null default 'until_deletion_request',
  origin text not null,
  created_at timestamptz not null default now(),
  constraint data_processing_evidence_consent_check check (
    sensitive_consent_status in ('not_collected', 'granted', 'denied', 'withdrawn')
  ),
  constraint data_processing_evidence_retention_check check (
    retention_policy in ('until_deletion_request', 'fixed_days')
  )
);

create index data_processing_evidence_app_idx
  on public.data_processing_evidence (application_id, created_at desc);

insert into public.job_evaluation_rubrics (name, version, is_active, criteria)
values (
  'auxiliar-limpieza',
  1,
  true,
  '[
    {"key":"cleaning_experience","label":"Experiencia en limpieza","description":"Servicios de aseo, casas, empresas u hospitales citados en evidencia."},
    {"key":"availability","label":"Disponibilidad","description":"Horarios, turnos, inmediatez o restricciones dichas por la persona."},
    {"key":"location_travel","label":"Ubicación y desplazamiento","description":"Barrio, comuna, ciudad y disposición a desplazarse."},
    {"key":"references","label":"Referencias","description":"Contactos o empleadores anteriores verificables."},
    {"key":"documentation","label":"Documentación","description":"Hoja de vida, cédula u otros soportes enviados."}
  ]'::jsonb
)
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-documents',
  'crm-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'video/mp4',
    'video/3gpp',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  t text;
begin
  foreach t in array array[
    'document_assets',
    'document_sources',
    'document_analysis_jobs',
    'document_analysis_results',
    'job_candidates',
    'job_applications',
    'job_application_sources',
    'job_application_documents',
    'job_application_events',
    'job_evaluation_rubrics',
    'job_candidate_evaluations',
    'data_processing_evidence'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_admin_select',
      t
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.is_crm_admin())',
      t || '_admin_select',
      t
    );
  end loop;
end
$$;

comment on table public.job_applications is
  'Ciclo de selección. Contratada exige vínculo a crm_team_members.';
comment on table public.document_assets is
  'Bytes documentales reusables (PDF, imagen, audio, video). Bucket privado.';
comment on column public.data_processing_evidence.sensitive_consent_status is
  'v1: not_collected. No fingir consentimiento explícito del titular.';
