-- Historial de ejecuciones del scheduler de recordatorios 24h + preferencias por destinatario.

create table if not exists public.reminder_batch_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  run_kind text not null check (run_kind in ('primary', 'retry')),
  scheduler_name text not null,
  service_date date not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reminder_batch_runs_service_date_run_at_idx
  on public.reminder_batch_runs (service_date, run_at desc);

create table if not exists public.reminder_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references public.reminder_batch_runs(id) on delete cascade,
  appointment_id text not null,
  recipient_type text not null check (recipient_type in ('client', 'professional')),
  recipient_key text,
  recipient_name text,
  phone text,
  scheduled_date timestamptz,
  appointment_status text,
  delivery_status text not null,
  reminders_enabled boolean not null default true,
  sent_at timestamptz,
  template_name text,
  wa_message_id text,
  failure_reason text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  message_body text,
  conversation_stable_key text,
  address text,
  professional_name text,
  client_name text,
  log_status text,
  log_created_at timestamptz,
  log_error_message text,
  created_at timestamptz not null default now(),
  unique (batch_run_id, appointment_id, recipient_type)
);

create index if not exists reminder_batch_items_batch_run_id_idx
  on public.reminder_batch_items (batch_run_id);

create table if not exists public.reminder_recipient_preferences (
  recipient_key text not null,
  recipient_type text not null check (recipient_type in ('client', 'professional')),
  reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  notes text,
  primary key (recipient_key, recipient_type)
);

create index if not exists reminder_recipient_preferences_type_key_idx
  on public.reminder_recipient_preferences (recipient_type, recipient_key);

alter table public.reminder_batch_runs enable row level security;
alter table public.reminder_batch_items enable row level security;
alter table public.reminder_recipient_preferences enable row level security;

drop policy if exists "CRM admins manage reminder batch runs" on public.reminder_batch_runs;
create policy "CRM admins manage reminder batch runs"
on public.reminder_batch_runs for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage reminder batch items" on public.reminder_batch_items;
create policy "CRM admins manage reminder batch items"
on public.reminder_batch_items for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop policy if exists "CRM admins manage reminder recipient preferences" on public.reminder_recipient_preferences;
create policy "CRM admins manage reminder recipient preferences"
on public.reminder_recipient_preferences for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_reminder_recipient_preferences_updated_at on public.reminder_recipient_preferences;
create trigger set_reminder_recipient_preferences_updated_at
before update on public.reminder_recipient_preferences
for each row execute function public.set_updated_at();
