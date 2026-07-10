-- Fix: set_directory_classification_tags devolvía éxito sin escribir crm_directory
-- cuando whatsapp_conversation_id no coincidía con stable_key (p. ej. UUID).
-- Siempre persiste tags en directorio; sincroniza conversación WA si existe.

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
      v_classification := array_to_string(v_tag_names, ', ');
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

GRANT EXECUTE ON FUNCTION public.set_directory_classification_tags(uuid, uuid[]) TO authenticated, service_role;
