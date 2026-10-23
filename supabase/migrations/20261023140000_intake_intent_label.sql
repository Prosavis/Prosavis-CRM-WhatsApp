alter table public.whatsapp_conversations
  add column if not exists intake_intent_label text;

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_intake_intent_label_check;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_intake_intent_label_check
  check (
    intake_intent_label is null
    or intake_intent_label in ('hogar', 'empresas', 'empleo')
  );
