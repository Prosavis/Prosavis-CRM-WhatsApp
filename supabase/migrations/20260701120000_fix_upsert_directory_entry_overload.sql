-- Hotfix: directory_classification_tags_sync dejó dos sobrecargas de upsert_directory_entry
-- con DEFAULT en parámetros opcionales. Llamadas con solo jsonb (p. ej. trigger
-- sync_conversation_to_directory) fallan con "function is not unique".

DROP FUNCTION IF EXISTS public.upsert_directory_entry(jsonb, boolean);

GRANT EXECUTE ON FUNCTION public.upsert_directory_entry(jsonb, boolean, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sync_conversation_to_directory: args explícitos + versionado en repo
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

  v_display_name := COALESCE(NEW.whatsapp_profile_name, NEW.contact_name, v_phone);
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
      'whatsapp_conversation_id', NEW.id::text,
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

DROP TRIGGER IF EXISTS trg_sync_conversation_to_directory_insert ON public.whatsapp_conversations;
CREATE TRIGGER trg_sync_conversation_to_directory_insert
  AFTER INSERT ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_conversation_to_directory();

DROP TRIGGER IF EXISTS trg_sync_conversation_to_directory_update ON public.whatsapp_conversations;
CREATE TRIGGER trg_sync_conversation_to_directory_update
  AFTER UPDATE OF contact_name, contact_phone, whatsapp_profile_name, contact_photo_url,
    state, is_archived, assigned_to, last_message_at, last_message_text, last_intent,
    unread_count
  ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_conversation_to_directory();
