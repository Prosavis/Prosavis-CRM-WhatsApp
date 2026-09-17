-- Visitas inteligentes: ficha viva, runs, evidencia, feedback y propuestas.
-- El JSON de Grok no es SSOT. A–E, citas Firestore y pagos siguen canónicos.

alter table public.visit_routes
  add column if not exists intelligence_generated_at timestamptz,
  add column if not exists travel_provider text,
  add column if not exists estimated_duration_minutes integer,
  add column if not exists geo_notes jsonb not null default '{}'::jsonb;

alter table public.visit_routes
  drop constraint if exists visit_routes_travel_provider_check;
alter table public.visit_routes
  add constraint visit_routes_travel_provider_check check (
    travel_provider is null
    or travel_provider in ('google_routes', 'euclidean_fallback')
  );

alter table public.visit_routes
  drop constraint if exists visit_routes_estimated_duration_check;
alter table public.visit_routes
  add constraint visit_routes_estimated_duration_check check (
    estimated_duration_minutes is null or estimated_duration_minutes >= 0
  );

alter table public.visit_routes
  drop constraint if exists visit_routes_geo_notes_object_check;
alter table public.visit_routes
  add constraint visit_routes_geo_notes_object_check check (
    jsonb_typeof(geo_notes) = 'object'
  );

create table if not exists public.visit_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  kind text not null,
  status text not null default 'queued',
  triggered_by text not null,
  batch_size integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  directory_id uuid references public.crm_directory (id) on delete set null,
  feedback_id uuid,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_intelligence_runs_kind_check check (
    kind in ('baseline', 'incremental', 'feedback')
  ),
  constraint visit_intelligence_runs_status_check check (
    status in ('queued', 'running', 'completed', 'failed')
  ),
  constraint visit_intelligence_runs_counts_check check (
    batch_size >= 0
    and processed_count >= 0
    and failed_count >= 0
    and processed_count + failed_count <= batch_size
  ),
  constraint visit_intelligence_runs_completion_check check (
    (status in ('queued', 'running') and completed_at is null)
    or (status in ('completed', 'failed'))
  )
);

create table if not exists public.visit_client_intelligence (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  directory_id uuid not null references public.crm_directory (id) on delete cascade,
  schema_version integer not null default 1,
  profile jsonb not null default '{}'::jsonb,
  eligible_reason text not null,
  visit_need text not null default 'optional',
  geo_quality text not null default 'missing',
  confidence numeric(4, 3) not null default 0,
  dirty boolean not null default true,
  source_cursors jsonb not null default '{}'::jsonb,
  source_freshness jsonb not null default '{}'::jsonb,
  last_run_id uuid references public.visit_intelligence_runs (id) on delete set null,
  last_analyzed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_client_intelligence_unique unique (service_id, directory_id),
  constraint visit_client_intelligence_schema_check check (schema_version = 1),
  constraint visit_client_intelligence_profile_object_check check (
    jsonb_typeof(profile) = 'object'
  ),
  constraint visit_client_intelligence_eligible_check check (
    eligible_reason in ('recurrent', 'complaint_override')
  ),
  constraint visit_client_intelligence_need_check check (
    visit_need in ('required_complaint', 'recommended', 'optional', 'none')
  ),
  constraint visit_client_intelligence_geo_check check (
    geo_quality in ('exact', 'approximate', 'missing', 'ambiguous')
  ),
  constraint visit_client_intelligence_confidence_check check (
    confidence >= 0 and confidence <= 1
  )
);

create table if not exists public.visit_intelligence_evidence (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  directory_id uuid not null references public.crm_directory (id) on delete cascade,
  run_id uuid references public.visit_intelligence_runs (id) on delete set null,
  source text not null,
  external_id text,
  occurred_at timestamptz,
  excerpt text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint visit_intelligence_evidence_source_check check (
    source in (
      'directory',
      'appointment',
      'appointment_d',
      'whatsapp_bot_312',
      'whatsapp_commercial_311',
      'gmail',
      'complaint',
      'app',
      'cleaner',
      'drawer_a',
      'drawer_b',
      'drawer_c',
      'drawer_e',
      'payment',
      'feedback',
      'metrics'
    )
  ),
  constraint visit_intelligence_evidence_excerpt_check check (
    length(trim(excerpt)) between 1 and 2000
  )
);

create table if not exists public.visit_feedback_requests (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  directory_id uuid not null references public.crm_directory (id) on delete cascade,
  run_id uuid references public.visit_intelligence_runs (id) on delete set null,
  rating smallint,
  comment text,
  requested_by text not null,
  status text not null default 'received',
  webhook_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_feedback_requests_rating_check check (
    rating is null or rating between 1 and 5
  ),
  constraint visit_feedback_requests_status_check check (
    status in ('received', 'queued', 'running', 'completed', 'failed')
  ),
  constraint visit_feedback_requests_comment_check check (
    comment is null or length(trim(comment)) between 1 and 2000
  )
);

