-- Dual-line inbox: bot (312) + comercial Coex (311).
-- Bot conversations keep stable_key = customer phone.
-- Commercial conversations use stable_key = {phone}__{commercial_phone_number_id}.
-- crm_directory stays one row per phone_key; bot profile fields win.

ALTER TABLE public.crm_directory
  ADD COLUMN IF NOT EXISTS whatsapp_commercial_conversation_id text;

ALTER TABLE public.whatsapp_message_log
  DROP CONSTRAINT IF EXISTS whatsapp_message_log_sender_type_check;

ALTER TABLE public.whatsapp_message_log
  ADD CONSTRAINT whatsapp_message_log_sender_type_check
  CHECK (sender_type IN ('bot', 'agent', 'system', 'user', 'app'));

DO $$
DECLARE
  r record;
  keep_key text;
  drop_key text;
BEGIN
  FOR r IN
    SELECT phone_key, phone_number_id
    FROM public.whatsapp_conversations
    WHERE phone_key IS NOT NULL
      AND phone_number_id IS NOT NULL
    GROUP BY phone_key, phone_number_id
    HAVING count(*) > 1
  LOOP
    SELECT c.stable_key
    INTO keep_key
    FROM public.whatsapp_conversations c
    WHERE c.phone_key = r.phone_key
      AND c.phone_number_id = r.phone_number_id
    ORDER BY
      (c.last_message_at IS NOT NULL) DESC,
      length(c.stable_key) DESC,
      c.created_at ASC
    LIMIT 1;

    FOR drop_key IN
      SELECT c.stable_key
      FROM public.whatsapp_conversations c
      WHERE c.phone_key = r.phone_key
        AND c.phone_number_id = r.phone_number_id
        AND c.stable_key <> keep_key
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.whatsapp_message_log
        WHERE conversation_stable_key = drop_key
      ) OR EXISTS (
        SELECT 1
        FROM public.whatsapp_media_assets
        WHERE conversation_stable_key = drop_key
      ) OR EXISTS (
        SELECT 1
        FROM public.whatsapp_conversations
        WHERE stable_key = drop_key
          AND last_message_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION
          'No se puede crear uq_whatsapp_conversations_phone_key_line: el hilo duplicado % tiene actividad (keep=%)',
          drop_key,
          keep_key;
      END IF;

      UPDATE public.crm_directory
      SET whatsapp_conversation_id = keep_key,
          updated_at = now()
      WHERE whatsapp_conversation_id = drop_key;

      UPDATE public.reminder_batch_items
      SET conversation_stable_key = keep_key
      WHERE conversation_stable_key = drop_key;

      UPDATE public.whatsapp_admin_presence
      SET conversation_stable_key = keep_key
      WHERE conversation_stable_key = drop_key;

      UPDATE public.whatsapp_ai_suggestion_log
      SET stable_key = keep_key
      WHERE stable_key = drop_key;

      UPDATE public.whatsapp_blocklist
      SET stable_key = keep_key
      WHERE stable_key = drop_key
        AND NOT EXISTS (
          SELECT 1
          FROM public.whatsapp_blocklist b
          WHERE b.stable_key = keep_key
        );

      UPDATE public.whatsapp_conversation_ai_memory
      SET stable_key = keep_key
      WHERE stable_key = drop_key
        AND NOT EXISTS (
          SELECT 1
          FROM public.whatsapp_conversation_ai_memory m
          WHERE m.stable_key = keep_key
        );

      DELETE FROM public.whatsapp_conversations
      WHERE stable_key = drop_key;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations
    WHERE phone_key IS NOT NULL
      AND phone_number_id IS NOT NULL
    GROUP BY phone_key, phone_number_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear uq_whatsapp_conversations_phone_key_line: existen hilos duplicados por phone_key y phone_number_id';
  END IF;
END
$$;

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
    -- No names, photo, assignment, unread count or bot conversation link:
    -- commercial activity cannot replace CRM/bot profile state.
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
    SET whatsapp_commercial_conversation_id = NEW.stable_key,
        updated_at = now()
    WHERE id = v_directory_id
      AND whatsapp_commercial_conversation_id IS DISTINCT FROM NEW.stable_key;
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
      v_classification := array_to_string(v_tag_names, ', ');
    END IF;
  END IF;

  v_phone := COALESCE(
    normalize_directory_phone_e164(NEW.contact_phone),
    normalize_directory_phone_e164(NEW.phone)
  );

  IF public.is_commercial_whatsapp_line(NEW.phone_number_id) THEN
    -- Union only. Never replace bot/CRM classification or profile fields.
    v_entry := jsonb_build_object(
      'phone', v_phone,
      'tags', to_jsonb(COALESCE(v_tag_names, ARRAY[]::TEXT[])),
      'source', 'WHATSAPP',
      'channels', jsonb_build_array('WHATSAPP')
    );
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

CREATE TABLE IF NOT EXISTS public.whatsapp_coex_health (
  phone_number_id text PRIMARY KEY,
  display_phone_number text,
  verified_name text,
  is_on_biz_app boolean,
  platform_type text,
  quality_rating text,
  status text,
  healthy boolean NOT NULL DEFAULT false,
  alert_active boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  raw jsonb
);

ALTER TABLE public.whatsapp_coex_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_coex_health_select_admin ON public.whatsapp_coex_health;
CREATE POLICY whatsapp_coex_health_select_admin
  ON public.whatsapp_coex_health
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('admin', 'super_admin')
    )
  );

GRANT SELECT ON public.whatsapp_coex_health TO authenticated;
GRANT ALL ON public.whatsapp_coex_health TO service_role;
