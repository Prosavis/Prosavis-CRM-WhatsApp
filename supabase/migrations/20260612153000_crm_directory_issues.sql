-- crm_directory_issues: orquestador de calidad del directorio + cola de revisión humana.
-- El orquestador NUNCA modifica crm_directory: solo detecta inconsistencias y las encola.
-- La única escritura automática del directorio sigue siendo onUserWriteSyncDirectory (Firebase).

-- =============================================================================
-- 1. Tabla de issues (cola de revisión humana)
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_directory_issues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          UUID REFERENCES crm_directory(id) ON DELETE CASCADE,
  related_entry_ids UUID[] NOT NULL DEFAULT '{}',
  issue_type        TEXT NOT NULL,
  severity          TEXT NOT NULL DEFAULT 'warning',
  status            TEXT NOT NULL DEFAULT 'open',
  details           JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key        TEXT NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,
  resolution        TEXT,
  CONSTRAINT uq_directory_issue_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_directory_issues_status ON crm_directory_issues (status);
CREATE INDEX IF NOT EXISTS idx_directory_issues_type ON crm_directory_issues (issue_type);
CREATE INDEX IF NOT EXISTS idx_directory_issues_entry ON crm_directory_issues (entry_id);

-- =============================================================================
-- 2. Predicados de calidad (puros, reutilizables por detección puntual y full scan)
-- =============================================================================

