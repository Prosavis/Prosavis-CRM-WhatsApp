-- Canal de salida del globo CRM. Nullable: filas viejas quedan sin sent_via.
-- No recicla sender_type: Grok hoy se persiste como agent.

ALTER TABLE public.whatsapp_message_log
  ADD COLUMN IF NOT EXISTS sent_via text;

ALTER TABLE public.whatsapp_message_log
  DROP CONSTRAINT IF EXISTS whatsapp_message_log_sent_via_check;

ALTER TABLE public.whatsapp_message_log
  ADD CONSTRAINT whatsapp_message_log_sent_via_check
  CHECK (sent_via IS NULL OR sent_via IN ('crm', 'grok', 'app', 'system'));

COMMENT ON COLUMN public.whatsapp_message_log.sent_via IS
  'Canal de salida: crm (panel), grok (puente), app (Coex 311), system (schedulers).';

UPDATE public.whatsapp_message_log
SET sent_via = 'app'
WHERE sent_via IS NULL
  AND sender_type = 'app';

UPDATE public.whatsapp_message_log
SET sent_via = 'system'
WHERE sent_via IS NULL
  AND sender_type = 'system';

UPDATE public.whatsapp_message_log
SET sent_via = 'crm'
WHERE sent_via IS NULL
  AND sender_type = 'agent'
  AND agent_uid IS NOT NULL;
