-- Visitas centro de mando: actividad, cobros, borrador Grok y feedback contextual.

alter table public.visit_client_intelligence
  add column if not exists latest_activity_at timestamptz,
  add column if not exists pending_reply boolean not null default false,
  add column if not exists urgency text not null default 'low';

alter table public.visit_client_intelligence
  drop constraint if exists visit_client_intelligence_urgency_check;
alter table public.visit_client_intelligence
  add constraint visit_client_intelligence_urgency_check check (
    urgency in ('critical', 'high', 'medium', 'low')
  );

create index if not exists visit_client_intelligence_activity_idx
  on public.visit_client_intelligence (service_id, latest_activity_at desc nulls last);

alter table public.visit_routes
  add column if not exists analysis_version integer not null default 2,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by text,
  add column if not exists generated_by_source text not null default 'system',
  add column if not exists changes jsonb not null default '[]'::jsonb;

alter table public.visit_routes
  drop constraint if exists visit_routes_generated_by_source_check;
alter table public.visit_routes
  add constraint visit_routes_generated_by_source_check check (
    generated_by_source in ('system', 'grok', 'human')
  );

alter table public.visit_routes
  drop constraint if exists visit_routes_changes_array_check;
alter table public.visit_routes
  add constraint visit_routes_changes_array_check check (
    jsonb_typeof(changes) = 'array'
  );

alter table public.visit_feedback_requests
  alter column directory_id drop not null;

alter table public.visit_feedback_requests
  add column if not exists scope text not null default 'client',
  add column if not exists context_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists interpreted_intent text,
  add column if not exists grok_response jsonb,
  add column if not exists audio_storage_path text;

alter table public.visit_feedback_requests
  drop constraint if exists visit_feedback_requests_scope_check;
alter table public.visit_feedback_requests
  add constraint visit_feedback_requests_scope_check check (
    scope in ('client', 'stop', 'route', 'general')
  );

alter table public.visit_feedback_requests
  drop constraint if exists visit_feedback_requests_context_object_check;
alter table public.visit_feedback_requests
  add constraint visit_feedback_requests_context_object_check check (
    jsonb_typeof(context_snapshot) = 'object'
  );

update public.visit_feedback_requests
set comment = coalesce(nullif(trim(comment), ''), 'Feedback sin texto')
where comment is null or length(trim(comment)) = 0;

alter table public.visit_feedback_requests
  drop constraint if exists visit_feedback_requests_comment_check;
alter table public.visit_feedback_requests
  add constraint visit_feedback_requests_comment_check check (
    comment is not null and length(trim(comment)) between 1 and 4000
  );
