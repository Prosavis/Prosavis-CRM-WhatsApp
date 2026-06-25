-- Deja de crear issues duplicate_name: homónimos con teléfonos/emails distintos
-- no son duplicados. Los casos reales siguen en duplicate_phone, duplicate_email y duplicate_orphan.

CREATE OR REPLACE FUNCTION detect_directory_issues()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM auto_merge_directory_by_identity();

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
    'duplicate_orphan:' || g.name_key,
    g.all_ids[1],
    g.all_ids[2:cardinality(g.all_ids)],
    'duplicate_orphan',
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
      AND bool_and(phone_key IS NULL AND (email IS NULL OR trim(email) = ''))
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
    status = CASE
      WHEN _directory_issue_preserve_on_scan(crm_directory_issues.status, crm_directory_issues.resolution)
      THEN crm_directory_issues.status
      ELSE 'open'
    END,
    resolved_at = CASE
      WHEN _directory_issue_preserve_on_scan(crm_directory_issues.status, crm_directory_issues.resolution)
      THEN crm_directory_issues.resolved_at
      ELSE NULL
    END,
    resolution = CASE
      WHEN _directory_issue_preserve_on_scan(crm_directory_issues.status, crm_directory_issues.resolution)
      THEN crm_directory_issues.resolution
      ELSE NULL
    END;

  UPDATE crm_directory_issues i
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), resolution = 'auto'
  WHERE i.status = 'open'
    AND NOT EXISTS (SELECT 1 FROM tmp_current_issues t WHERE t.dedupe_key = i.dedupe_key);

  SELECT count(*) INTO v_count FROM tmp_current_issues;
  RETURN v_count;
END;
$$;

-- Reconciliar: cierra los duplicate_name abiertos que ya no aplican
SELECT detect_directory_issues();
