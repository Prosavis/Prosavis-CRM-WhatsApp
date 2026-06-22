-- whatsapp_conversations.contact_name_locked: bloqueo de nombre editado manualmente.
-- Cuando un operador edita el nombre del contacto desde la ficha del cliente,
-- esta bandera se activa para que el webhook de WhatsApp (on-whatsapp-webhook)
-- deje de sobrescribir contact_name y whatsapp_profile_name con el push name de Meta.

-- =============================================================================
-- 1. Columna contact_name_locked
-- =============================================================================

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS contact_name_locked BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- 2. Backfill heurístico de ediciones manuales preexistentes
-- =============================================================================
-- Marcamos como bloqueadas las conversaciones cuyo contact_name es un nombre
-- usable (>= 2 chars y no parece un teléfono) y difiere del push name de
-- WhatsApp: probablemente fueron editadas manualmente antes de este fix.

UPDATE whatsapp_conversations
SET contact_name_locked = true
WHERE contact_name_locked = false
  AND contact_name IS NOT NULL
  AND length(trim(contact_name)) >= 2
  AND trim(contact_name) !~ '^[0-9 +()\-]+$'
  AND trim(lower(coalesce(contact_name, ''))) IS DISTINCT FROM trim(lower(coalesce(whatsapp_profile_name, '')));
