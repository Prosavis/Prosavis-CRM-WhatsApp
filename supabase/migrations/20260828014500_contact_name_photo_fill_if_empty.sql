-- Fill-if-empty for WhatsApp push names and persist CRM photos against service-role syncs.
-- Authenticated Ficha cliente edits may still overwrite name/photo.

CREATE OR REPLACE FUNCTION public.directory_text_is_usable(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_value IS NOT NULL
    AND length(trim(p_value)) >= 2
    AND trim(p_value) ~ '[[:alpha:]]';
$$;

CREATE OR REPLACE FUNCTION public.crm_directory_keep_identity_if_present()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_role := auth.role();
  EXCEPTION
    WHEN OTHERS THEN
      v_role := NULL;
  END;

  -- Human CRM edits keep full control. Syncs (service_role / no JWT) only fill gaps.
  IF v_role = 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.photo_url IS NOT NULL AND length(trim(OLD.photo_url)) > 0 THEN
    NEW.photo_url := OLD.photo_url;
  END IF;

  IF public.directory_text_is_usable(OLD.display_name) THEN
    NEW.display_name := OLD.display_name;
  END IF;

  IF public.directory_text_is_usable(OLD.full_name) THEN
    NEW.full_name := OLD.full_name;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_crm_directory_keep_identity ON public.crm_directory;
CREATE TRIGGER trg_crm_directory_keep_identity
  BEFORE UPDATE ON public.crm_directory
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_directory_keep_identity_if_present();

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
  IF v_phone IS NULL THEN
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
    'phone', v_phone,
    'last_whatsapp_message_at', NEW.last_message_at,
    'last_whatsapp_message_text', NEW.last_message_text,
    'last_whatsapp_intent', NEW.last_intent,
    'source', 'WHATSAPP',
    'channels', jsonb_build_array('WHATSAPP')
  );

  IF v_is_commercial THEN
    v_entry := v_entry || jsonb_build_object(
      'whatsapp_commercial_conversation_id', NEW.stable_key
    );
  ELSE
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

UPDATE public.whatsapp_conversations c
SET contact_name = trim(c.whatsapp_profile_name)
WHERE COALESCE(c.contact_name_locked, false) IS NOT TRUE
  AND public.directory_text_is_usable(c.whatsapp_profile_name)
  AND NOT public.directory_text_is_usable(c.contact_name);

UPDATE public.crm_directory d
SET
  display_name = src.name,
  full_name = CASE
    WHEN public.directory_text_is_usable(d.full_name) THEN d.full_name
    ELSE src.name
  END,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (public.directory_phone_key(COALESCE(c.contact_phone, c.phone)))
    public.directory_phone_key(COALESCE(c.contact_phone, c.phone)) AS phone_key,
    trim(
      CASE
        WHEN public.directory_text_is_usable(c.contact_name) THEN c.contact_name
        ELSE c.whatsapp_profile_name
      END
    ) AS name
  FROM public.whatsapp_conversations c
  WHERE COALESCE(c.contact_phone, c.phone) IS NOT NULL
    AND (
      public.directory_text_is_usable(c.contact_name)
      OR public.directory_text_is_usable(c.whatsapp_profile_name)
    )
  ORDER BY
    public.directory_phone_key(COALESCE(c.contact_phone, c.phone)),
    CASE WHEN c.contact_name_locked IS TRUE THEN 0 ELSE 1 END,
    c.last_message_at DESC NULLS LAST
) src
WHERE d.phone_key = src.phone_key
  AND public.directory_text_is_usable(src.name)
  AND NOT public.directory_text_is_usable(d.display_name);
