-- Pre-rellenos compartidos del equipo para plantillas Meta + pins en snippets CRM

create table if not exists public.whatsapp_template_presets (
  id uuid primary key default gen_random_uuid(),
  preset_label text not null,
  template_name text not null,
  template_language text not null default 'es_CO',
  header_values jsonb not null default '[]'::jsonb,
  body_values jsonb not null default '[]'::jsonb,
  section_key text,
  is_favorite boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_template_presets_header_values_array check (jsonb_typeof(header_values) = 'array'),
  constraint whatsapp_template_presets_body_values_array check (jsonb_typeof(body_values) = 'array')
);

create index if not exists whatsapp_template_presets_sort_idx
  on public.whatsapp_template_presets (is_favorite desc, sort_order asc, preset_label asc);

create index if not exists whatsapp_template_presets_template_idx
  on public.whatsapp_template_presets (template_name, template_language);

alter table public.whatsapp_snippets
  add column if not exists is_pinned boolean not null default false,
  add column if not exists sort_order int not null default 0;

create index if not exists whatsapp_snippets_pinned_sort_idx
  on public.whatsapp_snippets (is_pinned desc, sort_order asc, shortcut asc);

drop trigger if exists set_whatsapp_template_presets_updated_at on public.whatsapp_template_presets;
create trigger set_whatsapp_template_presets_updated_at
before update on public.whatsapp_template_presets
for each row execute function public.set_updated_at();

alter table public.whatsapp_template_presets enable row level security;

create policy "CRM admins manage template presets"
on public.whatsapp_template_presets
for all
to authenticated
using (app_private.is_crm_admin())
with check (app_private.is_crm_admin());
