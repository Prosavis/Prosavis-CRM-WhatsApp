-- Recrea whatsapp_stickers: la tabla figuraba como creada en la migración inicial
-- pero el DDL nunca llegó a ejecutarse en remoto (mismo desfase que template_presets),
-- provocando 500 en list/create/update-whatsapp-sticker. El bucket y las políticas de
-- storage 'whatsapp-stickers' ya existen; solo falta la tabla.

create table if not exists public.whatsapp_stickers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  created_by uuid references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  download_url text,
  mime_type text default 'image/webp',
  size_bytes bigint,
  is_animated boolean not null default false,
  favorite_by_uids uuid[] not null default '{}',
  updated_at timestamptz
);

create index if not exists whatsapp_stickers_created_by_idx
  on public.whatsapp_stickers (created_by);

alter table public.whatsapp_stickers enable row level security;

drop policy if exists "CRM admins manage stickers" on public.whatsapp_stickers;
create policy "CRM admins manage stickers"
on public.whatsapp_stickers
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_stickers_updated_at on public.whatsapp_stickers;
create trigger set_whatsapp_stickers_updated_at
before update on public.whatsapp_stickers
for each row execute function public.set_updated_at();
