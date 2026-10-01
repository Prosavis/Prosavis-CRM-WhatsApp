-- Chats sin teléfono: la ficha se enlaza por stable_key.

update public.crm_directory d
set
  ctwa_clid = c.ctwa_clid,
  ctwa_source_id = nullif(btrim(coalesce(c.ctwa_source_id, '')), ''),
  ctwa_first_at = c.ctwa_captured_at,
  tags = case
    when 'anuncio-meta' = any (coalesce(d.tags, array[]::text[])) then d.tags
    else coalesce(d.tags, array[]::text[]) || array['anuncio-meta']
  end,
  updated_at = now()
from public.whatsapp_conversations c
where d.ctwa_clid is null
  and nullif(btrim(coalesce(c.ctwa_clid, '')), '') is not null
  and d.whatsapp_conversation_id = c.stable_key;