create table if not exists public.visit_action_proposals (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  directory_id uuid not null references public.crm_directory (id) on delete cascade,
  run_id uuid references public.visit_intelligence_runs (id) on delete set null,
  tool_name text not null,
  bot_role text not null,
  arguments jsonb not null default '{}'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  risk text not null default 'normal',
  source_versions jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  justification text not null,
  evidence_ids uuid[] not null default '{}',
  status text not null default 'proposed',
  executed_at timestamptz,
  executed_by text,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_action_proposals_idempotency unique (service_id, idempotency_key),
  constraint visit_action_proposals_risk_check check (
    risk in ('normal', 'sensitive', 'danger')
  ),
  constraint visit_action_proposals_status_check check (
    status in (
      'proposed',
      'confirmed',
      'executing',
      'executed',
      'rejected',
      'stale',
      'failed'
    )
  ),
  constraint visit_action_proposals_idempotency_nonempty_check check (
    length(trim(idempotency_key)) between 8 and 200
  ),
  constraint visit_action_proposals_justification_check check (
    length(trim(justification)) between 3 and 1000
  ),
  constraint visit_action_proposals_tool_check check (
    length(trim(tool_name)) between 3 and 80
  )
);

alter table public.visit_intelligence_runs
  drop constraint if exists visit_intelligence_runs_feedback_fkey;
alter table public.visit_intelligence_runs
  add constraint visit_intelligence_runs_feedback_fkey
  foreign key (feedback_id) references public.visit_feedback_requests (id)
  on delete set null;

create index if not exists visit_client_intelligence_dirty_idx
  on public.visit_client_intelligence (service_id, dirty, last_analyzed_at)
  where dirty = true;
create index if not exists visit_client_intelligence_need_idx
  on public.visit_client_intelligence (service_id, visit_need, geo_quality);
create index if not exists visit_intelligence_runs_service_created_idx
  on public.visit_intelligence_runs (service_id, created_at desc);
create index if not exists visit_intelligence_evidence_client_idx
  on public.visit_intelligence_evidence (service_id, directory_id, created_at desc);
create index if not exists visit_feedback_requests_status_idx
  on public.visit_feedback_requests (service_id, status, created_at desc);
create index if not exists visit_action_proposals_client_status_idx
  on public.visit_action_proposals (service_id, directory_id, status, created_at desc);

drop trigger if exists set_visit_intelligence_runs_updated_at on public.visit_intelligence_runs;
create trigger set_visit_intelligence_runs_updated_at
before update on public.visit_intelligence_runs
for each row execute function public.set_updated_at();

drop trigger if exists set_visit_client_intelligence_updated_at on public.visit_client_intelligence;
create trigger set_visit_client_intelligence_updated_at
before update on public.visit_client_intelligence
for each row execute function public.set_updated_at();

drop trigger if exists set_visit_feedback_requests_updated_at on public.visit_feedback_requests;
create trigger set_visit_feedback_requests_updated_at
before update on public.visit_feedback_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_visit_action_proposals_updated_at on public.visit_action_proposals;
create trigger set_visit_action_proposals_updated_at
before update on public.visit_action_proposals
for each row execute function public.set_updated_at();

alter table public.visit_client_intelligence enable row level security;
alter table public.visit_intelligence_runs enable row level security;
alter table public.visit_intelligence_evidence enable row level security;
alter table public.visit_feedback_requests enable row level security;
alter table public.visit_action_proposals enable row level security;

drop policy if exists visit_client_intelligence_admin_all on public.visit_client_intelligence;
create policy visit_client_intelligence_admin_all
on public.visit_client_intelligence for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists visit_intelligence_runs_admin_all on public.visit_intelligence_runs;
create policy visit_intelligence_runs_admin_all
on public.visit_intelligence_runs for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists visit_intelligence_evidence_admin_all on public.visit_intelligence_evidence;
create policy visit_intelligence_evidence_admin_all
on public.visit_intelligence_evidence for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists visit_feedback_requests_admin_all on public.visit_feedback_requests;
create policy visit_feedback_requests_admin_all
on public.visit_feedback_requests for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

drop policy if exists visit_action_proposals_admin_all on public.visit_action_proposals;
create policy visit_action_proposals_admin_all
on public.visit_action_proposals for all to authenticated
using ((select app_private.is_crm_admin()))
with check ((select app_private.is_crm_admin()));

revoke all on table
  public.visit_client_intelligence,
  public.visit_intelligence_runs,
  public.visit_intelligence_evidence,
  public.visit_feedback_requests,
  public.visit_action_proposals
from public, anon;

grant select, insert, update, delete on table
  public.visit_client_intelligence,
  public.visit_intelligence_runs,
  public.visit_intelligence_evidence,
  public.visit_feedback_requests,
  public.visit_action_proposals
to authenticated;

grant select, insert, update, delete on table
  public.visit_client_intelligence,
  public.visit_intelligence_runs,
  public.visit_intelligence_evidence,
  public.visit_feedback_requests,
  public.visit_action_proposals
to service_role;
