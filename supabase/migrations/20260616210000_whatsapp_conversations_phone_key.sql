-- whatsapp_conversations.phone_key: clave de teléfono (últimos 10 dígitos E.164)
-- alineada con crm_directory.phone_key. Necesaria para los joins de
-- directory-ai-analyze, detect_directory_name_wa_mismatch y directoryMonitorService.

-- =============================================================================
-- 1. Columna phone_key
-- =============================================================================

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS phone_key TEXT;

-- =============================================================================
-- 2. Trigger de mantenimiento (reutiliza directory_phone_key)
-- =============================================================================

CREATE OR REPLACE FUNCTION whatsapp_conversations_set_phone_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_key := directory_phone_key(
    COALESCE(
      NULLIF(trim(NEW.contact_phone), ''),
      NULLIF(trim(NEW.phone), ''),
      NULLIF(trim(NEW.stable_key), '')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_conversations_set_phone_key ON whatsapp_conversations;
CREATE TRIGGER trg_whatsapp_conversations_set_phone_key
  BEFORE INSERT OR UPDATE OF contact_phone, phone, stable_key ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION whatsapp_conversations_set_phone_key();

-- =============================================================================
-- 3. Backfill de filas existentes
-- =============================================================================

UPDATE whatsapp_conversations
SET phone_key = directory_phone_key(
  COALESCE(
    NULLIF(trim(contact_phone), ''),
    NULLIF(trim(phone), ''),
    NULLIF(trim(stable_key), '')
  )
)
WHERE phone_key IS DISTINCT FROM directory_phone_key(
  COALESCE(
    NULLIF(trim(contact_phone), ''),
    NULLIF(trim(phone), ''),
    NULLIF(trim(stable_key), '')
  )
);

-- =============================================================================
-- 4. Índice parcial por phone_key
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_key
  ON whatsapp_conversations (phone_key)
  WHERE phone_key IS NOT NULL;
