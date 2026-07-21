-- merge_directory_entries fallaba con uq_directory_phone_normalized /
-- uq_directory_email porque copiaba phone/email al primary mientras el
-- duplicado aún los retenía. Liberar unicidad en el duplicado primero.

CREATE OR REPLACE FUNCTION merge_directory_entries(p_primary UUID, p_duplicate UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup crm_directory%ROWTYPE;
BEGIN
  IF p_primary = p_duplicate THEN
    RAISE EXCEPTION 'No se puede fusionar una entrada consigo misma';
  END IF;

  SELECT * INTO v_dup FROM crm_directory WHERE id = p_duplicate;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada duplicada no encontrada: %', p_duplicate;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_directory WHERE id = p_primary) THEN
    RAISE EXCEPTION 'Entrada primaria no encontrada: %', p_primary;
  END IF;

  -- Liberar unicidad en el duplicado antes de mover phone/email al primary.
  UPDATE crm_directory
  SET phone = NULL, email = NULL, updated_at = NOW()
  WHERE id = p_duplicate;

  UPDATE crm_directory k SET
    full_name = COALESCE(NULLIF(trim(k.full_name), ''), v_dup.full_name),
    display_name = COALESCE(k.display_name, v_dup.display_name),
    email = COALESCE(k.email, v_dup.email),
    phone = CASE
      WHEN k.phone LIKE '+%' THEN k.phone
      WHEN v_dup.phone LIKE '+%' THEN v_dup.phone
      ELSE COALESCE(k.phone, v_dup.phone)
    END,
    photo_url = COALESCE(k.photo_url, v_dup.photo_url),
    address = COALESCE(k.address, v_dup.address),
    notes = COALESCE(k.notes, v_dup.notes),
    app_user_id = COALESCE(k.app_user_id, v_dup.app_user_id),
    is_app_user = (COALESCE(k.is_app_user, false) OR COALESCE(v_dup.is_app_user, false)),
    provider_id = COALESCE(k.provider_id, v_dup.provider_id),
    service_id = COALESCE(k.service_id, v_dup.service_id),
    whatsapp_conversation_id = COALESCE(k.whatsapp_conversation_id, v_dup.whatsapp_conversation_id),
    whatsapp_assigned_to = COALESCE(k.whatsapp_assigned_to, v_dup.whatsapp_assigned_to),
    last_whatsapp_message_at = GREATEST(
      COALESCE(k.last_whatsapp_message_at, '1970-01-01'::timestamptz),
      COALESCE(v_dup.last_whatsapp_message_at, '1970-01-01'::timestamptz)
    ),
    last_whatsapp_message_text = COALESCE(k.last_whatsapp_message_text, v_dup.last_whatsapp_message_text),
    last_whatsapp_intent = COALESCE(k.last_whatsapp_intent, v_dup.last_whatsapp_intent),
    unread_whatsapp_count = COALESCE(k.unread_whatsapp_count, 0) + COALESCE(v_dup.unread_whatsapp_count, 0),
    messages_count = COALESCE(k.messages_count, 0) + COALESCE(v_dup.messages_count, 0),
    source = CASE
      WHEN k.source IS NULL OR k.source = '' THEN v_dup.source
      WHEN v_dup.source IS NULL OR v_dup.source = '' THEN k.source
      WHEN position(v_dup.source IN k.source) = 0 THEN k.source || ', ' || v_dup.source
      ELSE k.source
    END,
    channels = ARRAY(SELECT DISTINCT unnest(COALESCE(k.channels, '{}'::text[]) || COALESCE(v_dup.channels, '{}'::text[]))),
    tags = ARRAY(SELECT DISTINCT unnest(COALESCE(k.tags, '{}'::text[]) || COALESCE(v_dup.tags, '{}'::text[]))),
    metadata = COALESCE(k.metadata, '{}'::jsonb) || COALESCE(v_dup.metadata, '{}'::jsonb),
    updated_at = NOW()
  WHERE k.id = p_primary;

  DELETE FROM crm_directory WHERE id = p_duplicate;

  PERFORM detect_directory_issues_for_entry(p_primary);

  RETURN p_primary;
END;
$$;
