-- Click id de anuncios Click-to-WhatsApp. Llega en messages[].referral.
-- No suscribe history, smb_app_data ni smb_app_state_sync.

alter table public.whatsapp_conversations
  add column if not exists ctwa_clid text,
  add column if not exists ctwa_source_id text,
  add column if not exists ctwa_captured_at timestamptz;

comment on column public.whatsapp_conversations.ctwa_clid is
  'ctwa_clid del primer mensaje inbound con referral de anuncio. No se hashea.';

comment on column public.whatsapp_conversations.ctwa_source_id is
  'source_id del anuncio (referral.source_id).';

create index if not exists whatsapp_conversations_ctwa_clid_idx
  on public.whatsapp_conversations (ctwa_clid)
  where ctwa_clid is not null;
