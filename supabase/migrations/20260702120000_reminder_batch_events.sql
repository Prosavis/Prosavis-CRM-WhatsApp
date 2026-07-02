-- Eventos por ejecución del scheduler de recordatorios 24h + execution_stats en runs.

alter table public.reminder_batch_runs
  add column if not exists execution_stats jsonb not null default '{}'::jsonb;

alter table public.reminder_batch_runs
  drop constraint if exists reminder_batch_runs_run_kind_check;

alter table public.reminder_batch_runs
  add constraint reminder_batch_runs_run_kind_check
  check (run_kind in ('primary', 'retry', 'manual'));

create table if not exists public.reminder_batch_events (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references public.reminder_batch_runs(id) on delete cascade,
  appointment_id text not null,
  recipient_type text not null check (recipient_type in ('client', 'professional')),
  outcome text not null check (
    outcome in (
      'sent',
      'failed',
      'skipped_already_sent',
      'skipped_disabled',
      'skipped_missing_phone',
      'skipped_missing_professional',
      'skipped_max_attempts'
    )
  ),
  error_message text,
  wa_message_id text,
  attempt_number integer,
  created_at timestamptz not null default now(),
  unique (batch_run_id, appointment_id, recipient_type)
);

create index if not exists reminder_batch_events_batch_run_id_idx
  on public.reminder_batch_events (batch_run_id);

alter table public.reminder_batch_events enable row level security;

drop policy if exists "CRM admins manage reminder batch events" on public.reminder_batch_events;
create policy "CRM admins manage reminder batch events"
on public.reminder_batch_events for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());
