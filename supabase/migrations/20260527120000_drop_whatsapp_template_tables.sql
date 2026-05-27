-- Elimina plantillas IA locales y caché local de plantillas Meta (el panel usa Graph API directo).

drop policy if exists "CRM admins manage ia templates" on public.whatsapp_ia_templates;
drop trigger if exists set_whatsapp_ia_templates_updated_at on public.whatsapp_ia_templates;
drop table if exists public.whatsapp_ia_templates cascade;

drop policy if exists "CRM admins manage templates" on public.whatsapp_templates;
drop trigger if exists set_whatsapp_templates_updated_at on public.whatsapp_templates;
drop index if exists public.whatsapp_templates_status_idx;
drop table if exists public.whatsapp_templates cascade;
