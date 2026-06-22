-- crm_directory: auto-merge de duplicados inequívocos + issue duplicate_orphan.
--
-- 1. auto_merge_directory_by_identity(): fusiona automáticamente filas que
--    comparten un identificador de origen inequívoco (firebase_crmClient_docId,
--    o provider_id+service_id de un cliente CRM sin teléfono/email). Se ejecuta
--    al inicio de detect_directory_issues() (cron horario) y como backfill.
-- 2. detect_directory_issues(): añade el issue_type 'duplicate_orphan' para
--    duplicados por nombre SIN teléfono/email NI identificador compartido (lo que
--    el auto-merge no toca) → revisión IA/humana. duplicate_name pasa a requerir
--    al menos un miembro con contacto para no solaparse con orphan.

-- =============================================================================
-- 1. Auto-merge por identificador de origen inequívoco
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_merge_directory_by_identity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group RECORD;
  v_dup UUID;
  v_merged INTEGER := 0;
BEGIN
  -- Grupo A: mismo documento Firestore de origen (firebase_crmClient_docId).
  FOR v_group IN
    SELECT
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        created_at ASC
      ) AS ids
    FROM crm_directory
    WHERE NULLIF(trim(metadata->'source_ids'->>'firebase_crmClient_docId'), '') IS NOT NULL
    GROUP BY (metadata->'source_ids'->>'firebase_crmClient_docId')
    HAVING count(*) > 1
  LOOP
    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      PERFORM merge_directory_entries(v_group.ids[1], v_dup);
      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  -- Grupo B: mismo provider_id + service_id de un cliente CRM sin teléfono/email.
  FOR v_group IN
    SELECT
      array_agg(id ORDER BY
        CASE
          WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
          WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
          WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
          WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
          ELSE 4
        END,
        created_at ASC
      ) AS ids
    FROM crm_directory
    WHERE provider_id IS NOT NULL
      AND service_id IS NOT NULL
      AND source ILIKE '%CRM_CLIENT%'
      AND (phone IS NULL OR trim(phone) = '' OR phone_key IS NULL)
      AND (email IS NULL OR trim(email) = '')
    GROUP BY provider_id, service_id
    HAVING count(*) > 1
  LOOP
    FOREACH v_dup IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      PERFORM merge_directory_entries(v_group.ids[1], v_dup);
      v_merged := v_merged + 1;
    END LOOP;
  END LOOP;

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_merge_directory_by_identity() TO authenticated, service_role;

-- =============================================================================
-- 2. detect_directory_issues(): auto-merge previo + duplicate_orphan
-- =============================================================================

CREATE OR REPLACE FUNCTION detect_directory_issues()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Fusiona primero los duplicados inequívocos (no quedan para revisión humana).
  PERFORM auto_merge_directory_by_identity();

  CREATE TEMP TABLE tmp_current_issues (
    dedupe_key        TEXT PRIMARY KEY,
    entry_id          UUID,
    related_entry_ids UUID[] NOT NULL DEFAULT '{}',
    issue_type        TEXT NOT NULL,
    severity          TEXT NOT NULL,
    details           JSONB NOT NULL DEFAULT '{}'::jsonb
  ) ON COMMIT DROP;

  -- ── Issues de fila única ──────────────────────────────────────────────────
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

  -- ── Duplicados por phone_key ──────────────────────────────────────────────
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

  -- ── Duplicados por email ──────────────────────────────────────────────────
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

  -- ── Duplicados por nombre normalizado (al menos un miembro con contacto) ──
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
      AND bool_or(phone_key IS NOT NULL OR (email IS NOT NULL AND trim(email) <> ''))
  ) g
  ON CONFLICT (dedupe_key) DO NOTHING;

  -- ── Duplicados huérfanos: mismo nombre SIN teléfono/email ni identificador ─
  -- compartido (auto-merge no los tocó). Quedan para revisión IA/humana.
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

  -- ── Upsert a la tabla real (preserva 'dismissed') ─────────────────────────
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

  -- ── Reconciliación: resolver issues abiertos que ya no aplican ────────────
  UPDATE crm_directory_issues i
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), resolution = 'auto'
  WHERE i.status = 'open'
    AND NOT EXISTS (SELECT 1 FROM tmp_current_issues t WHERE t.dedupe_key = i.dedupe_key);

  SELECT count(*) INTO v_count FROM tmp_current_issues;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION detect_directory_issues() TO authenticated, service_role;

-- =============================================================================
-- 3. Backfill: limpia duplicados inequívocos existentes y re-detecta
-- =============================================================================

SELECT auto_merge_directory_by_identity();
SELECT detect_directory_issues();
