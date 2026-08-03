-- Protect CRM contact names from Meta WhatsApp push-name corruption.
-- 1) sync_conversation_to_directory: never write unusable (emoji-only) names to directory
-- 2) Lock Auxiliares chats to Equipo/CTM canonical names
-- 3) Repair any emoji-only / phone-fallback names on Auxiliares

-- ---------------------------------------------------------------------------
-- Trigger: never propagate unusable WA push names into crm_directory
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
  v_candidate TEXT;
BEGIN
  v_phone := COALESCE(NEW.contact_phone, NEW.phone);
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Locked usable CRM name always wins.
  IF NEW.contact_name_locked IS TRUE
     AND NEW.contact_name IS NOT NULL
     AND length(trim(NEW.contact_name)) >= 2
     AND trim(NEW.contact_name) ~ '[[:alpha:]]'
  THEN
    v_display_name := trim(NEW.contact_name);
  ELSE
    -- Prefer contact_name, then WA profile — but only if usable (has letters).
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
        -- Leave null so upsert keeps existing directory name instead of emoji/phone.
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
-- Lock + repair Auxiliares from Equipo (crm_team_members) canonical names
-- ---------------------------------------------------------------------------
WITH auxiliares AS (
  SELECT
    c.stable_key,
    c.phone,
    CASE
      WHEN t.name ~ '^[a-z]' THEN initcap(t.name)
      ELSE t.name
    END AS canonical_name
  FROM whatsapp_conversations c
  JOIN crm_team_members t
    ON t.service_id = 'nwEMgpEqVwY3o95u3PNE'
   AND t.is_active = true
   AND t.phone_number IS NOT NULL
   AND regexp_replace(c.phone, '[^0-9]', '', 'g')
     = regexp_replace(t.phone_number, '[^0-9]', '', 'g')
)
UPDATE whatsapp_conversations c
SET
  contact_name = a.canonical_name,
  contact_name_locked = true,
  updated_at = NOW()
FROM auxiliares a
WHERE c.stable_key = a.stable_key
  AND a.canonical_name IS NOT NULL
  AND length(trim(a.canonical_name)) >= 2;

UPDATE crm_directory d
SET
  display_name = CASE
    WHEN t.name ~ '^[a-z]' THEN initcap(t.name)
    ELSE t.name
  END,
  full_name = CASE
    WHEN t.name ~ '^[a-z]' THEN initcap(t.name)
    ELSE t.name
  END
FROM crm_team_members t
WHERE t.service_id = 'nwEMgpEqVwY3o95u3PNE'
  AND t.is_active = true
  AND (
    d.app_user_id = t.user_id
    OR regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g')
       = regexp_replace(COALESCE(t.phone_number, ''), '[^0-9]', '', 'g')
  )
  AND (
    d.display_name IS NULL
    OR d.display_name !~ '[[:alpha:]]'
    OR d.full_name IS NULL
    OR d.full_name !~ '[[:alpha:]]'
    OR lower(trim(d.display_name)) IS DISTINCT FROM lower(trim(
      CASE WHEN t.name ~ '^[a-z]' THEN initcap(t.name) ELSE t.name END
    ))
  );
