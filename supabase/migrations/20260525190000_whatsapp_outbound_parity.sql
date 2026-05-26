-- Fase 0: storage ampliado, schema stickers/snippets, batches, broadcast jobs, delete policy

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = null
where id = 'whatsapp-media';

alter table public.whatsapp_stickers
  add column if not exists download_url text,
  add column if not exists mime_type text default 'image/webp',
  add column if not exists size_bytes bigint,
  add column if not exists is_animated boolean not null default false,
  add column if not exists favorite_by_uids uuid[] not null default '{}',
  add column if not exists updated_at timestamptz;

alter table public.whatsapp_snippets
  add column if not exists shortcut text,
  add column if not exists label text;

update public.whatsapp_snippets
set label = coalesce(label, title),
    shortcut = coalesce(shortcut, '/' || lower(regexp_replace(title, '\s+', '_', 'g')))
where label is null or shortcut is null;

alter table public.whatsapp_message_log
  add column if not exists crm_deleted_at timestamptz,
  add column if not exists crm_deleted_by uuid references auth.users(id),
  add column if not exists is_animated_sticker boolean not null default false;

create table if not exists public.whatsapp_outbound_batches (
  client_batch_id text primary key,
  status text not null default 'processing',
  to_key text not null,
  phone_number_id text,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  results jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.whatsapp_broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'processing',
  total_recipients integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  template_name text,
  rich_body_preview text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists whatsapp_outbound_batches_created_at_idx
  on public.whatsapp_outbound_batches (created_at desc);
create index if not exists whatsapp_broadcast_jobs_created_at_idx
  on public.whatsapp_broadcast_jobs (created_at desc);
create index if not exists whatsapp_snippets_shortcut_idx
  on public.whatsapp_snippets (shortcut);

alter table public.whatsapp_outbound_batches enable row level security;
alter table public.whatsapp_broadcast_jobs enable row level security;

create policy "CRM admins manage outbound batches"
on public.whatsapp_outbound_batches for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

create policy "CRM admins manage broadcast jobs"
on public.whatsapp_broadcast_jobs for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_outbound_batches_updated_at on public.whatsapp_outbound_batches;
create trigger set_whatsapp_outbound_batches_updated_at
before update on public.whatsapp_outbound_batches
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_broadcast_jobs_updated_at on public.whatsapp_broadcast_jobs;
create trigger set_whatsapp_broadcast_jobs_updated_at
before update on public.whatsapp_broadcast_jobs
for each row execute function public.set_updated_at();

create policy "CRM admins delete whatsapp storage"
on storage.objects for delete to authenticated
using (bucket_id in ('whatsapp-media', 'whatsapp-stickers') and app_private.is_crm_admin());
