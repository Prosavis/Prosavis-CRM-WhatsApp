alter table public.whatsapp_webhook_events
  add column if not exists replay_attempts integer not null default 0;

alter table public.whatsapp_webhook_events
  drop constraint if exists whatsapp_webhook_events_replay_attempts_check;

alter table public.whatsapp_webhook_events
  add constraint whatsapp_webhook_events_replay_attempts_check
  check (replay_attempts >= 0);
