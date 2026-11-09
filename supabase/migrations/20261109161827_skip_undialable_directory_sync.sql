-- A 16-digit WhatsApp id is not a phone. Do not create a crm_directory row for it.
-- LID/BSUID keys (lid: or CC.token) still land in the directory with phone null.

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
  IF public.is_whatsapp_lid_identity(v_phone)
     OR public.is_whatsapp_lid_identity(NEW.stable_key) THEN
    v_phone := NULL;
  ELSIF public.normalize_directory_phone_e164(v_phone) IS NULL
    AND public.normalize_directory_phone_e164(split_part(NEW.stable_key, '__', 1)) IS NULL THEN
    RETURN NEW;
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
