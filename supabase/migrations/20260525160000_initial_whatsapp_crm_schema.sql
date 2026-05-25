create extension if not exists pgcrypto;

create schema if not exists app_private;

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  stable_key text unique not null,
  phone text,
  bsuid text,
  state text not null default 'active' check (state in ('active', 'escalated', 'resolved')),
  contact_name text,
  contact_phone text,
  contact_photo_url text,
  whatsapp_profile_name text,
  admin_notes text,
  assigned_to uuid references auth.users(id),
  last_message_text text,
  last_message_at timestamptz,
  last_message_direction text check (last_message_direction in ('inbound', 'outbound')),
  last_message_outbound_status text,
  unread_count integer not null default 0 check (unread_count >= 0),
  phone_number_id text,
  automated_inbound_disabled boolean not null default false,
  tag_ids uuid[] not null default '{}',
  is_archived boolean not null default false,
  archived_at timestamptz,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  crm_force_unread boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  conversation_stable_key text not null references public.whatsapp_conversations(stable_key) on delete cascade,
  recipient_phone text,
  recipient_bsuid text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null default 'agent' check (sender_type in ('bot', 'agent', 'system', 'user')),
  agent_uid uuid references auth.users(id),
  message_body text,
  media_type text check (media_type in ('image', 'audio', 'video', 'document', 'sticker')),
  media_id text,
  media_url text,
  storage_url text,
  caption text,
  status text not null default 'sent',
  wa_message_id text,
  intent text,
  template_name text,
  campaign_type text,
  phone_number_id text,
  client_request_id text,
  reply_to_wa_message_id text,
  filename text,
  batch_id text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  voice_transcription text,
  hidden_from_panel boolean not null default false,
  revoked_at timestamptz,
  revoked_reason text,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_chat_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  created_by uuid references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_admin_presence (
  id uuid primary key default gen_random_uuid(),
  conversation_stable_key text not null references public.whatsapp_conversations(stable_key) on delete cascade,
  admin_uid uuid references auth.users(id),
  admin_email text,
  status text,
  typing boolean not null default false,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_blocklist (
  phone text primary key,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_conversations_last_message_at_idx
  on public.whatsapp_conversations (last_message_at desc);
create index if not exists whatsapp_conversations_phone_number_id_idx
  on public.whatsapp_conversations (phone_number_id);
create index if not exists whatsapp_conversations_state_idx
  on public.whatsapp_conversations (state);
create index if not exists whatsapp_message_log_stable_key_created_at_idx
  on public.whatsapp_message_log (conversation_stable_key, created_at);
create index if not exists whatsapp_message_log_created_at_phone_idx
  on public.whatsapp_message_log (created_at, phone_number_id);
create index if not exists whatsapp_message_log_campaign_idx
  on public.whatsapp_message_log (campaign_type);
create index if not exists whatsapp_message_log_visible_created_idx
  on public.whatsapp_message_log (created_at)
  where hidden_from_panel = false;

create or replace function app_private.is_crm_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_profiles
    where id = auth.uid()
      and is_active = true
      and role in ('admin', 'super_admin')
  );
$$;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_crm_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_profiles_updated_at on public.admin_profiles;
create trigger set_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger set_whatsapp_conversations_updated_at
before update on public.whatsapp_conversations
for each row execute function public.set_updated_at();

alter table public.admin_profiles enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_message_log enable row level security;
alter table public.whatsapp_chat_tags enable row level security;
alter table public.whatsapp_admin_presence enable row level security;
alter table public.platform_settings enable row level security;
alter table public.whatsapp_blocklist enable row level security;

create policy "Admins read own profile"
on public.admin_profiles
for select
to authenticated
using (id = auth.uid() and is_active = true);

create policy "Super admins manage profiles"
on public.admin_profiles
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role = 'super_admin'
  )
)
with check (
  exists (
    select 1
    from public.admin_profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role = 'super_admin'
  )
);

create policy "CRM admins read conversations"
on public.whatsapp_conversations
for select
to authenticated
using (app_private.is_crm_admin());

create policy "CRM admins write conversations"
on public.whatsapp_conversations
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

create policy "CRM admins read message log"
on public.whatsapp_message_log
for select
to authenticated
using (app_private.is_crm_admin());

create policy "CRM admins write message log"
on public.whatsapp_message_log
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

create policy "CRM admins manage tags"
on public.whatsapp_chat_tags
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

create policy "CRM admins manage presence"
on public.whatsapp_admin_presence
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

create policy "CRM admins manage settings"
on public.platform_settings
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

create policy "CRM admins manage blocklist"
on public.whatsapp_blocklist
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('whatsapp-media', 'whatsapp-media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/ogg', 'application/pdf']),
  ('whatsapp-stickers', 'whatsapp-stickers', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "CRM admins read whatsapp storage"
on storage.objects
for select
to authenticated
using (bucket_id in ('whatsapp-media', 'whatsapp-stickers') and app_private.is_crm_admin());

create policy "CRM admins insert whatsapp storage"
on storage.objects
for insert
to authenticated
with check (bucket_id in ('whatsapp-media', 'whatsapp-stickers') and app_private.is_crm_admin());

create policy "CRM admins update whatsapp storage"
on storage.objects
for update
to authenticated
using (bucket_id in ('whatsapp-media', 'whatsapp-stickers') and app_private.is_crm_admin())
with check (bucket_id in ('whatsapp-media', 'whatsapp-stickers') and app_private.is_crm_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_message_log'
  ) then
    alter publication supabase_realtime add table public.whatsapp_message_log;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_admin_presence'
  ) then
    alter publication supabase_realtime add table public.whatsapp_admin_presence;
  end if;
end $$;
