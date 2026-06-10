-- Fusiona duplicados en crm_directory por últimos 10 dígitos del teléfono.
-- Ejecutar ANTES de aplicar el índice UNIQUE en phone_key.
-- Uso: npx supabase db query --linked -f scripts/merge-duplicate-directory.sql

CREATE OR REPLACE FUNCTION pg_temp.merge_directory_duplicates()
RETURNS TABLE(phone_key text, kept_id uuid, removed_id uuid) AS $$
DECLARE
  grp RECORD;
  v_keeper uuid;
  v_dup uuid;
  v_dup_row public.crm_directory%ROWTYPE;
BEGIN
  FOR grp IN
    SELECT
      CASE
        WHEN length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
          THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
        ELSE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
      END AS pk
    FROM public.crm_directory
    WHERE phone IS NOT NULL AND trim(phone) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    SELECT d.id INTO v_keeper
    FROM public.crm_directory d
    WHERE (
      CASE
        WHEN length(regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g')) >= 10
          THEN right(regexp_replace(d.phone, '[^0-9]', '', 'g'), 10)
        ELSE regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g')
      END
    ) = grp.pk
    ORDER BY
      (d.phone LIKE '+%') DESC,
      (d.provider_id IS NOT NULL)::int DESC,
      (d.service_id IS NOT NULL)::int DESC,
      (d.whatsapp_conversation_id IS NOT NULL)::int DESC,
      (d.app_user_id IS NOT NULL)::int DESC,
      d.updated_at DESC NULLS LAST,
      d.created_at DESC NULLS LAST
    LIMIT 1;

    FOR v_dup IN
      SELECT d.id
      FROM public.crm_directory d
      WHERE (
        CASE
          WHEN length(regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g')) >= 10
            THEN right(regexp_replace(d.phone, '[^0-9]', '', 'g'), 10)
          ELSE regexp_replace(COALESCE(d.phone, ''), '[^0-9]', '', 'g')
        END
      ) = grp.pk
        AND d.id <> v_keeper
    LOOP
      SELECT * INTO v_dup_row FROM public.crm_directory WHERE id = v_dup;

      UPDATE public.crm_directory k
      SET
        full_name = COALESCE(NULLIF(trim(k.full_name), ''), v_dup_row.full_name),
        display_name = COALESCE(k.display_name, v_dup_row.display_name),
        email = COALESCE(k.email, v_dup_row.email),
        phone = CASE
          WHEN k.phone LIKE '+%' THEN k.phone
          WHEN v_dup_row.phone LIKE '+%' THEN v_dup_row.phone
          ELSE COALESCE(k.phone, v_dup_row.phone)
        END,
        photo_url = COALESCE(k.photo_url, v_dup_row.photo_url),
        address = COALESCE(k.address, v_dup_row.address),
        notes = COALESCE(k.notes, v_dup_row.notes),
        app_user_id = COALESCE(k.app_user_id, v_dup_row.app_user_id),
        is_app_user = COALESCE(k.is_app_user, v_dup_row.is_app_user),
        provider_id = COALESCE(k.provider_id, v_dup_row.provider_id),
        service_id = COALESCE(k.service_id, v_dup_row.service_id),
        whatsapp_conversation_id = COALESCE(k.whatsapp_conversation_id, v_dup_row.whatsapp_conversation_id),
        whatsapp_assigned_to = COALESCE(k.whatsapp_assigned_to, v_dup_row.whatsapp_assigned_to),
        last_whatsapp_message_at = COALESCE(
          GREATEST(k.last_whatsapp_message_at, v_dup_row.last_whatsapp_message_at),
          k.last_whatsapp_message_at,
          v_dup_row.last_whatsapp_message_at
        ),
        last_whatsapp_message_text = COALESCE(k.last_whatsapp_message_text, v_dup_row.last_whatsapp_message_text),
        last_whatsapp_intent = COALESCE(k.last_whatsapp_intent, v_dup_row.last_whatsapp_intent),
        unread_whatsapp_count = GREATEST(
          COALESCE(k.unread_whatsapp_count, 0),
          COALESCE(v_dup_row.unread_whatsapp_count, 0)
        ),
        source = CASE
          WHEN k.source IS NULL OR k.source = '' THEN v_dup_row.source
          WHEN v_dup_row.source IS NULL OR v_dup_row.source = '' THEN k.source
          WHEN k.source NOT LIKE '%' || v_dup_row.source || '%'
            THEN k.source || ', ' || v_dup_row.source
          ELSE k.source
        END,
        channels = (
          SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(k.channels, '{}') || COALESCE(v_dup_row.channels, '{}')))
        ),
        metadata = COALESCE(k.metadata, '{}'::jsonb) || COALESCE(v_dup_row.metadata, '{}'::jsonb),
        updated_at = NOW()
      WHERE k.id = v_keeper;

      DELETE FROM public.crm_directory WHERE id = v_dup;

      phone_key := grp.pk;
      kept_id := v_keeper;
      removed_id := v_dup;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT * FROM pg_temp.merge_directory_duplicates();
