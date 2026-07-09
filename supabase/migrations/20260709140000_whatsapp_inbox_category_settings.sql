-- Configuración compartida de tags por categoría del inbox (p. ej. Fuera de cobertura).

create table if not exists public.whatsapp_inbox_category_settings (
  category_id text primary key
    check (category_id in ('fuera_cobertura')),
  tag_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table public.whatsapp_inbox_category_settings is
  'Tags que alimentan categorías configurables del inbox WhatsApp (compartido entre admins CRM).';

alter table public.whatsapp_inbox_category_settings enable row level security;

drop policy if exists "CRM admins manage inbox category settings"
  on public.whatsapp_inbox_category_settings;
create policy "CRM admins manage inbox category settings"
on public.whatsapp_inbox_category_settings for all to authenticated
using (app_private.is_crm_admin()) with check (app_private.is_crm_admin());

drop trigger if exists set_whatsapp_inbox_category_settings_updated_at
  on public.whatsapp_inbox_category_settings;
create trigger set_whatsapp_inbox_category_settings_updated_at
before update on public.whatsapp_inbox_category_settings
for each row execute function public.set_updated_at();

-- Seed: ciudades / localidades fuera de cobertura conocidas + tag literal si existe.
insert into public.whatsapp_inbox_category_settings (category_id, tag_ids)
select
  'fuera_cobertura',
  coalesce(
    array_agg(t.id order by t.name)
      filter (
        where lower(trim(t.name)) in (
          'bogotá',
          'bogota',
          'quindío',
          'quindio',
          'armenia',
          'cartago',
          'santa rosa',
          'fuera de cobertura'
        )
      ),
    '{}'::uuid[]
  )
from public.whatsapp_chat_tags t
where coalesce(t.archived, false) = false
on conflict (category_id) do nothing;
