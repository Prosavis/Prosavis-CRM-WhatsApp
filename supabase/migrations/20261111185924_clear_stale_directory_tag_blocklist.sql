-- La lista negra por etiqueta solo se agregaba al marcar Decline/Bloqueado.
-- Si esa etiqueta se quitaba, el bloqueo se quedaba y el CRM rechazaba
-- textos y archivos con recipient_blocked.

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

  v_phone := nullif(trim(NEW.phone), '');
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF v_digits = '' THEN
    RETURN NEW;
  END IF;

  IF v_has AND NOT v_had THEN
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
  ELSIF NOT v_has THEN
    DELETE FROM public.whatsapp_blocklist
    WHERE phone = v_digits
      AND reason = 'directory_tag';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_directory_blacklist_to_whatsapp_blocklist() IS
  'Si crm_directory gana Decline/Bloqueado, bloquea el teléfono. Si ya no lo tiene, quita solo el bloqueo directory_tag.';

DELETE FROM public.whatsapp_blocklist b
WHERE b.reason = 'directory_tag'
  AND NOT EXISTS (
    SELECT 1
    FROM public.crm_directory d
    WHERE regexp_replace(coalesce(d.phone, ''), '\D', '', 'g') = b.phone
      AND public.directory_has_blacklist_tag(d.tags, d.classification)
  );
