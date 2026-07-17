-- Tag Decline / 🚫 / Bloqueado en crm_directory → upsert en whatsapp_blocklist.
-- Complementa el flujo inbox→tag (Edge Function applyBlockedTagToDirectory).
-- Nota: crm_directory.tags es text[] (no jsonb).

CREATE OR REPLACE FUNCTION public.directory_has_blacklist_tag(p_tags text[], p_classification text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_token text;
  v_haystack text;
  v_tag text;
BEGIN
  v_haystack := lower(trim(coalesce(p_classification, '')));
  FOREACH v_token IN ARRAY ARRAY['decline', 'bloqueado', '🚫']
  LOOP
    IF v_haystack = v_token
       OR v_haystack LIKE v_token || ',%'
       OR v_haystack LIKE '%,' || v_token
       OR v_haystack LIKE '%,' || v_token || ',%'
    THEN
      RETURN true;
    END IF;
  END LOOP;

  IF p_tags IS NOT NULL THEN
    FOREACH v_tag IN ARRAY p_tags
    LOOP
      IF lower(trim(v_tag)) IN ('decline', 'bloqueado', '🚫') THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_directory_blacklist_to_whatsapp_blocklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_had boolean;
  v_has boolean;
  v_phone text;
  v_digits text;
BEGIN
  v_had := CASE
    WHEN TG_OP = 'UPDATE' THEN public.directory_has_blacklist_tag(OLD.tags, OLD.classification)
    ELSE false
  END;
  v_has := public.directory_has_blacklist_tag(NEW.tags, NEW.classification);

  -- Solo actuar al pasar a blacklist (evita ruido en updates normales).
  IF NOT v_has OR v_had THEN
    RETURN NEW;
  END IF;

  v_phone := nullif(trim(NEW.phone), '');
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF v_digits = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.whatsapp_blocklist (phone, stable_key, reason, created_at)
  VALUES (
    v_digits,
    coalesce(nullif(trim(NEW.whatsapp_conversation_id), ''), v_digits),
    'directory_tag',
    now()
  )
  ON CONFLICT (phone) DO UPDATE
  SET
    stable_key = COALESCE(EXCLUDED.stable_key, whatsapp_blocklist.stable_key),
    reason = COALESCE(whatsapp_blocklist.reason, EXCLUDED.reason);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_directory_blacklist_to_blocklist ON public.crm_directory;

CREATE TRIGGER trg_sync_directory_blacklist_to_blocklist
  AFTER INSERT OR UPDATE OF tags, classification, phone
  ON public.crm_directory
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_directory_blacklist_to_whatsapp_blocklist();

COMMENT ON FUNCTION public.sync_directory_blacklist_to_whatsapp_blocklist() IS
  'Si crm_directory gana tag Decline/🚫/Bloqueado, upsert en whatsapp_blocklist.';
