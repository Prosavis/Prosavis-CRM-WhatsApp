-- When Auxiliares tag is applied, lock contact_name to Equipo/CTM canonical name.
CREATE OR REPLACE FUNCTION public.lock_auxiliar_contact_name_on_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aux uuid := '87ab09d9-910b-4f5c-8df8-505fd58d1fad';
  v_name text;
BEGIN
  IF NEW.tag_ids IS NULL OR NOT (v_aux = ANY(NEW.tag_ids)) THEN
    RETURN NEW;
  END IF;

  -- Already locked with a usable name and Auxiliares was already present → no-op
  IF TG_OP = 'UPDATE'
     AND OLD.tag_ids IS NOT NULL
     AND v_aux = ANY(OLD.tag_ids)
     AND NEW.contact_name_locked IS TRUE
     AND NEW.contact_name IS NOT NULL
     AND trim(NEW.contact_name) ~ '[[:alpha:]]'
  THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN t.name ~ '^[a-z]' THEN initcap(t.name) ELSE t.name END
    INTO v_name
  FROM crm_team_members t
  WHERE t.service_id = 'nwEMgpEqVwY3o95u3PNE'
    AND t.is_active = true
    AND t.phone_number IS NOT NULL
    AND regexp_replace(COALESCE(t.phone_number, ''), '[^0-9]', '', 'g')
      = regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g')
  LIMIT 1;

  IF v_name IS NULL OR length(trim(v_name)) < 2 THEN
    IF NEW.contact_name IS NOT NULL
       AND length(trim(NEW.contact_name)) >= 2
       AND trim(NEW.contact_name) ~ '[[:alpha:]]'
    THEN
      NEW.contact_name_locked := true;
    END IF;
    RETURN NEW;
  END IF;

  NEW.contact_name := v_name;
  NEW.contact_name_locked := true;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lock_auxiliar_contact_name_on_tag ON public.whatsapp_conversations;
CREATE TRIGGER trg_lock_auxiliar_contact_name_on_tag
  BEFORE INSERT OR UPDATE OF tag_ids, phone, contact_name, contact_name_locked
  ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_auxiliar_contact_name_on_tag();
