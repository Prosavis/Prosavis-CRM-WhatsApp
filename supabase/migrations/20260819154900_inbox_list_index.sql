-- Inbox list: phone_number_id + pin + last_message_at (NULLS LAST matches fetchConversations).
create index if not exists idx_wa_conv_phone_pin_lastmsg
on public.whatsapp_conversations (
  phone_number_id,
  is_pinned desc,
  last_message_at desc nulls last
);

analyze public.whatsapp_conversations;
analyze public.whatsapp_message_log;
analyze public.whatsapp_webhook_events;
