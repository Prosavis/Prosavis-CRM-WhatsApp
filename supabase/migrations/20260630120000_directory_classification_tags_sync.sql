-- Clasificación unificada por tags WhatsApp:
-- 1) classification texto libre (sin CHECK legacy)
-- 2) upsert_directory_entry con p_replace_tags
-- 3) trigger sync_tags_to_crm_directory en whatsapp_conversations.tag_ids
-- 4) RPC set_directory_classification_tags para edición desde directorio / User Console

ALTER TABLE public.crm_directory
  DROP CONSTRAINT IF EXISTS crm_directory_classification_check;

-- ---------------------------------------------------------------------------
-- upsert_directory_entry: añade p_replace_tags (reemplazo explícito de tags[])
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_directory_entry(
  p_entry jsonb,
  p_overwrite_classification boolean DEFAULT false,
  p_replace_tags boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_existing_id UUID;
  v_id UUID;
  v_firebase_doc TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_phone_key TEXT;
  v_classification TEXT;
  v_full_name TEXT;
  v_display_name TEXT;
  v_photo_url TEXT;
  v_address TEXT;
  v_notes TEXT;
  v_app_user_id TEXT;
  v_is_app_user BOOLEAN;
  v_provider_id TEXT;
  v_service_id TEXT;
  v_quality_tag TEXT;
  v_status TEXT;
  v_source TEXT;
  v_payment_status TEXT;
  v_pending_amount NUMERIC;
  v_pending_appointments_count INTEGER;
  v_last_charged_amount NUMERIC;
  v_otp_required BOOLEAN;
  v_preferred_service_address_line TEXT;
  v_preferred_service_address_ref TEXT;
  v_first_contact_at TIMESTAMPTZ;
  v_last_contact_at TIMESTAMPTZ;
  v_messages_count INTEGER;
  v_active_sequence TEXT;
  v_sequence_step INTEGER;
  v_opt_out BOOLEAN;
  v_last_response_text TEXT;
  v_last_response_at TIMESTAMPTZ;
  v_last_whatsapp_message_at TIMESTAMPTZ;
  v_last_whatsapp_message_text TEXT;
  v_last_whatsapp_intent TEXT;
  v_unread_whatsapp_count INTEGER;
  v_whatsapp_assigned_to TEXT;
  v_whatsapp_conversation_id TEXT;
  v_appointment_id TEXT;
  v_internal_notes TEXT;
  v_channels TEXT[];
  v_tags TEXT[];
  v_metadata JSONB;
  v_is_whatsapp BOOLEAN;
BEGIN
  v_id := NULLIF(trim(p_entry->>'id'), '')::uuid;
  v_firebase_doc := NULLIF(trim(p_entry->'metadata'->'source_ids'->>'firebase_crmClient_docId'), '');
  v_phone := normalize_directory_phone_e164(p_entry->>'phone');
  v_email := NULLIF(lower(trim(p_entry->>'email')), '');
  v_phone_key := directory_phone_key(COALESCE(v_phone, p_entry->>'phone'));
  v_is_whatsapp := COALESCE(p_entry->>'source', '') ILIKE '%WHATSAPP%';
  v_classification := NULLIF(trim(p_entry->>'classification'), '');
  v_full_name := NULLIF(trim(p_entry->>'full_name'), '');
  v_display_name := NULLIF(trim(p_entry->>'display_name'), '');
  v_photo_url := NULLIF(trim(p_entry->>'photo_url'), '');
  v_address := NULLIF(trim(p_entry->>'address'), '');
  v_notes := NULLIF(trim(p_entry->>'notes'), '');
  v_app_user_id := NULLIF(trim(p_entry->>'app_user_id'), '');
  v_is_app_user := (p_entry->>'is_app_user')::boolean;
  v_provider_id := NULLIF(trim(p_entry->>'provider_id'), '');
  v_service_id := NULLIF(trim(p_entry->>'service_id'), '');
  v_quality_tag := NULLIF(trim(p_entry->>'quality_tag'), '');
  v_status := NULLIF(trim(p_entry->>'status'), '');
  v_source := NULLIF(trim(p_entry->>'source'), '');
  v_payment_status := NULLIF(trim(p_entry->>'payment_status'), '');
  v_pending_amount := (p_entry->>'pending_amount')::numeric;
  v_pending_appointments_count := (p_entry->>'pending_appointments_count')::integer;
  v_last_charged_amount := (p_entry->>'last_charged_amount')::numeric;
  v_otp_required := (p_entry->>'otp_required')::boolean;
  v_preferred_service_address_line := NULLIF(trim(p_entry->>'preferred_service_address_line'), '');
  v_preferred_service_address_ref := NULLIF(trim(p_entry->>'preferred_service_address_ref'), '');
  v_first_contact_at := (p_entry->>'first_contact_at')::timestamptz;
  v_last_contact_at := (p_entry->>'last_contact_at')::timestamptz;
  v_messages_count := (p_entry->>'messages_count')::integer;
  v_active_sequence := NULLIF(trim(p_entry->>'active_sequence'), '');
  v_sequence_step := (p_entry->>'sequence_step')::integer;
  v_opt_out := (p_entry->>'opt_out')::boolean;
  v_last_response_text := NULLIF(trim(p_entry->>'last_response_text'), '');
  v_last_response_at := (p_entry->>'last_response_at')::timestamptz;
  v_last_whatsapp_message_at := (p_entry->>'last_whatsapp_message_at')::timestamptz;
  v_last_whatsapp_message_text := NULLIF(trim(p_entry->>'last_whatsapp_message_text'), '');
  v_last_whatsapp_intent := NULLIF(trim(p_entry->>'last_whatsapp_intent'), '');
  v_unread_whatsapp_count := (p_entry->>'unread_whatsapp_count')::integer;
  v_whatsapp_assigned_to := NULLIF(trim(p_entry->>'whatsapp_assigned_to'), '');
  v_whatsapp_conversation_id := NULLIF(trim(p_entry->>'whatsapp_conversation_id'), '');
  v_appointment_id := NULLIF(trim(p_entry->>'appointment_id'), '');
  v_internal_notes := NULLIF(trim(p_entry->>'internal_notes'), '');
  v_channels := CASE
    WHEN p_entry->'channels' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_entry->'channels'))
    ELSE NULL
  END;
  v_tags := CASE
    WHEN p_entry->'tags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_entry->'tags'))
    ELSE NULL
  END;
  v_metadata := COALESCE(p_entry->'metadata', '{}'::jsonb);

  IF v_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE id = v_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NOT NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE phone_key = v_phone_key AND lower(trim(email)) = v_email LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE phone_key = v_phone_key ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE lower(trim(email)) = v_email AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_firebase_doc IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM crm_directory
    WHERE metadata->'source_ids'->>'firebase_crmClient_docId' = v_firebase_doc
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_whatsapp_conversation_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE whatsapp_conversation_id = v_whatsapp_conversation_id LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_is_whatsapp AND v_full_name IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM crm_directory WHERE lower(trim(full_name)) = lower(trim(v_full_name)) AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) AND source ILIKE '%CRM_CLIENT%' LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_phone_key IS NULL AND v_email IS NULL THEN
    IF v_existing_id IS NULL AND v_provider_id IS NOT NULL AND v_service_id IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM crm_directory WHERE provider_id = v_provider_id AND service_id = v_service_id AND source ILIKE '%CRM_CLIENT%' AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL) AND (email IS NULL OR trim(email) = '') ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE crm_directory
    SET
      full_name = COALESCE(v_full_name, full_name),
      display_name = COALESCE(v_display_name, display_name),
      email = COALESCE(v_email, email),
      phone = COALESCE(v_phone, phone),
      photo_url = COALESCE(v_photo_url, photo_url),
      address = COALESCE(v_address, address),
      notes = COALESCE(v_notes, notes),
      app_user_id = COALESCE(v_app_user_id, app_user_id),
      is_app_user = COALESCE(v_is_app_user, is_app_user),
      provider_id = COALESCE(v_provider_id, provider_id),
      service_id = COALESCE(v_service_id, service_id),
      classification = CASE WHEN p_overwrite_classification THEN CASE WHEN v_classification IS NOT NULL THEN v_classification ELSE 'unknown' END ELSE COALESCE(classification, v_classification) END,
      quality_tag = COALESCE(v_quality_tag, quality_tag),
      status = COALESCE(v_status, status),
      source = CASE WHEN source IS NULL OR trim(source) = '' THEN v_source WHEN v_source IS NOT NULL AND position(v_source in source) = 0 THEN source || ', ' || v_source ELSE source END,
      channels = CASE WHEN v_channels IS NOT NULL THEN ARRAY(SELECT DISTINCT unnest(COALESCE(channels, '{}'::text[]) || v_channels)) ELSE channels END,
      payment_status = COALESCE(v_payment_status, payment_status),
      pending_amount = COALESCE(v_pending_amount, pending_amount),
      pending_appointments_count = COALESCE(v_pending_appointments_count, pending_appointments_count),
      last_charged_amount = COALESCE(v_last_charged_amount, last_charged_amount),
      otp_required = COALESCE(v_otp_required, otp_required),
      preferred_service_address_line = COALESCE(v_preferred_service_address_line, preferred_service_address_line),
      preferred_service_address_ref = COALESCE(v_preferred_service_address_ref, preferred_service_address_ref),
      first_contact_at = LEAST(COALESCE(v_first_contact_at, 'infinity'::timestamptz), COALESCE(first_contact_at, 'infinity'::timestamptz)),
      last_contact_at = GREATEST(COALESCE(v_last_contact_at, '1970-01-01'::timestamptz), COALESCE(last_contact_at, '1970-01-01'::timestamptz)),
      messages_count = GREATEST(COALESCE(v_messages_count, 0), COALESCE(messages_count, 0)),
      active_sequence = COALESCE(v_active_sequence, active_sequence),
      sequence_step = COALESCE(v_sequence_step, sequence_step),
      opt_out = COALESCE(v_opt_out, opt_out),
      last_response_text = COALESCE(v_last_response_text, last_response_text),
      last_response_at = GREATEST(COALESCE(v_last_response_at, '1970-01-01'::timestamptz), COALESCE(last_response_at, '1970-01-01'::timestamptz)),
      last_whatsapp_message_at = GREATEST(COALESCE(v_last_whatsapp_message_at, '1970-01-01'::timestamptz), COALESCE(last_whatsapp_message_at, '1970-01-01'::timestamptz)),
      last_whatsapp_message_text = COALESCE(v_last_whatsapp_message_text, last_whatsapp_message_text),
      last_whatsapp_intent = COALESCE(v_last_whatsapp_intent, last_whatsapp_intent),
      unread_whatsapp_count = COALESCE(v_unread_whatsapp_count, unread_whatsapp_count),
      whatsapp_assigned_to = COALESCE(v_whatsapp_assigned_to, whatsapp_assigned_to),
      whatsapp_conversation_id = COALESCE(v_whatsapp_conversation_id, whatsapp_conversation_id),
      appointment_id = COALESCE(v_appointment_id, appointment_id),
      internal_notes = COALESCE(v_internal_notes, internal_notes),
      tags = CASE
        WHEN v_tags IS NOT NULL AND p_replace_tags THEN v_tags
        WHEN v_tags IS NOT NULL THEN ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}'::text[]) || v_tags))
        ELSE tags
      END,
      metadata = metadata || v_metadata,
      updated_at = NOW(),
      last_synced_at = NOW()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    INSERT INTO crm_directory (
      full_name, display_name, email, phone, photo_url, address, notes,
      app_user_id, is_app_user, provider_id, service_id,
      classification, quality_tag, status, source, channels,
      payment_status, pending_amount, pending_appointments_count, last_charged_amount,
      otp_required, preferred_service_address_line, preferred_service_address_ref,
      first_contact_at, last_contact_at, messages_count,
      active_sequence, sequence_step, opt_out,
      last_response_text, last_response_at,
      last_whatsapp_message_at, last_whatsapp_message_text, last_whatsapp_intent,
      unread_whatsapp_count, whatsapp_assigned_to, whatsapp_conversation_id,
      appointment_id, internal_notes, tags, metadata
    ) VALUES (
      v_full_name, v_display_name, v_email, v_phone, v_photo_url, v_address, v_notes,
      v_app_user_id, COALESCE(v_is_app_user, false), v_provider_id, v_service_id,
      COALESCE(v_classification, 'unknown'),
      COALESCE(v_quality_tag, 'standard'),
      COALESCE(v_status, 'active'), v_source,
      COALESCE(v_channels, '{}'::text[]),
      v_payment_status, v_pending_amount, v_pending_appointments_count, v_last_charged_amount,
      v_otp_required, v_preferred_service_address_line, v_preferred_service_address_ref,
      v_first_contact_at, v_last_contact_at, COALESCE(v_messages_count, 0),
      COALESCE(v_active_sequence, 'NINGUNA'), COALESCE(v_sequence_step, 0),
      COALESCE(v_opt_out, false),
      v_last_response_text, v_last_response_at,
      v_last_whatsapp_message_at, v_last_whatsapp_message_text, v_last_whatsapp_intent,
      COALESCE(v_unread_whatsapp_count, 0), v_whatsapp_assigned_to, v_whatsapp_conversation_id,
      v_appointment_id, v_internal_notes,
      COALESCE(v_tags, '{}'::text[]), v_metadata
    )
    RETURNING id INTO v_existing_id;
    RETURN v_existing_id;
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    IF v_firebase_doc IS NOT NULL THEN
      SELECT id INTO v_existing_id
      FROM crm_directory
      WHERE metadata->'source_ids'->>'firebase_crmClient_docId' = v_firebase_doc
      LIMIT 1;
    END IF;
    IF v_existing_id IS NULL THEN
      SELECT id INTO v_existing_id FROM crm_directory WHERE (v_phone_key IS NOT NULL AND phone_key = v_phone_key) OR (v_email IS NOT NULL AND lower(trim(email)) = v_email) LIMIT 1;
    END IF;
    IF v_existing_id IS NOT NULL THEN
      RETURN upsert_directory_entry(p_entry, p_overwrite_classification, p_replace_tags);
    END IF;
    RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_directory_entry(jsonb, boolean, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger: tags de conversación WA → crm_directory.classification + tags[]
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_tags_to_crm_directory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_names TEXT[];
  v_classification TEXT;
  v_phone TEXT;
  v_entry JSONB;
BEGIN
  IF NEW.tag_ids IS NULL OR cardinality(NEW.tag_ids) = 0 THEN
    v_tag_names := ARRAY[]::TEXT[];
    v_classification := 'unknown';
  ELSE
    SELECT ARRAY_AGG(t.name ORDER BY t.name)
    INTO v_tag_names
    FROM unnest(NEW.tag_ids) AS tid
    JOIN public.whatsapp_chat_tags t ON t.id = tid
    WHERE COALESCE(t.archived, false) = false;

    IF v_tag_names IS NULL OR cardinality(v_tag_names) = 0 THEN
      v_tag_names := ARRAY[]::TEXT[];
      v_classification := 'unknown';
    ELSE
      v_classification := array_to_string(v_tag_names, ', ');
    END IF;
  END IF;

  v_phone := COALESCE(
    normalize_directory_phone_e164(NEW.contact_phone),
    normalize_directory_phone_e164(NEW.phone)
  );

  v_entry := jsonb_build_object(
    'whatsapp_conversation_id', NEW.stable_key,
    'phone', v_phone,
    'full_name', COALESCE(
      NULLIF(trim(NEW.contact_name), ''),
      NULLIF(trim(NEW.whatsapp_profile_name), ''),
      '.'
    ),
    'display_name', COALESCE(
      NULLIF(trim(NEW.contact_name), ''),
      NULLIF(trim(NEW.whatsapp_profile_name), '')
    ),
    'classification', v_classification,
    'tags', to_jsonb(v_tag_names),
    'source', 'WHATSAPP'
  );

  PERFORM public.upsert_directory_entry(v_entry, true, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tags_to_crm_directory ON public.whatsapp_conversations;
CREATE TRIGGER trg_sync_tags_to_crm_directory
  AFTER UPDATE OF tag_ids ON public.whatsapp_conversations
  FOR EACH ROW
  WHEN (OLD.tag_ids IS DISTINCT FROM NEW.tag_ids)
  EXECUTE FUNCTION public.sync_tags_to_crm_directory();

-- ---------------------------------------------------------------------------
-- RPC: edición explícita de clasificación por tags desde directorio
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_directory_classification_tags(
  p_directory_id UUID,
  p_tag_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dir RECORD;
  v_tag_names TEXT[];
  v_classification TEXT;
  v_entry JSONB;
  v_conv_stable_key TEXT;
  v_safe_tag_ids UUID[];
BEGIN
  SELECT * INTO v_dir FROM public.crm_directory WHERE id = p_directory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Directorio: entrada no encontrada (%)', p_directory_id;
  END IF;

  v_safe_tag_ids := COALESCE(p_tag_ids, '{}'::uuid[]);

  IF cardinality(v_safe_tag_ids) = 0 THEN
    v_tag_names := ARRAY[]::TEXT[];
    v_classification := 'unknown';
  ELSE
    SELECT ARRAY_AGG(t.name ORDER BY t.name)
    INTO v_tag_names
    FROM unnest(v_safe_tag_ids) AS tid
    JOIN public.whatsapp_chat_tags t ON t.id = tid
    WHERE COALESCE(t.archived, false) = false;

    IF v_tag_names IS NULL OR cardinality(v_tag_names) = 0 THEN
      v_tag_names := ARRAY[]::TEXT[];
      v_classification := 'unknown';
    ELSE
      v_classification := array_to_string(v_tag_names, ', ');
    END IF;
  END IF;

  v_conv_stable_key := NULLIF(trim(v_dir.whatsapp_conversation_id), '');

  IF v_conv_stable_key IS NOT NULL THEN
    UPDATE public.whatsapp_conversations
    SET tag_ids = v_safe_tag_ids
    WHERE stable_key = v_conv_stable_key;
    RETURN p_directory_id;
  END IF;

  v_entry := jsonb_build_object(
    'id', p_directory_id,
    'classification', v_classification,
    'tags', to_jsonb(v_tag_names)
  );

  RETURN public.upsert_directory_entry(v_entry, true, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_directory_classification_tags(uuid, uuid[]) TO authenticated, service_role;
