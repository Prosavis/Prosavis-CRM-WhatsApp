-- A claimed BSUID thread kept the messages but dropped the 24h clock and the
-- BSUID, so the CRM treated the typed phone as a closed window.

create index if not exists whatsapp_conversations_bsuid_line_idx
  on public.whatsapp_conversations (bsuid, phone_number_id)
  where bsuid is not null;

update public.whatsapp_conversations as c
set bsuid = nullif(c.metadata->>'lidUserId', '')
where coalesce(c.bsuid, '') = ''
  and coalesce(c.metadata->>'lidUserId', '') <> '';

update public.whatsapp_conversations as c
set last_inbound_at = greatest(c.last_inbound_at, s.last_inbound_at)
from (
  select conversation_stable_key, max(created_at) as last_inbound_at
  from public.whatsapp_message_log
  where direction = 'inbound'
    and hidden_from_panel = false
  group by conversation_stable_key
) as s
where c.stable_key = s.conversation_stable_key
  and c.metadata ? 'remappedFromLid'
  and (c.last_inbound_at is null or c.last_inbound_at < s.last_inbound_at);
