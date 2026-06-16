-- name_wa_mismatch: CRM tiene nombre legible pero WhatsApp muestra perfil/contact_name distinto.

CREATE OR REPLACE FUNCTION directory_name_is_usable(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_name IS NOT NULL
    AND char_length(trim(p_name)) >= 2
    AND trim(p_name) ~ '[[:alpha:]]'
    AND NOT directory_name_has_emoji(p_name)
    AND NOT directory_name_is_missing(p_name, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION detect_directory_name_wa_mismatch(
  p_entry_id UUID,
  p_phone_key TEXT,
  p_crm_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  wc RECORD;
  v_crm TEXT;
BEGIN
  IF NOT directory_name_is_usable(p_crm_name) OR p_phone_key IS NULL OR trim(p_phone_key) = '' THEN
    RETURN FALSE;
  END IF;

  v_crm := lower(trim(p_crm_name));

  SELECT id, contact_name, whatsapp_profile_name
  INTO wc
  FROM whatsapp_conversations
  WHERE phone_key = p_phone_key
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF wc.contact_name IS NULL OR trim(wc.contact_name) = '' THEN
    RETURN directory_name_has_emoji(wc.whatsapp_profile_name)
      OR (wc.whatsapp_profile_name IS NOT NULL AND trim(wc.whatsapp_profile_name) <> '' AND lower(trim(wc.whatsapp_profile_name)) <> v_crm);
  END IF;

  IF directory_name_has_emoji(wc.contact_name) THEN
    RETURN TRUE;
  END IF;

  RETURN lower(trim(wc.contact_name)) <> v_crm;
END;
$$;

-- Actualizar detección puntual
CREATE OR REPLACE FUNCTION detect_directory_issues_for_entry(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d crm_directory%ROWTYPE;
  v_missing BOOLEAN;
  v_emoji BOOLEAN;
  v_invalid BOOLEAN;
  v_missing_phone BOOLEAN;
  v_invalid_phone BOOLEAN;
  v_wa_mismatch BOOLEAN;
  v_crm_name TEXT;
  v_wa_conv_id TEXT;
  v_wa_contact TEXT;
  v_wa_profile TEXT;
BEGIN
  SELECT * INTO d FROM crm_directory WHERE id = p_entry_id;

  IF NOT FOUND THEN
    UPDATE crm_directory_issues
    SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), resolution = 'auto'
    WHERE entry_id = p_entry_id AND status = 'open';
    RETURN;
  END IF;

  v_missing := directory_name_is_missing(d.full_name, d.phone, d.phone_key);
  v_emoji := (NOT v_missing) AND directory_name_has_emoji(d.full_name);
  v_invalid := (NOT v_missing) AND (NOT v_emoji) AND directory_name_is_invalid(d.full_name);
  v_missing_phone := d.phone IS NULL OR trim(d.phone) = '';
  v_invalid_phone := directory_phone_is_invalid(d.phone, d.phone_key);

  v_crm_name := COALESCE(NULLIF(trim(d.display_name), ''), NULLIF(trim(d.full_name), ''), '');
  v_wa_mismatch := detect_directory_name_wa_mismatch(d.id, d.phone_key, v_crm_name);

  IF v_wa_mismatch AND d.phone_key IS NOT NULL THEN
    SELECT id, contact_name, whatsapp_profile_name
    INTO v_wa_conv_id, v_wa_contact, v_wa_profile
    FROM whatsapp_conversations
    WHERE phone_key = d.phone_key
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  PERFORM _upsert_directory_issue('missing_name:' || d.id, d.id, 'missing_name', 'warning',
    jsonb_build_object('full_name', d.full_name), '{}'::uuid[], v_missing);
  PERFORM _upsert_directory_issue('emoji_name:' || d.id, d.id, 'emoji_name', 'warning',
    jsonb_build_object('full_name', d.full_name), '{}'::uuid[], v_emoji);
  PERFORM _upsert_directory_issue('invalid_name:' || d.id, d.id, 'invalid_name', 'warning',
    jsonb_build_object('full_name', d.full_name), '{}'::uuid[], v_invalid);
  PERFORM _upsert_directory_issue('missing_phone:' || d.id, d.id, 'missing_phone', 'warning',
    '{}'::jsonb, '{}'::uuid[], v_missing_phone);
  PERFORM _upsert_directory_issue('invalid_phone:' || d.id, d.id, 'invalid_phone', 'error',
    jsonb_build_object('phone', d.phone), '{}'::uuid[], v_invalid_phone);
  PERFORM _upsert_directory_issue(
    'name_wa_mismatch:' || d.id,
    d.id,
    'name_wa_mismatch',
    'warning',
    jsonb_build_object(
      'crm_name', v_crm_name,
      'contact_name', v_wa_contact,
      'whatsapp_profile_name', v_wa_profile,
      'conversation_id', v_wa_conv_id,
      'phone_key', d.phone_key
    ),
    '{}'::uuid[],
    v_wa_mismatch
  );

  IF d.phone_key IS NOT NULL THEN
    PERFORM detect_directory_phone_dup(d.phone_key);
  END IF;
  IF d.email IS NOT NULL AND trim(d.email) <> '' THEN
    PERFORM detect_directory_email_dup(d.email);
  END IF;
END;
$$;

-- Full scan: insertar name_wa_mismatch antes de duplicados (resto de detect_directory_issues igual)
CREATE OR REPLACE FUNCTION detect_directory_issues()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  CREATE TEMP TABLE tmp_current_issues (
    dedupe_key        TEXT PRIMARY KEY,
    entry_id          UUID,
    related_entry_ids UUID[] NOT NULL DEFAULT '{}',
    issue_type        TEXT NOT NULL,
    severity          TEXT NOT NULL,
    details           JSONB NOT NULL DEFAULT '{}'::jsonb
  ) ON COMMIT DROP;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT 'missing_name:' || d.id, d.id, 'missing_name', 'warning',
         jsonb_build_object('full_name', d.full_name)
  FROM crm_directory d
  WHERE directory_name_is_missing(d.full_name, d.phone, d.phone_key)
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT 'emoji_name:' || d.id, d.id, 'emoji_name', 'warning',
         jsonb_build_object('full_name', d.full_name)
  FROM crm_directory d
  WHERE NOT directory_name_is_missing(d.full_name, d.phone, d.phone_key)
    AND directory_name_has_emoji(d.full_name)
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT 'invalid_name:' || d.id, d.id, 'invalid_name', 'warning',
         jsonb_build_object('full_name', d.full_name)
  FROM crm_directory d
  WHERE NOT directory_name_is_missing(d.full_name, d.phone, d.phone_key)
    AND NOT directory_name_has_emoji(d.full_name)
    AND directory_name_is_invalid(d.full_name)
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT 'missing_phone:' || d.id, d.id, 'missing_phone', 'warning', '{}'::jsonb
  FROM crm_directory d
  WHERE d.phone IS NULL OR trim(d.phone) = ''
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT 'invalid_phone:' || d.id, d.id, 'invalid_phone', 'error',
         jsonb_build_object('phone', d.phone)
  FROM crm_directory d
  WHERE directory_phone_is_invalid(d.phone, d.phone_key)
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, issue_type, severity, details)
  SELECT
    'name_wa_mismatch:' || d.id,
    d.id,
    'name_wa_mismatch',
    'warning',
    jsonb_build_object(
      'crm_name', COALESCE(NULLIF(trim(d.display_name), ''), NULLIF(trim(d.full_name), '')),
      'contact_name', wc.contact_name,
      'whatsapp_profile_name', wc.whatsapp_profile_name,
      'conversation_id', wc.id,
      'phone_key', d.phone_key
    )
  FROM crm_directory d
  INNER JOIN LATERAL (
    SELECT wc2.id, wc2.contact_name, wc2.whatsapp_profile_name
    FROM whatsapp_conversations wc2
    WHERE wc2.phone_key = d.phone_key
    ORDER BY wc2.last_message_at DESC NULLS LAST
    LIMIT 1
  ) wc ON TRUE
  WHERE detect_directory_name_wa_mismatch(
    d.id,
    d.phone_key,
    COALESCE(NULLIF(trim(d.display_name), ''), NULLIF(trim(d.full_name), ''), '')
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, related_entry_ids, issue_type, severity, details)
  SELECT
    'duplicate_phone:' || g.phone_key,
    g.all_ids[1],
    g.all_ids[2:cardinality(g.all_ids)],
    'duplicate_phone',
    'error',
    jsonb_build_object('phone_key', g.phone_key, 'count', g.cnt, 'entry_ids', to_jsonb(g.all_ids))
  FROM (
    SELECT phone_key,
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        updated_at DESC NULLS LAST,
        created_at ASC
      ) AS all_ids,
      count(*) AS cnt
    FROM crm_directory
    WHERE phone_key IS NOT NULL
    GROUP BY phone_key
    HAVING count(*) > 1
  ) g
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, related_entry_ids, issue_type, severity, details)
  SELECT
    'duplicate_email:' || g.email_key,
    g.all_ids[1],
    g.all_ids[2:cardinality(g.all_ids)],
    'duplicate_email',
    'warning',
    jsonb_build_object('email', g.email_key, 'count', g.cnt, 'entry_ids', to_jsonb(g.all_ids))
  FROM (
    SELECT lower(trim(email)) AS email_key,
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        updated_at DESC NULLS LAST,
        created_at ASC
      ) AS all_ids,
      count(*) AS cnt
    FROM crm_directory
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
  ) g
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO tmp_current_issues (dedupe_key, entry_id, related_entry_ids, issue_type, severity, details)
  SELECT
    'duplicate_name:' || g.name_key,
    g.all_ids[1],
    g.all_ids[2:cardinality(g.all_ids)],
    'duplicate_name',
    'warning',
    jsonb_build_object('full_name', g.name_key, 'count', g.cnt, 'entry_ids', to_jsonb(g.all_ids))
  FROM (
    SELECT directory_name_normalized(full_name) AS name_key,
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        updated_at DESC NULLS LAST,
        created_at ASC
      ) AS all_ids,
      count(*) AS cnt
    FROM crm_directory
    WHERE NOT directory_name_is_missing(full_name, phone, phone_key)
      AND NOT directory_name_has_emoji(full_name)
      AND NOT directory_name_is_invalid(full_name)
      AND char_length(directory_name_normalized(full_name)) >= 3
    GROUP BY directory_name_normalized(full_name)
    HAVING count(*) > 1
  ) g
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO crm_directory_issues (
    entry_id, related_entry_ids, issue_type, severity, status, details, dedupe_key, detected_at, updated_at
  )
  SELECT entry_id, related_entry_ids, issue_type, severity, 'open', details, dedupe_key, NOW(), NOW()
  FROM tmp_current_issues
  ON CONFLICT (dedupe_key) DO UPDATE SET
    entry_id = excluded.entry_id,
    related_entry_ids = excluded.related_entry_ids,
    details = excluded.details,
    severity = excluded.severity,
    detected_at = NOW(),
    updated_at = NOW(),
    status = CASE WHEN crm_directory_issues.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
    resolved_at = CASE WHEN crm_directory_issues.status = 'dismissed' THEN crm_directory_issues.resolved_at ELSE NULL END,
    resolution = CASE WHEN crm_directory_issues.status = 'dismissed' THEN crm_directory_issues.resolution ELSE NULL END;

  UPDATE crm_directory_issues i
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), resolution = 'auto'
  WHERE i.status = 'open'
    AND NOT EXISTS (SELECT 1 FROM tmp_current_issues t WHERE t.dedupe_key = i.dedupe_key);

  SELECT count(*) INTO v_count FROM tmp_current_issues;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION directory_name_is_usable(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION detect_directory_name_wa_mismatch(UUID, TEXT, TEXT) TO authenticated, service_role;