CREATE OR REPLACE FUNCTION directory_name_normalized(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')));
$$;

-- Detecta emojis / pictogramas en el nombre mediante rangos Unicode.
CREATE OR REPLACE FUNCTION directory_name_has_emoji(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_name, '') ~
    '[\u2122\u2139\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F\U0001F000-\U0001FAFF]';
$$;

-- Nombre ausente, placeholder, o que es simplemente el teléfono.
CREATE OR REPLACE FUNCTION directory_name_is_missing(p_name TEXT, p_phone TEXT, p_phone_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_name IS NULL
    OR trim(p_name) = ''
    OR lower(trim(p_name)) IN ('sin nombre', 'sin nombre.', 'unknown', 'desconocido', 'n/a', 'na')
    OR (p_phone_key IS NOT NULL AND regexp_replace(trim(p_name), '[^0-9]', '', 'g') = p_phone_key)
    OR (p_phone IS NOT NULL AND trim(p_name) = trim(p_phone));
$$;

-- Nombre inválido: 1 carácter (ej. "."), o sin ninguna letra (solo símbolos/números).
CREATE OR REPLACE FUNCTION directory_name_is_invalid(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_name IS NOT NULL
    AND trim(p_name) <> ''
    AND (
      char_length(trim(p_name)) <= 1
      OR trim(p_name) !~ '[[:alpha:]]'
    );
$$;

-- Teléfono presente pero con formato que no normaliza a E.164.
CREATE OR REPLACE FUNCTION directory_phone_is_invalid(p_phone TEXT, p_phone_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_phone IS NOT NULL
    AND trim(p_phone) <> ''
    AND (p_phone_key IS NULL OR normalize_directory_phone_e164(p_phone) IS NULL);
$$;

-- =============================================================================
-- 3. Upsert atómico de un issue (preserva 'dismissed' decidido por humano)
-- =============================================================================

CREATE OR REPLACE FUNCTION _upsert_directory_issue(
  p_dedupe_key TEXT,
  p_entry_id UUID,
  p_type TEXT,
  p_severity TEXT,
  p_details JSONB,
  p_related UUID[],
  p_applies BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_applies THEN
    INSERT INTO crm_directory_issues (
      entry_id, related_entry_ids, issue_type, severity, status, details, dedupe_key, detected_at, updated_at
    )
    VALUES (
      p_entry_id, COALESCE(p_related, '{}'), p_type, p_severity, 'open', p_details, p_dedupe_key, NOW(), NOW()
    )
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
  ELSE
    UPDATE crm_directory_issues
    SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(), resolution = 'auto'
    WHERE dedupe_key = p_dedupe_key AND status = 'open';
  END IF;
END;
$$;

-- =============================================================================
-- 4. Detección de duplicados (por phone_key / email) para una clave concreta
-- =============================================================================

CREATE OR REPLACE FUNCTION detect_directory_phone_dup(p_phone_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  IF p_phone_key IS NULL OR trim(p_phone_key) = '' THEN
    RETURN;
  END IF;

  SELECT array_agg(id ORDER BY
    CASE
      WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
      WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
      WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
      WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
      ELSE 4
    END,
    updated_at DESC NULLS LAST,
    created_at ASC
  )
  INTO v_ids
  FROM crm_directory
  WHERE phone_key = p_phone_key;

  PERFORM _upsert_directory_issue(
    'duplicate_phone:' || p_phone_key,
    v_ids[1],
    'duplicate_phone',
    'error',
    jsonb_build_object('phone_key', p_phone_key, 'count', cardinality(v_ids), 'entry_ids', to_jsonb(v_ids)),
    CASE WHEN cardinality(v_ids) > 1 THEN v_ids[2:cardinality(v_ids)] ELSE '{}'::uuid[] END,
    cardinality(v_ids) > 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION detect_directory_email_dup(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_email TEXT;
BEGIN
  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email = '' THEN
    RETURN;
  END IF;

  SELECT array_agg(id ORDER BY
    CASE
      WHEN COALESCE(source, '') ILIKE '%CRM_CLIENT%' THEN 0
      WHEN COALESCE(source, '') ILIKE '%APP_USER%' THEN 1
      WHEN COALESCE(source, '') ILIKE '%LEAD%' THEN 2
      WHEN COALESCE(source, '') ILIKE '%WHATSAPP%' THEN 3
      ELSE 4
    END,
    updated_at DESC NULLS LAST,
    created_at ASC
  )
  INTO v_ids
  FROM crm_directory
  WHERE lower(trim(email)) = v_email;

  PERFORM _upsert_directory_issue(
    'duplicate_email:' || v_email,
    v_ids[1],
    'duplicate_email',
    'warning',
    jsonb_build_object('email', v_email, 'count', cardinality(v_ids), 'entry_ids', to_jsonb(v_ids)),
    CASE WHEN cardinality(v_ids) > 1 THEN v_ids[2:cardinality(v_ids)] ELSE '{}'::uuid[] END,
    cardinality(v_ids) > 1
  );
END;
$$;

-- =============================================================================
-- 5. Detección puntual (near-realtime) para una entrada
-- =============================================================================

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

  -- Duplicados con lookup indexado (phone_key / email)
  IF d.phone_key IS NOT NULL THEN
    PERFORM detect_directory_phone_dup(d.phone_key);
  END IF;
  IF d.email IS NOT NULL AND trim(d.email) <> '' THEN
    PERFORM detect_directory_email_dup(d.email);
  END IF;
END;
$$;

-- =============================================================================
-- 6. Full scan + reconciliación (auto-resuelve issues obsoletos)
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

  -- ── Duplicados por nombre normalizado (solo nombres "reales") ─────────────
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

-- =============================================================================
-- 7. Trigger near-realtime sobre crm_directory
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_crm_directory_detect_issues()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM detect_directory_issues_for_entry(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_directory_detect_issues ON crm_directory;
CREATE TRIGGER trg_crm_directory_detect_issues
  AFTER INSERT OR UPDATE OF full_name, phone, email ON crm_directory
  FOR EACH ROW
  EXECUTE FUNCTION trg_crm_directory_detect_issues();

-- =============================================================================
-- 8. RPCs de soporte para la UI (revisión humana)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_directory_issue_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_type JSONB;
  v_open INTEGER;
  v_dismissed INTEGER;
BEGIN
  SELECT COALESCE(jsonb_object_agg(issue_type, cnt), '{}'::jsonb) INTO v_by_type
  FROM (
    SELECT issue_type, count(*) AS cnt
    FROM crm_directory_issues
    WHERE status = 'open'
    GROUP BY issue_type
  ) s;

  SELECT
    count(*) FILTER (WHERE status = 'open'),
    count(*) FILTER (WHERE status = 'dismissed')
  INTO v_open, v_dismissed
  FROM crm_directory_issues;

  RETURN jsonb_build_object(
    'open_total', COALESCE(v_open, 0),
    'dismissed_total', COALESCE(v_dismissed, 0),
    'by_type', v_by_type
  );
END;
$$;

-- Marca un issue como atendido. 'dismissed' = ignorado por humano; otro = resuelto.
CREATE OR REPLACE FUNCTION resolve_directory_issue(p_issue_id UUID, p_resolution TEXT DEFAULT 'dismissed')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
BEGIN
  BEGIN
    v_actor := COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  UPDATE crm_directory_issues
  SET
    status = CASE WHEN p_resolution = 'dismissed' THEN 'dismissed' ELSE 'resolved' END,
    resolution = p_resolution,
    resolved_at = NOW(),
    resolved_by = v_actor,
    updated_at = NOW()
  WHERE id = p_issue_id;
END;
$$;

-- Fusiona el duplicado dentro de la entrada primaria y re-evalúa issues.
CREATE OR REPLACE FUNCTION merge_directory_entries(p_primary UUID, p_duplicate UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup crm_directory%ROWTYPE;
BEGIN
  IF p_primary = p_duplicate THEN
    RAISE EXCEPTION 'No se puede fusionar una entrada consigo misma';
  END IF;

  SELECT * INTO v_dup FROM crm_directory WHERE id = p_duplicate;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada duplicada no encontrada: %', p_duplicate;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_directory WHERE id = p_primary) THEN
    RAISE EXCEPTION 'Entrada primaria no encontrada: %', p_primary;
  END IF;

  UPDATE crm_directory k SET
    full_name = COALESCE(NULLIF(trim(k.full_name), ''), v_dup.full_name),
    display_name = COALESCE(k.display_name, v_dup.display_name),
    email = COALESCE(k.email, v_dup.email),
    phone = CASE
      WHEN k.phone LIKE '+%' THEN k.phone
      WHEN v_dup.phone LIKE '+%' THEN v_dup.phone
      ELSE COALESCE(k.phone, v_dup.phone)
    END,
    photo_url = COALESCE(k.photo_url, v_dup.photo_url),
    address = COALESCE(k.address, v_dup.address),
    notes = COALESCE(k.notes, v_dup.notes),
    app_user_id = COALESCE(k.app_user_id, v_dup.app_user_id),
    is_app_user = (COALESCE(k.is_app_user, false) OR COALESCE(v_dup.is_app_user, false)),
    provider_id = COALESCE(k.provider_id, v_dup.provider_id),
    service_id = COALESCE(k.service_id, v_dup.service_id),
    whatsapp_conversation_id = COALESCE(k.whatsapp_conversation_id, v_dup.whatsapp_conversation_id),
    whatsapp_assigned_to = COALESCE(k.whatsapp_assigned_to, v_dup.whatsapp_assigned_to),
    last_whatsapp_message_at = GREATEST(
      COALESCE(k.last_whatsapp_message_at, '1970-01-01'::timestamptz),
      COALESCE(v_dup.last_whatsapp_message_at, '1970-01-01'::timestamptz)
    ),
    last_whatsapp_message_text = COALESCE(k.last_whatsapp_message_text, v_dup.last_whatsapp_message_text),
    last_whatsapp_intent = COALESCE(k.last_whatsapp_intent, v_dup.last_whatsapp_intent),
    unread_whatsapp_count = COALESCE(k.unread_whatsapp_count, 0) + COALESCE(v_dup.unread_whatsapp_count, 0),
    messages_count = COALESCE(k.messages_count, 0) + COALESCE(v_dup.messages_count, 0),
    source = CASE
      WHEN k.source IS NULL OR k.source = '' THEN v_dup.source
      WHEN v_dup.source IS NULL OR v_dup.source = '' THEN k.source
      WHEN position(v_dup.source IN k.source) = 0 THEN k.source || ', ' || v_dup.source
      ELSE k.source
    END,
    channels = ARRAY(SELECT DISTINCT unnest(COALESCE(k.channels, '{}'::text[]) || COALESCE(v_dup.channels, '{}'::text[]))),
    tags = ARRAY(SELECT DISTINCT unnest(COALESCE(k.tags, '{}'::text[]) || COALESCE(v_dup.tags, '{}'::text[]))),
    metadata = COALESCE(k.metadata, '{}'::jsonb) || COALESCE(v_dup.metadata, '{}'::jsonb),
    updated_at = NOW()
  WHERE k.id = p_primary;

  DELETE FROM crm_directory WHERE id = p_duplicate;

  PERFORM detect_directory_issues_for_entry(p_primary);

  RETURN p_primary;
END;
$$;

-- =============================================================================
-- 9. Grants
-- =============================================================================

GRANT SELECT, UPDATE ON crm_directory_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_directory_issues TO service_role;

GRANT EXECUTE ON FUNCTION directory_name_normalized(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION directory_name_has_emoji(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION directory_name_is_missing(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION directory_name_is_invalid(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION directory_phone_is_invalid(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION detect_directory_issues() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION detect_directory_issues_for_entry(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_directory_issue_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION resolve_directory_issue(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION merge_directory_entries(UUID, UUID) TO authenticated, service_role;

-- =============================================================================
-- 10. pg_cron: full scan cada hora (safety net + detección de grupos)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'detect-directory-issues';
    PERFORM cron.schedule('detect-directory-issues', '0 * * * *', 'SELECT detect_directory_issues();');
  END IF;
END $$;

-- =============================================================================
-- 11. Backfill inicial
-- =============================================================================

SELECT detect_directory_issues();
