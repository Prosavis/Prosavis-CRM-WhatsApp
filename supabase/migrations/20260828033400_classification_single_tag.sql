-- classification is a single backend token, not a visual join of every tag.
-- Chips render crm_directory.tags only. The old "Agendado, Cliente Problemática"
-- string was being painted as a third gray chip.

CREATE OR REPLACE FUNCTION public.directory_classification_from_tag_names(p_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(trim(p_tags[1]), ''), 'unknown');
$$;

COMMENT ON FUNCTION public.directory_classification_from_tag_names(text[]) IS
  'Primary classification token from tags[1]. Never concatenates names.';

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
      v_classification := public.directory_classification_from_tag_names(v_tag_names);
    END IF;
  END IF;

  v_phone := COALESCE(
    normalize_directory_phone_e164(NEW.contact_phone),
    normalize_directory_phone_e164(NEW.phone)
  );

  IF public.is_commercial_whatsapp_line(NEW.phone_number_id) THEN
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

CREATE OR REPLACE FUNCTION public.set_directory_classification_tags(
  p_directory_id UUID,
  p_tag_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dir RECORD;
  v_tag_names TEXT[];
  v_classification TEXT;
  v_entry JSONB;
  v_conv_ref TEXT;
  v_safe_tag_ids UUID[];
BEGIN
  SELECT * INTO v_dir FROM public.crm_directory WHERE id = p_directory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Directorio: entrada no encontrada (%)', p_directory_id;
  END IF;

  v_safe_tag_ids := COALESCE(p_tag_ids, '{}'::uuid[]);

  IF cardinality(v_safe_tag_ids) = 0 THEN
    v_tag_names := ARRAY[]::TEXT[];
    v_classification := 'unknown';
  ELSE
    SELECT ARRAY_AGG(t.name ORDER BY t.name)
    INTO v_tag_names
    FROM unnest(v_safe_tag_ids) AS tid
    JOIN public.whatsapp_chat_tags t ON t.id = tid
    WHERE COALESCE(t.archived, false) = false;

    IF v_tag_names IS NULL OR cardinality(v_tag_names) = 0 THEN
      v_tag_names := ARRAY[]::TEXT[];
      v_classification := 'unknown';
    ELSE
      v_classification := public.directory_classification_from_tag_names(v_tag_names);
    END IF;
  END IF;

  v_conv_ref := NULLIF(trim(v_dir.whatsapp_conversation_id), '');

  IF v_conv_ref IS NOT NULL THEN
    UPDATE public.whatsapp_conversations c
    SET tag_ids = v_safe_tag_ids
    WHERE c.id::text = v_conv_ref
       OR c.stable_key = v_conv_ref;
  END IF;

  v_entry := jsonb_build_object(
    'id', p_directory_id,
    'classification', v_classification,
    'tags', to_jsonb(v_tag_names)
  );

  RETURN public.upsert_directory_entry(v_entry, true, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.directory_classification_from_tag_names(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_directory_classification_tags(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_classification_from_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.tags IS NOT NULL AND array_length(NEW.tags, 1) > 0 THEN
    NEW.classification := public.directory_classification_from_tag_names(NEW.tags);
  ELSIF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL OR NEW.tags = '{}' THEN
    IF NEW.classification IS NULL OR NEW.classification = '' THEN
      NEW.classification := 'unknown';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.crm_directory
SET
  classification = public.directory_classification_from_tag_names(tags),
  updated_at = now()
WHERE classification LIKE '%,%';
