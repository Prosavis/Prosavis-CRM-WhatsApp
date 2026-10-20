-- Chats Francy already answered from the Business app were left unread, and a
-- status webhook could leave the list preview on the coexistence stub after the
-- real message body had been stored.

update public.whatsapp_conversations c
set
  unread_count = 0,
  crm_force_unread = false
where c.phone_number_id = '1043086062223440'
  and (c.unread_count > 0 or c.crm_force_unread is true)
  and (
    select m.direction
    from public.whatsapp_message_log m
    where m.conversation_stable_key = c.stable_key
      and m.hidden_from_panel = false
    order by m.created_at desc
    limit 1
  ) = 'outbound';

update public.whatsapp_conversations c
set
  last_message_text = latest.message_body,
  last_message_at = latest.created_at,
  last_message_direction = latest.direction,
  last_message_outbound_status = case
    when latest.direction = 'outbound' then latest.status
    else null
  end
from (
  select distinct on (m.conversation_stable_key)
    m.conversation_stable_key,
    m.message_body,
    m.created_at,
    m.direction,
    m.status
  from public.whatsapp_message_log m
  where m.hidden_from_panel = false
  order by m.conversation_stable_key, m.created_at desc
) latest
where c.stable_key = latest.conversation_stable_key
  and c.phone_number_id = '1043086062223440'
  and c.last_message_text = 'Enviado desde WhatsApp Business / Facebook'
  and latest.message_body is distinct from 'Enviado desde WhatsApp Business / Facebook'
  and coalesce(trim(latest.message_body), '') <> '';
