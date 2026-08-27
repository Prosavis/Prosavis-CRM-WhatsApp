-- Dual-line inbox: bot (312) + comercial Coex (311).
-- Bot conversations keep stable_key = customer phone.
-- Commercial conversations use stable_key = {phone}__{commercial_phone_number_id}.
-- crm_directory stays one row per phone_key; bot profile fields win.

ALTER TABLE public.crm_directory
  ADD COLUMN IF NOT EXISTS whatsapp_commercial_conversation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_phone_key_line
  ON public.whatsapp_conversations (phone_key, phone_number_id)
  WHERE phone_key IS NOT NULL AND phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_directory_commercial_conversation
  ON public.crm_directory (whatsapp_commercial_conversation_id)
  WHERE whatsapp_commercial_conversation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_commercial_whatsapp_line(p_phone_number_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_phone_number_id, '') = '1043086062223440';
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
    'unread_whatsapp_count', NEW.unread_count,
    'whatsapp_assigned_to', NEW.assigned_to::text,
    'source', 'WHATSAPP',
    'channels', jsonb_build_array('WHATSAPP'),
    'status', v_status
  );

  IF v_is_commercial THEN
    v_entry := v_entry || jsonb_build_object(
      'whatsapp_commercial_conversation_id', NEW.stable_key
    );
    -- Do not send names/photos: COALESCE(incoming, existing) would overwrite
    -- CRM/bot profile with the commercial WA push name.
  ELSE
    v_entry := v_entry || jsonb_build_object(
      'full_name', v_full_name,
      'display_name', v_display_name,
      'photo_url', NEW.contact_photo_url,
      'whatsapp_conversation_id', NEW.stable_key
    );
  END IF;

  PERFORM public.upsert_directory_entry(v_entry, false, false);

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
BEGIN
  -- Commercial thread tags never replace the bot/CRM classification.
  IF public.is_commercial_whatsapp_line(NEW.phone_number_id) THEN
    RETURN NEW;
  END IF;

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

  PERFORM public.upsert_directory_entry(v_entry, true, true);
  RETURN NEW;
END;
$$;
