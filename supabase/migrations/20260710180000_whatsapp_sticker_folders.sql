-- Librería compartida de stickers: carpetas planas + orden.

create table if not exists public.whatsapp_sticker_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists whatsapp_sticker_folders_sort_idx
  on public.whatsapp_sticker_folders (sort_order, created_at);

alter table public.whatsapp_sticker_folders enable row level security;

drop policy if exists "CRM admins manage sticker folders" on public.whatsapp_sticker_folders;
create policy "CRM admins manage sticker folders"
on public.whatsapp_sticker_folders
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_sticker_folders_updated_at on public.whatsapp_sticker_folders;
create trigger set_whatsapp_sticker_folders_updated_at
before update on public.whatsapp_sticker_folders
for each row execute function public.set_updated_at();

alter table public.whatsapp_stickers
  add column if not exists folder_id uuid references public.whatsapp_sticker_folders(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

create index if not exists whatsapp_stickers_folder_sort_idx
  on public.whatsapp_stickers (folder_id, sort_order, created_at);
