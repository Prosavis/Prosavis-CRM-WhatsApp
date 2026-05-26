-- CRM completo (UserConsole) + tabla auxiliar de migración Firebase → Supabase

-- ---------------------------------------------------------------------------
-- migration_id_map: remapeo de IDs Firestore → Supabase (tags, leads, admins)
-- ---------------------------------------------------------------------------
create table if not exists public.migration_id_map (
  source_collection text not null,
  firebase_id text not null,
  supabase_id text not null,
  created_at timestamptz not null default now(),
  primary key (source_collection, firebase_id)
);

create index if not exists migration_id_map_supabase_id_idx
  on public.migration_id_map (supabase_id);

-- ---------------------------------------------------------------------------
-- crm_clients (colección Firestore: crmClients)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_clients (
  id text primary key,
  doc_id text not null,
  provider_id text not null,
  service_id text not null,
  name text not null,
  email text,
  phone text,
  photo_url text,
  is_app_user boolean not null default false,
  client_classification text check (client_classification in ('company', 'user')),
  quality_tag text check (quality_tag in ('good', 'standard', 'bad')),
  otp_required boolean,
  payment_status text check (payment_status in ('paid', 'pending')),
  pending_amount numeric(12, 2),
  pending_appointments_count integer,
  last_charged_amount numeric(12, 2),
  preferred_service_address_line text,
  preferred_service_address_reference text,
  preferred_address_updated_at timestamptz,
  internal_notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_clients_provider_id_idx on public.crm_clients (provider_id);
create index if not exists crm_clients_service_id_idx on public.crm_clients (service_id);
create index if not exists crm_clients_phone_idx on public.crm_clients (phone);
create index if not exists crm_clients_doc_id_idx on public.crm_clients (doc_id);

-- ---------------------------------------------------------------------------
-- crm_chats + crm_chat_messages (colección Firestore: chats / messages)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_chats (
  id text primary key,
  service_id text not null,
  service_title text not null,
  service_image text,
  client_id text not null,
  client_name text not null,
  client_photo_url text,
  provider_id text not null,
  provider_name text not null,
  provider_photo_url text,
  last_message text not null default '',
  last_message_timestamp timestamptz,
  unread_count_client integer not null default 0,
  unread_count_provider integer not null default 0,
  expires_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  context text check (context in ('service', 'profavor', 'system')),
  is_system_chat boolean not null default false,
  provider_label_ids text[] not null default '{}',
  client_label_ids text[] not null default '{}',
  hidden_by_client boolean not null default false,
  hidden_by_provider boolean not null default false,
  hidden_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_chats_service_id_idx on public.crm_chats (service_id);
create index if not exists crm_chats_client_id_idx on public.crm_chats (client_id);
create index if not exists crm_chats_provider_id_idx on public.crm_chats (provider_id);
create index if not exists crm_chats_last_message_timestamp_idx
  on public.crm_chats (last_message_timestamp desc);

create table if not exists public.crm_chat_messages (
  id text primary key,
  chat_id text not null references public.crm_chats(id) on delete cascade,
  sender_id text not null,
  sender_name text not null,
  content text not null,
  message_timestamp timestamptz not null,
  is_read boolean not null default false,
  message_type text not null default 'text' check (message_type in ('text', 'system')),
  metadata jsonb not null default '{}'
);

create index if not exists crm_chat_messages_chat_id_timestamp_idx
  on public.crm_chat_messages (chat_id, message_timestamp);

-- ---------------------------------------------------------------------------
-- Subcolecciones services/{serviceId}/*
-- ---------------------------------------------------------------------------
create table if not exists public.crm_external_contacts (
  id text not null,
  service_id text not null,
  name text not null,
  phone text not null,
  email text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  status text not null default 'pending' check (status in ('pending', 'contacted')),
  contacted_at timestamptz,
  contacted_via text check (contacted_via in ('whatsapp', 'manual')),
  import_batch_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, id)
);

create index if not exists crm_external_contacts_service_status_idx
  on public.crm_external_contacts (service_id, status);
create index if not exists crm_external_contacts_phone_idx on public.crm_external_contacts (phone);

create table if not exists public.crm_import_batches (
  id text not null,
  service_id text not null,
  file_name text not null,
  total_contacts integer not null default 0,
  imported_contacts integer not null default 0,
  skipped_contacts integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (service_id, id)
);

create table if not exists public.crm_automations (
  id text not null,
  service_id text not null,
  name text not null,
  is_active boolean not null default true,
  trigger jsonb not null default '{}',
  delay jsonb not null default '{}',
  action jsonb not null default '{}',
  action_config jsonb not null default '{}',
  created_by text,
  execution_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, id)
);

create index if not exists crm_automations_service_active_idx
  on public.crm_automations (service_id, is_active);

create table if not exists public.crm_automation_executions (
  automation_id text not null,
  service_id text not null,
  appointment_id text not null,
  status text,
  executed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}',
  primary key (service_id, automation_id, appointment_id)
);

create table if not exists public.crm_tasks (
  id text not null,
  service_id text not null,
  title text not null,
  description text,
  task_type text not null default 'other' check (task_type in ('call', 'followup', 'admin', 'other')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  assignee_id text,
  assignee_name text,
  assignee_photo_url text,
  due_date timestamptz,
  completed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, id)
);

create index if not exists crm_tasks_service_status_idx on public.crm_tasks (service_id, status);
create index if not exists crm_tasks_assignee_id_idx on public.crm_tasks (assignee_id);

create table if not exists public.crm_profile_views (
  id text not null,
  service_id text not null,
  user_id text not null,
  user_name text not null,
  user_photo_url text,
  viewed_at timestamptz not null,
  message_sent boolean not null default false,
  message_sent_at timestamptz,
  primary key (service_id, id)
);

create index if not exists crm_profile_views_service_viewed_at_idx
  on public.crm_profile_views (service_id, viewed_at desc);

create table if not exists public.crm_team_members (
  id text not null,
  service_id text not null,
  user_id text not null,
  puid bigint,
  name text not null,
  email text not null,
  photo_url text,
  phone_number text,
  notes text,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  rating numeric(4, 2),
  review_count integer,
  services_completed integer,
  days_worked_this_month integer,
  worked_dates_this_month text[] not null default '{}',
  is_active boolean not null default true,
  is_manual boolean not null default false,
  bookable_by_clients boolean not null default true,
  commission_amount numeric(12, 2),
  contract_type text check (contract_type in ('part_time', 'full_day')),
  contract_params jsonb not null default '{}',
  metadata jsonb not null default '{}',
  primary key (service_id, id)
);

create index if not exists crm_team_members_service_active_idx
  on public.crm_team_members (service_id, is_active);

-- ---------------------------------------------------------------------------
-- crm_appointments (colección Firestore: appointments)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_appointments (
  id text primary key,
  service_id text not null,
  service_title text not null,
  provider_id text,
  team_member_id text,
  provider_name text not null,
  client_id text not null,
  client_name text not null,
  client_phone text,
  client_app_user_id text,
  status text not null,
  scheduled_date timestamptz not null,
  duration integer not null,
  location jsonb,
  service_address jsonb,
  notes text,
  client_notes text,
  price numeric(12, 2) not null default 0,
  total_amount numeric(12, 2),
  previous_scheduled_date timestamptz,
  original_scheduled_date timestamptz,
  proposed_scheduled_date timestamptz,
  rescheduled_by text,
  reschedule_requested_by text,
  rescheduled_at timestamptz,
  rescheduled_reason text,
  reschedule_request jsonb,
  booking_snapshot jsonb,
  status_history jsonb not null default '[]',
  last_notified_at timestamptz,
  security_pin text,
  otp_required boolean,
  rejection_reason text,
  requires_admin_assignment boolean not null default false,
  rejected_by text[] not null default '{}',
  reminder_task_id text,
  completion_reminder_task_id text,
  review_request_task_id text,
  cleaning_instructions text,
  access_instructions text,
  google_event_id text,
  google_event_id_admin text,
  payment_id text,
  wompi_reference text,
  wompi_transaction_id text,
  payment_method text check (payment_method in ('WOMPI', 'QR', 'CASH')),
  payment_status text,
  paid_amount numeric(12, 2),
  pending_amount numeric(12, 2),
  payment_recorded_at timestamptz,
  payment_recording_notes text,
  contracted_with_products boolean not null default false,
  cancellation_flow jsonb,
  professional_kit_included boolean not null default false,
  professional_kit_fee_cop numeric(12, 2),
  source_channel text,
  service_vertical text,
  neighborhood text,
  is_referral_first_booking boolean not null default false,
  whatsapp_review_sent boolean not null default false,
  whatsapp_review_sent_at timestamptz,
  whatsapp_review_message_id text,
  assigned_via text,
  provider_geo_checkpoints jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_appointments_service_id_idx on public.crm_appointments (service_id);
create index if not exists crm_appointments_client_id_idx on public.crm_appointments (client_id);
create index if not exists crm_appointments_provider_id_idx on public.crm_appointments (provider_id);
create index if not exists crm_appointments_status_idx on public.crm_appointments (status);
create index if not exists crm_appointments_scheduled_date_idx on public.crm_appointments (scheduled_date);

-- ---------------------------------------------------------------------------
-- crm_faqs (colección Firestore: faqs)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_faqs (
  id text primary key,
  keywords text[] not null default '{}',
  question text not null,
  answer text not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_faqs_is_active_idx on public.crm_faqs (is_active);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_crm_clients_updated_at on public.crm_clients;
create trigger set_crm_clients_updated_at
before update on public.crm_clients
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_chats_updated_at on public.crm_chats;
create trigger set_crm_chats_updated_at
before update on public.crm_chats
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_external_contacts_updated_at on public.crm_external_contacts;
create trigger set_crm_external_contacts_updated_at
before update on public.crm_external_contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_automations_updated_at on public.crm_automations;
create trigger set_crm_automations_updated_at
before update on public.crm_automations
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_tasks_updated_at on public.crm_tasks;
create trigger set_crm_tasks_updated_at
before update on public.crm_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_appointments_updated_at on public.crm_appointments;
create trigger set_crm_appointments_updated_at
before update on public.crm_appointments
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_faqs_updated_at on public.crm_faqs;
create trigger set_crm_faqs_updated_at
before update on public.crm_faqs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.migration_id_map enable row level security;
alter table public.crm_clients enable row level security;
alter table public.crm_chats enable row level security;
alter table public.crm_chat_messages enable row level security;
alter table public.crm_external_contacts enable row level security;
alter table public.crm_import_batches enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_automation_executions enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_profile_views enable row level security;
alter table public.crm_team_members enable row level security;
alter table public.crm_appointments enable row level security;
alter table public.crm_faqs enable row level security;

create policy "CRM admins manage migration_id_map"
on public.migration_id_map for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_clients"
on public.crm_clients for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_chats"
on public.crm_chats for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_chat_messages"
on public.crm_chat_messages for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_external_contacts"
on public.crm_external_contacts for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_import_batches"
on public.crm_import_batches for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_automations"
on public.crm_automations for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_automation_executions"
on public.crm_automation_executions for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_tasks"
on public.crm_tasks for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_profile_views"
on public.crm_profile_views for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_team_members"
on public.crm_team_members for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_appointments"
on public.crm_appointments for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage crm_faqs"
on public.crm_faqs for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());
