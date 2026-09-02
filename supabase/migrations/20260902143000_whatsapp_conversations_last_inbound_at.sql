-- Anchor for Meta Cloud API 24h customer service window (CSW).
-- Only customer inbound timestamps count; outbound / Business App echoes do not.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;

COMMENT ON COLUMN public.whatsapp_conversations.last_inbound_at IS
  'Newest customer inbound timestamp. Anchors the Meta Cloud API 24h customer service window.';

UPDATE public.whatsapp_conversations AS c
SET last_inbound_at = s.last_inbound_at
FROM (
  SELECT conversation_stable_key, MAX(created_at) AS last_inbound_at
  FROM public.whatsapp_message_log
  WHERE direction = 'inbound'
    AND hidden_from_panel = false
  GROUP BY conversation_stable_key
) AS s
WHERE c.stable_key = s.conversation_stable_key
  AND c.last_inbound_at IS DISTINCT FROM s.last_inbound_at;
