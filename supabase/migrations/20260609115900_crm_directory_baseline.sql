-- Baseline local: crm_directory se creó originalmente fuera de git (dashboard/MCP).
-- CREATE TABLE IF NOT EXISTS es no-op en remoto si la tabla ya existe.
-- No hacer db push de esta versión sin reconciliar schema_migrations.

create table if not exists public.crm_directory (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  display_name text,
  email text,
  phone text,
  photo_url text,
  address text,
  notes text,
  app_user_id text,
  is_app_user boolean not null default false,
  provider_id text,
  service_id text,
  classification text not null default 'unknown',
  quality_tag text not null default 'standard',
  status text not null default 'active',
  source text,
  channels text[] not null default '{}',
  payment_status text,
  pending_amount numeric(12, 2),
  pending_appointments_count integer,
  last_charged_amount numeric(12, 2),
  otp_required boolean,
  preferred_service_address_line text,
  preferred_service_address_ref text,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  messages_count integer not null default 0,
  active_sequence text not null default 'NINGUNA',
  sequence_step integer not null default 0,
  opt_out boolean not null default false,
  last_response_text text,
  last_response_at timestamptz,
  last_whatsapp_message_at timestamptz,
  last_whatsapp_message_text text,
  last_whatsapp_intent text,
  unread_whatsapp_count integer not null default 0,
  whatsapp_assigned_to text,
  whatsapp_conversation_id text,
  appointment_id text,
  internal_notes text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index if not exists crm_directory_service_id_idx
  on public.crm_directory (service_id);
create index if not exists crm_directory_phone_idx
  on public.crm_directory (phone);
create index if not exists crm_directory_app_user_id_idx
  on public.crm_directory (app_user_id);
