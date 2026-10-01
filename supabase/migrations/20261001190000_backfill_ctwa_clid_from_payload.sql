-- Copia el primer ctwa_clid de un mensaje inbound a la ficha, si sigue vacía.
-- No pisa una marca ya escrita. No reenvía eventos a Meta.

with first_click as (
  select distinct on (m.conversation_stable_key)
    m.conversation_stable_key,
    m.raw_payload->'referral'->>'ctwa_clid' as ctwa_clid,
    nullif(m.raw_payload->'referral'->>'source_id', '') as ctwa_source_id,
    m.created_at as ctwa_captured_at
  from public.whatsapp_message_log m
  where m.direction = 'inbound'
    and coalesce(m.raw_payload->'referral'->>'ctwa_clid', '') <> ''
    and coalesce(m.raw_payload->'referral'->>'source_type', '') in ('', 'ad')
  order by m.conversation_stable_key, m.created_at asc
)
update public.whatsapp_conversations c
set
  ctwa_clid = first_click.ctwa_clid,
  ctwa_source_id = first_click.ctwa_source_id,
  ctwa_captured_at = first_click.ctwa_captured_at
from first_click
where c.stable_key = first_click.conversation_stable_key
  and c.ctwa_clid is null;
