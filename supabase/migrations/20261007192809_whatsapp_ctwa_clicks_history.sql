-- Historial de clics de anuncio por chat. ctwa_clid queda con el último clic.

alter table public.whatsapp_conversations
  add column if not exists ctwa_clicks jsonb not null default '[]'::jsonb;

comment on column public.whatsapp_conversations.ctwa_clid is
  'ctwa_clid del último mensaje inbound con referral de anuncio. Los anteriores quedan en ctwa_clicks.';

comment on column public.whatsapp_conversations.ctwa_clicks is
  'Clics de anuncio reemplazados, del más viejo al más nuevo: {ctwa_clid, ctwa_source_id, ctwa_captured_at, note?}.';
