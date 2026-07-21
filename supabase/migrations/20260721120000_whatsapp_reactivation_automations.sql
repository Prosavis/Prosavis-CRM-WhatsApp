-- Historial + preferencias del motor de reactivaciones WhatsApp.
-- Estado de cadencia vive en crm_directory (active_sequence='REACTIVACION', sequence_step, last_contact_at, opt_out).

create table if not exists public.whatsapp_reactivation_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  run_kind text not null check (run_kind in ('primary', 'retry', 'manual', 'dry_run')),
  scheduler_name text not null,
  run_date date not null,
  summary jsonb not null default '{}'::jsonb,
  execution_stats jsonb not null default '{}'::jsonb,
  dry_run boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_reactivation_runs_run_date_run_at_idx
  on public.whatsapp_reactivation_runs (run_date, run_at desc);

create table if not exists public.whatsapp_reactivation_events (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references public.whatsapp_reactivation_runs(id) on delete cascade,
  directory_id uuid not null,
  recipient_phone text,
  recipient_name text,
  step_number integer not null check (step_number between 1 and 6),
  template_name text not null,
  outcome text not null check (
    outcome in (
      'sent',
      'failed',
      'skipped_opt_out',
      'skipped_disabled',
      'skipped_missing_phone',
      'skipped_paused_reply',
      'skipped_not_due',
      'skipped_blacklisted',
      'skipped_company',
      'skipped_active',
      'skipped_stale',
      'skipped_completed',
      'enrolled',
      'exited_reactivated',
      'exited_completed',
      'exited_opt_out',
      'dry_run'
    )
  ),
  error_message text,
  wa_message_id text,
  last_appointment_date timestamptz,
  days_inactive integer,
  message_body text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_reactivation_events_batch_run_id_idx
  on public.whatsapp_reactivation_events (batch_run_id);

create index if not exists whatsapp_reactivation_events_directory_id_idx
  on public.whatsapp_reactivation_events (directory_id);

create table if not exists public.whatsapp_reactivation_preferences (
  directory_id uuid primary key references public.crm_directory(id) on delete cascade,
  reactivations_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  notes text
);

create index if not exists crm_directory_reactivation_sequence_idx
  on public.crm_directory (active_sequence, sequence_step, last_contact_at)
  where active_sequence = 'REACTIVACION';

alter table public.whatsapp_reactivation_runs enable row level security;
alter table public.whatsapp_reactivation_events enable row level security;
alter table public.whatsapp_reactivation_preferences enable row level security;

drop policy if exists "CRM admins manage reactivation runs" on public.whatsapp_reactivation_runs;
create policy "CRM admins manage reactivation runs"
on public.whatsapp_reactivation_runs for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage reactivation events" on public.whatsapp_reactivation_events;
create policy "CRM admins manage reactivation events"
on public.whatsapp_reactivation_events for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage reactivation preferences" on public.whatsapp_reactivation_preferences;
create policy "CRM admins manage reactivation preferences"
on public.whatsapp_reactivation_preferences for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_reactivation_preferences_updated_at
  on public.whatsapp_reactivation_preferences;
create trigger set_whatsapp_reactivation_preferences_updated_at
before update on public.whatsapp_reactivation_preferences
for each row execute function public.set_updated_at();
