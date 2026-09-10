-- LID/BSUID WhatsApp contacts (no dialable phone) must still land in crm_directory
-- so UserConsole can schedule them. Identity is the conversation stable_key.

CREATE OR REPLACE FUNCTION public.is_whatsapp_lid_identity(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_value, '') LIKE 'lid:%'
    OR COALESCE(p_value, '') ~ '^[A-Z]{2}\.[A-Za-z0-9.]+$';
$$;

CREATE OR REPLACE FUNCTION public.sync_conversation_to_directory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_phone TEXT;
  v_display_name TEXT;
  v_full_name TEXT;
  v_status TEXT;
  v_is_active BOOLEAN;
  v_candidate TEXT;
  v_is_commercial BOOLEAN;
  v_entry JSONB;
  v_directory_id UUID;
BEGIN
  v_phone := COALESCE(NEW.contact_phone, NEW.phone);
  IF public.is_whatsapp_lid_identity(v_phone) THEN
    v_phone := NULL;
  END IF;

  IF v_phone IS NULL AND NULLIF(trim(NEW.stable_key), '') IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_commercial := public.is_commercial_whatsapp_line(NEW.phone_number_id);

  IF NEW.contact_name_locked IS TRUE
     AND NEW.contact_name IS NOT NULL
     AND length(trim(NEW.contact_name)) >= 2
     AND trim(NEW.contact_name) ~ '[[:alpha:]]'
  THEN
    v_display_name := trim(NEW.contact_name);
  ELSE
    v_candidate := NULLIF(trim(NEW.contact_name), '');
    IF v_candidate IS NOT NULL
       AND length(v_candidate) >= 2
       AND v_candidate ~ '[[:alpha:]]'
    THEN
      v_display_name := v_candidate;
    ELSE
      v_candidate := NULLIF(trim(NEW.whatsapp_profile_name), '');
      IF v_candidate IS NOT NULL
         AND length(v_candidate) >= 2
         AND v_candidate ~ '[[:alpha:]]'
      THEN
        v_display_name := v_candidate;
      ELSE
        v_display_name := NULL;
      END IF;
    END IF;
  END IF;

  v_full_name := v_display_name;
  v_is_active := (NEW.state = 'active');
  IF NEW.is_archived THEN
    v_status := 'inactive';
  ELSIF v_is_active THEN
    v_status := 'active';
  ELSE
    v_status := 'inactive';
  END IF;

  v_entry := jsonb_build_object(
    'last_whatsapp_message_at', NEW.last_message_at,
    'last_whatsapp_message_text', NEW.last_message_text,
    'last_whatsapp_intent', NEW.last_intent,
    'source', 'WHATSAPP',
    'channels', jsonb_build_array('WHATSAPP')
  );
  IF v_phone IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('phone', v_phone);
  END IF;

  IF v_is_commercial THEN
    SELECT id INTO v_directory_id
    FROM public.crm_directory
    WHERE whatsapp_commercial_conversation_id = NEW.stable_key
    LIMIT 1;
    v_entry := v_entry || jsonb_build_object(
      'whatsapp_commercial_conversation_id', NEW.stable_key
    );
    IF v_phone IS NULL AND v_display_name IS NOT NULL THEN
      v_entry := v_entry || jsonb_build_object(
        'full_name', v_display_name,
        'display_name', v_display_name
      );
    END IF;
  ELSE
    SELECT id INTO v_directory_id
    FROM public.crm_directory
    WHERE whatsapp_conversation_id = NEW.stable_key
    LIMIT 1;
    v_entry := v_entry || jsonb_build_object(
      'full_name', v_full_name,
      'display_name', v_display_name,
      'photo_url', NEW.contact_photo_url,
      'whatsapp_conversation_id', NEW.stable_key,
      'unread_whatsapp_count', NEW.unread_count,
      'whatsapp_assigned_to', NEW.assigned_to::text,
      'status', v_status
    );
  END IF;

  IF v_directory_id IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('id', v_directory_id::text);
  END IF;

  v_directory_id := public.upsert_directory_entry(v_entry, false, false);

  IF v_is_commercial THEN
    UPDATE public.crm_directory
    SET
      whatsapp_commercial_conversation_id = NEW.stable_key,
      display_name = CASE
        WHEN v_display_name IS NOT NULL AND NOT public.directory_text_is_usable(display_name)
        THEN v_display_name
        ELSE display_name
      END,
      full_name = CASE
        WHEN v_display_name IS NOT NULL AND NOT public.directory_text_is_usable(full_name)
        THEN v_display_name
        ELSE full_name
      END,
      updated_at = now()
    WHERE id = v_directory_id
      AND (
        whatsapp_commercial_conversation_id IS DISTINCT FROM NEW.stable_key
        OR (
          v_display_name IS NOT NULL
          AND (
            NOT public.directory_text_is_usable(display_name)
            OR NOT public.directory_text_is_usable(full_name)
          )
        )
      );
  END IF;

  RETURN NEW;
