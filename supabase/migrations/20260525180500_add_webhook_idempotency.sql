alter table public.whatsapp_webhook_events
  add column if not exists payload_sha256 text;

create unique index if not exists whatsapp_webhook_events_payload_sha256_idx
  on public.whatsapp_webhook_events (payload_sha256)
  where payload_sha256 is not null;

create unique index if not exists whatsapp_message_log_wa_message_id_idx
  on public.whatsapp_message_log (wa_message_id)
  where wa_message_id is not null;
