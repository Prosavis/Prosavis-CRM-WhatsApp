-- Cache on-demand de análisis de media (imágenes ahora; docs más adelante).
alter table public.whatsapp_message_log
  add column if not exists media_analysis_text text,
  add column if not exists media_analysis_at timestamptz,
  add column if not exists media_analysis_model text,
  add column if not exists media_analysis_bytes bigint,
  add column if not exists media_analysis_status text,
  add column if not exists media_analysis_error text,
  add column if not exists media_analysis_failed_at timestamptz;

comment on column public.whatsapp_message_log.media_analysis_text is
  'Texto de análisis IA (imagen u otro media on-demand). No se genera al inbound.';

create index if not exists whatsapp_message_log_media_analysis_recent_idx
  on public.whatsapp_message_log (conversation_stable_key, media_analysis_at desc)
  where media_analysis_at is not null;

create index if not exists whatsapp_message_log_media_analysis_failed_recent_idx
  on public.whatsapp_message_log (conversation_stable_key, media_analysis_failed_at desc)
  where media_analysis_failed_at is not null;
