-- Tag de historial para goteo email (Gmail MCP / comercial@prosavis.com).
-- No crea mailer: solo catálogo para crm_directory.tags + inbox.

insert into public.whatsapp_chat_tags (name, color, archived, sort_order)
select 'email enviado', '#1565c0', false, 0
where not exists (
  select 1
  from public.whatsapp_chat_tags t
  where lower(t.name) = 'email enviado'
);
