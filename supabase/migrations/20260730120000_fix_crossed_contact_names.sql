-- Fix crossed WhatsApp contact names + stabilize directory↔conversation links.
-- 1) Prefer contact_name when locked in sync_conversation_to_directory
-- 2) Persist whatsapp_conversation_id as stable_key (not UUID)
-- 3) Backfill UUID links → stable_key
-- 4) Repair contact_name locked onto the wrong chat (duplicated across phones)

-- ---------------------------------------------------------------------------
-- Trigger: sync conversation → directory (stable_key + locked name priority)
-- ---------------------------------------------------------------------------
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
BEGIN
  v_phone := COALESCE(NEW.contact_phone, NEW.phone);
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Locked CRM name wins; otherwise prefer profile, then contact_name.
  IF NEW.contact_name_locked IS TRUE
     AND NEW.contact_name IS NOT NULL
     AND length(trim(NEW.contact_name)) >= 2
     AND trim(NEW.contact_name) ~ '[[:alpha:]]'
  THEN
    v_display_name := trim(NEW.contact_name);
  ELSE
    v_display_name := COALESCE(
      NULLIF(trim(NEW.whatsapp_profile_name), ''),
      NULLIF(trim(NEW.contact_name), ''),
      v_phone
    );
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

  PERFORM public.upsert_directory_entry(
    jsonb_build_object(
      'full_name', v_full_name,
      'display_name', v_display_name,
      'phone', v_phone,
      'photo_url', NEW.contact_photo_url,
      'last_whatsapp_message_at', NEW.last_message_at,
      'last_whatsapp_message_text', NEW.last_message_text,
      'last_whatsapp_intent', NEW.last_intent,
      'unread_whatsapp_count', NEW.unread_count,
      'whatsapp_conversation_id', NEW.stable_key,
      'whatsapp_assigned_to', NEW.assigned_to::text,
      'source', 'WHATSAPP',
      'channels', jsonb_build_array('WHATSAPP'),
      'status', v_status
    ),
    false,
    false
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Backfill: crm_directory.whatsapp_conversation_id UUID → stable_key
-- ---------------------------------------------------------------------------
UPDATE public.crm_directory d
SET
  whatsapp_conversation_id = c.stable_key,
  updated_at = NOW()
FROM public.whatsapp_conversations c
WHERE d.whatsapp_conversation_id IS NOT NULL
  AND d.whatsapp_conversation_id = c.id::text
  AND d.whatsapp_conversation_id IS DISTINCT FROM c.stable_key;

-- ---------------------------------------------------------------------------
-- Repair: locked contact_name duplicated across distinct phones, where the
-- WA profile + directory agree on a different usable name (crossed identity).
-- Preserves intentional unique locks (e.g. DETEKTOR on a single phone).
-- ---------------------------------------------------------------------------
WITH dup_locked_names AS (
  SELECT lower(trim(contact_name)) AS name_key
  FROM public.whatsapp_conversations
  WHERE contact_name_locked = true
    AND contact_name IS NOT NULL
    AND length(trim(contact_name)) >= 2
    AND phone_key IS NOT NULL
  GROUP BY 1
  HAVING count(DISTINCT phone_key) > 1
)
UPDATE public.whatsapp_conversations c
SET
  contact_name = COALESCE(
    NULLIF(trim(d.display_name), ''),
    NULLIF(trim(d.full_name), ''),
    NULLIF(trim(c.whatsapp_profile_name), ''),
    c.contact_name
  ),
  contact_name_locked = false,
  updated_at = NOW()
FROM public.crm_directory d
WHERE d.phone_key IS NOT NULL
  AND c.phone_key = d.phone_key
  AND c.contact_name_locked = true
  AND lower(trim(c.contact_name)) IN (SELECT name_key FROM dup_locked_names)
  AND c.whatsapp_profile_name IS NOT NULL
  AND length(trim(c.whatsapp_profile_name)) >= 2
  AND trim(c.whatsapp_profile_name) ~ '[[:alpha:]]'
  AND lower(trim(c.contact_name)) IS DISTINCT FROM lower(trim(c.whatsapp_profile_name))
  AND COALESCE(NULLIF(trim(d.display_name), ''), NULLIF(trim(d.full_name), '')) IS NOT NULL
  AND lower(trim(COALESCE(NULLIF(trim(d.display_name), ''), d.full_name)))
    = lower(trim(c.whatsapp_profile_name));
