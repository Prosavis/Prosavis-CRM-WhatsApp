-- Paridad Panel: leads, descuentos, plantillas IA, columnas mensajes y contactos CRM

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  phone text,
  email text,
  name text,
  address text,
  notes text,
  user_id text,
  channels text[] not null default '{}',
  status text not null default 'PENDIENTE' check (status in (
    'PENDIENTE', 'NO_AGENDO', 'AGENDADO', 'COMPLETADO', 'OPT_OUT', 'PAGO_RECHAZADO'
  )),
  source text not null default 'PANEL' check (source in (
    'META_ADS', 'REFERIDO', 'ORGANICO', 'BROADCAST', 'WHATSAPP_INBOUND', 'PANEL', 'APP_USER'
  )),
  fecha_primer_contacto timestamptz,
  fecha_ultimo_mensaje_enviado timestamptz,
  mensajes_enviados integer not null default 0,
  secuencia_activa text not null default 'NINGUNA' check (secuencia_activa in (
    'SEGUIMIENTO', 'REBOOKING', 'SEGUIMIENTO_PAGO_RECHAZADO', 'NINGUNA'
  )),
  secuencia_paso integer not null default 0,
  opt_out boolean not null default false,
  last_response_text text,
  last_response_at timestamptz,
  appointment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null default 'fixed_cop' check (discount_type in ('fixed_cop', 'percentage')),
  discount_percent numeric(5,2),
  discount_amount_cop numeric(12,2) not null default 0,
  max_redemptions integer,
  redemption_count integer not null default 0,
  description text,
  status text not null default 'active' check (status in ('active', 'redeemed', 'deleted')),
  created_by uuid references auth.users(id),
  redeemed_by text,
  redeemed_at timestamptz,
  appointment_id text,
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_ia_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  variables jsonb not null default '[]',
  created_by uuid references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_contact_profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  user_id text,
  display_name text,
  photo_url text,
  email text,
  notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_conversations
  add column if not exists user_id text,
  add column if not exists last_intent text,
  add column if not exists parent_bsuid text;

alter table public.whatsapp_message_log
  add column if not exists media_id text,
  add column if not exists reaction_to text,
  add column if not exists reaction_removed boolean not null default false,
  add column if not exists is_voice_note boolean not null default false,
  add column if not exists location jsonb,
  add column if not exists contacts jsonb,
  add column if not exists reply_to_wa_message_id text,
  add column if not exists batch_index integer,
  add column if not exists client_attachment_id text,
  add column if not exists voice_transcription text,
  add column if not exists voice_transcription_at timestamptz,
  add column if not exists voice_transcription_model text,
  add column if not exists voice_transcription_mime_type text,
  add column if not exists voice_transcription_bytes bigint,
  add column if not exists voice_transcription_status text,
  add column if not exists voice_transcription_error text,
  add column if not exists voice_transcription_failed_at timestamptz,
  add column if not exists lead_id uuid references public.crm_leads(id) on delete set null,
  add column if not exists appointment_id text,
  add column if not exists error_message text;

alter table public.whatsapp_blocklist
  add column if not exists stable_key text,
  add column if not exists bsuid text;

create index if not exists crm_leads_phone_idx on public.crm_leads (phone);
create index if not exists crm_leads_status_idx on public.crm_leads (status);
create index if not exists crm_leads_created_at_idx on public.crm_leads (created_at desc);
create index if not exists crm_discount_codes_status_idx on public.crm_discount_codes (status);
create index if not exists whatsapp_ia_templates_archived_idx on public.whatsapp_ia_templates (archived);
create index if not exists crm_contact_profiles_phone_idx on public.crm_contact_profiles (phone);

drop trigger if exists set_crm_leads_updated_at on public.crm_leads;
create trigger set_crm_leads_updated_at
before update on public.crm_leads
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_discount_codes_updated_at on public.crm_discount_codes;
create trigger set_crm_discount_codes_updated_at
before update on public.crm_discount_codes
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_ia_templates_updated_at on public.whatsapp_ia_templates;
create trigger set_whatsapp_ia_templates_updated_at
before update on public.whatsapp_ia_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_crm_contact_profiles_updated_at on public.crm_contact_profiles;
create trigger set_crm_contact_profiles_updated_at
before update on public.crm_contact_profiles
for each row execute function public.set_updated_at();

alter table public.crm_leads enable row level security;
alter table public.crm_discount_codes enable row level security;
alter table public.whatsapp_ia_templates enable row level security;
alter table public.crm_contact_profiles enable row level security;

create policy "CRM admins manage leads"
on public.crm_leads for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage discount codes"
on public.crm_discount_codes for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage ia templates"
on public.whatsapp_ia_templates for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage contact profiles"
on public.crm_contact_profiles for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('crm-contact-photos', 'crm-contact-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "CRM admins read contact photos"
on storage.objects for select to authenticated
using (bucket_id = 'crm-contact-photos' and app_private.is_crm_admin());

create policy "CRM admins write contact photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'crm-contact-photos' and app_private.is_crm_admin());

create policy "CRM admins update contact photos"
on storage.objects for update to authenticated
using (bucket_id = 'crm-contact-photos' and app_private.is_crm_admin())
with check (bucket_id = 'crm-contact-photos' and app_private.is_crm_admin());
