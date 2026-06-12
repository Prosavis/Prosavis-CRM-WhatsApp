-- Índice para ordenamiento por actividad del inbox en envío masivo (contactos con teléfono).
CREATE INDEX IF NOT EXISTS idx_crm_directory_last_whatsapp_message_at
  ON public.crm_directory (last_whatsapp_message_at ASC NULLS LAST)
  WHERE phone IS NOT NULL;
