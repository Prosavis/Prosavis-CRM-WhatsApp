-- Historial, eventos y preferencias de la automatización WhatsApp post-servicio.

create table if not exists public.whatsapp_post_service_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  run_kind text not null check (run_kind in ('primary', 'retry', 'manual', 'dry_run')),
  scheduler_name text not null,
  appointment_id text not null check (length(trim(appointment_id)) > 0),
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  dry_run boolean not null default false,
  delivery_state text not null default 'pending' check (
    delivery_state in ('pending', 'sending', 'sent', 'failed', 'skipped')
  ),
  summary jsonb not null default '{}'::jsonb,
  execution_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_post_service_runs_run_at_idx
  on public.whatsapp_post_service_runs (run_at desc);

create index if not exists whatsapp_post_service_runs_appointment_run_at_idx
  on public.whatsapp_post_service_runs (appointment_id, run_at desc);

create index if not exists whatsapp_post_service_runs_idempotency_key_idx
  on public.whatsapp_post_service_runs (idempotency_key, run_at desc);

-- Serializa intentos reales por cita. Un proceso que caiga después de llamar
-- Meta conserva `sending`, bloqueando duplicados hasta conciliación manual.
create unique index if not exists whatsapp_post_service_runs_one_delivery_idx
  on public.whatsapp_post_service_runs (appointment_id)
  where delivery_state in ('sending', 'sent');

create table if not exists public.whatsapp_post_service_events (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null
    references public.whatsapp_post_service_runs(id) on delete cascade,
  appointment_id text not null check (length(trim(appointment_id)) > 0),
  directory_id uuid references public.crm_directory(id) on delete set null,
  recipient_phone text,
  recipient_name text,
  service_date text not null,
  template_name text not null check (length(trim(template_name)) > 0),
  outcome text not null check (
    outcome in (
      'sent',
      'failed',
      'dry_run',
      'skipped_duplicate',
      'skipped_opt_out',
      'skipped_status',
      'skipped_disabled',
      'skipped_blacklisted',
      'skipped_invalid_phone'
    )
  ),
  error_message text,
  wa_message_id text,
  message_body text,
  request_body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_post_service_events_batch_run_id_idx
  on public.whatsapp_post_service_events (batch_run_id);

create index if not exists whatsapp_post_service_events_appointment_created_at_idx
  on public.whatsapp_post_service_events (appointment_id, created_at desc);

create index if not exists whatsapp_post_service_events_directory_created_at_idx
  on public.whatsapp_post_service_events (directory_id, created_at desc)
  where directory_id is not null;

create index if not exists whatsapp_post_service_events_outcome_created_at_idx
  on public.whatsapp_post_service_events (outcome, created_at desc);

-- Un solo éxito por cita. Los fallos y dry-runs siguen siendo insertables
-- para conservar el historial completo de reintentos.
create unique index if not exists whatsapp_post_service_events_one_sent_per_appointment_idx
  on public.whatsapp_post_service_events (appointment_id)
  where outcome = 'sent';

create table if not exists public.whatsapp_post_service_preferences (
  directory_id uuid primary key references public.crm_directory(id) on delete cascade,
  post_service_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  notes text
);

create index if not exists whatsapp_post_service_preferences_enabled_idx
  on public.whatsapp_post_service_preferences (post_service_enabled);

alter table public.whatsapp_post_service_runs enable row level security;
alter table public.whatsapp_post_service_events enable row level security;
alter table public.whatsapp_post_service_preferences enable row level security;

drop policy if exists "CRM admins manage post service runs"
  on public.whatsapp_post_service_runs;
create policy "CRM admins manage post service runs"
on public.whatsapp_post_service_runs for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage post service events"
  on public.whatsapp_post_service_events;
create policy "CRM admins manage post service events"
on public.whatsapp_post_service_events for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage post service preferences"
  on public.whatsapp_post_service_preferences;
create policy "CRM admins manage post service preferences"
on public.whatsapp_post_service_preferences for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_post_service_preferences_updated_at
  on public.whatsapp_post_service_preferences;
create trigger set_whatsapp_post_service_preferences_updated_at
before update on public.whatsapp_post_service_preferences
for each row execute function public.set_updated_at();