END;
$function$;

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
  v_directory_id UUID;
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
      v_classification := public.directory_classification_from_tag_names(v_tag_names);
    END IF;
  END IF;

  v_phone := COALESCE(
    normalize_directory_phone_e164(NEW.contact_phone),
    normalize_directory_phone_e164(NEW.phone)
  );
  IF public.is_whatsapp_lid_identity(COALESCE(NEW.contact_phone, NEW.phone)) THEN
    v_phone := NULL;
  END IF;

  IF public.is_commercial_whatsapp_line(NEW.phone_number_id) THEN
    SELECT id INTO v_directory_id
    FROM public.crm_directory
    WHERE whatsapp_commercial_conversation_id = NEW.stable_key
    LIMIT 1;
    v_entry := jsonb_build_object(
      'tags', to_jsonb(COALESCE(v_tag_names, ARRAY[]::TEXT[])),
      'source', 'WHATSAPP',
      'channels', jsonb_build_array('WHATSAPP')
    );
    IF v_phone IS NOT NULL THEN
      v_entry := v_entry || jsonb_build_object('phone', v_phone);
    END IF;
    IF v_directory_id IS NOT NULL THEN
      v_entry := v_entry || jsonb_build_object('id', v_directory_id::text);
    ELSIF v_phone IS NULL THEN
      RETURN NEW;
    END IF;
    v_directory_id := public.upsert_directory_entry(v_entry, false, false);
    UPDATE public.crm_directory
    SET whatsapp_commercial_conversation_id = NEW.stable_key,
        updated_at = now()
    WHERE id = v_directory_id
      AND whatsapp_commercial_conversation_id IS DISTINCT FROM NEW.stable_key;
    RETURN NEW;
  END IF;

  v_entry := jsonb_build_object(
    'whatsapp_conversation_id', NEW.stable_key,
    'full_name', COALESCE(
      NULLIF(trim(NEW.contact_name), ''),
      NULLIF(trim(NEW.whatsapp_profile_name), ''),
      v_phone
    ),
    'display_name', COALESCE(
      NULLIF(trim(NEW.contact_name), ''),
      NULLIF(trim(NEW.whatsapp_profile_name), '')
    ),
    'classification', v_classification,
    'tags', to_jsonb(COALESCE(v_tag_names, ARRAY[]::TEXT[])),
    'source', 'WHATSAPP',
    'channels', jsonb_build_array('WHATSAPP')
  );
  IF v_phone IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('phone', v_phone);
  END IF;

  PERFORM public.upsert_directory_entry(v_entry, true, true);
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_whatsapp_lid_identity(text) TO authenticated, service_role;

UPDATE public.whatsapp_conversations c
SET last_message_at = COALESCE(c.last_message_at, c.created_at, now())
WHERE (
  public.is_whatsapp_lid_identity(c.stable_key)
  OR public.is_whatsapp_lid_identity(c.phone)
  OR public.is_whatsapp_lid_identity(c.contact_phone)
)
AND NOT EXISTS (
  SELECT 1
  FROM public.crm_directory d
  WHERE d.whatsapp_commercial_conversation_id = c.stable_key
     OR d.whatsapp_conversation_id = c.stable_key
);
