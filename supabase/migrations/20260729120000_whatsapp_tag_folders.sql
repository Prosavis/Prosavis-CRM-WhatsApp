-- Carpetas planas compartidas para organizar tags del inbox (solo visual).
-- Al eliminar una carpeta, los tags se liberan (folder_id = null) y quedan en la raíz.

create table if not exists public.whatsapp_tag_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists whatsapp_tag_folders_sort_idx
  on public.whatsapp_tag_folders (sort_order, created_at);

alter table public.whatsapp_tag_folders enable row level security;

drop policy if exists "CRM admins manage tag folders" on public.whatsapp_tag_folders;
create policy "CRM admins manage tag folders"
on public.whatsapp_tag_folders
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_tag_folders_updated_at on public.whatsapp_tag_folders;
create trigger set_whatsapp_tag_folders_updated_at
before update on public.whatsapp_tag_folders
for each row execute function public.set_updated_at();

alter table public.whatsapp_chat_tags
  add column if not exists folder_id uuid references public.whatsapp_tag_folders(id) on delete set null,
  add column if not exists sort_order integer not null default 0;

create index if not exists whatsapp_chat_tags_folder_sort_idx
  on public.whatsapp_chat_tags (folder_id, sort_order, name);
