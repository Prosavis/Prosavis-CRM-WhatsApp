-- crm_directory_ai_suggestions: sugerencias generadas por IA (Gemini) para revisión humana.
-- La IA NUNCA escribe en crm_directory: solo encola sugerencias. Cada sugerencia se
-- aplica manualmente desde la UI (que reutiliza upsert_directory_entry / merge_directory_entries).
-- Complementa crm_directory_issues: el orquestador detecta; la IA propone arreglos legibles.

-- =============================================================================
-- 1. Tabla de sugerencias de IA
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_directory_ai_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          UUID REFERENCES crm_directory(id) ON DELETE CASCADE,
  issue_id          UUID REFERENCES crm_directory_issues(id) ON DELETE SET NULL,
  suggestion_type   TEXT NOT NULL, -- name_cleanup | phone_fix | tag_suggestion | merge | summary
  field             TEXT,          -- full_name | phone | tags (NULL para merge/summary)
  current_value     JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_value   JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence        NUMERIC(4,3),  -- 0.000 .. 1.000
  reason            TEXT,
  related_entry_ids UUID[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'open', -- open | applied | dismissed
  model             TEXT,
  dedupe_key        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at        TIMESTAMPTZ,
  applied_by        TEXT,
  CONSTRAINT uq_ai_suggestion_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON crm_directory_ai_suggestions (status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type ON crm_directory_ai_suggestions (suggestion_type);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entry ON crm_directory_ai_suggestions (entry_id);

-- =============================================================================
-- 2. Upsert atómico de una sugerencia (preserva 'dismissed' decidido por humano)
-- =============================================================================
-- Usado por la Edge Function (service_role). Reabre solo lo que no fue descartado.

CREATE OR REPLACE FUNCTION upsert_directory_ai_suggestion(
  p_dedupe_key TEXT,
  p_entry_id UUID,
  p_issue_id UUID,
  p_type TEXT,
  p_field TEXT,
  p_current JSONB,
  p_suggested JSONB,
  p_confidence NUMERIC,
  p_reason TEXT,
  p_related UUID[],
  p_model TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO crm_directory_ai_suggestions (
    entry_id, issue_id, suggestion_type, field, current_value, suggested_value,
    confidence, reason, related_entry_ids, status, model, dedupe_key, created_at, updated_at
  )
  VALUES (
    p_entry_id, p_issue_id, p_type, p_field, COALESCE(p_current, '{}'::jsonb),
    COALESCE(p_suggested, '{}'::jsonb), p_confidence, p_reason,
    COALESCE(p_related, '{}'), 'open', p_model, p_dedupe_key, NOW(), NOW()
  )
  ON CONFLICT (dedupe_key) DO UPDATE SET
    entry_id = excluded.entry_id,
    issue_id = excluded.issue_id,
    field = excluded.field,
    current_value = excluded.current_value,
    suggested_value = excluded.suggested_value,
    confidence = excluded.confidence,
    reason = excluded.reason,
    related_entry_ids = excluded.related_entry_ids,
    model = excluded.model,
    updated_at = NOW(),
    -- 'dismissed' sticky; lo demás se reabre porque la inconsistencia persiste.
    status = CASE WHEN crm_directory_ai_suggestions.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
    applied_at = CASE WHEN crm_directory_ai_suggestions.status = 'dismissed' THEN crm_directory_ai_suggestions.applied_at ELSE NULL END,
    applied_by = CASE WHEN crm_directory_ai_suggestions.status = 'dismissed' THEN crm_directory_ai_suggestions.applied_by ELSE NULL END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =============================================================================
-- 3. RPCs de soporte para la UI
-- =============================================================================

CREATE OR REPLACE FUNCTION get_ai_suggestion_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_type JSONB;
  v_open INTEGER;
  v_applied INTEGER;
  v_dismissed INTEGER;
BEGIN
  SELECT COALESCE(jsonb_object_agg(suggestion_type, cnt), '{}'::jsonb) INTO v_by_type
  FROM (
    SELECT suggestion_type, count(*) AS cnt
    FROM crm_directory_ai_suggestions
    WHERE status = 'open' AND suggestion_type <> 'summary'
    GROUP BY suggestion_type
  ) s;

  SELECT
    count(*) FILTER (WHERE status = 'open' AND suggestion_type <> 'summary'),
    count(*) FILTER (WHERE status = 'applied'),
    count(*) FILTER (WHERE status = 'dismissed')
  INTO v_open, v_applied, v_dismissed
  FROM crm_directory_ai_suggestions;

  RETURN jsonb_build_object(
    'open_total', COALESCE(v_open, 0),
    'applied_total', COALESCE(v_applied, 0),
    'dismissed_total', COALESCE(v_dismissed, 0),
    'by_type', v_by_type
  );
END;
$$;

-- Cambia el estado de una sugerencia (applied / dismissed / open) registrando el actor.
CREATE OR REPLACE FUNCTION set_ai_suggestion_status(p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor TEXT;
BEGIN
  IF p_status NOT IN ('open', 'applied', 'dismissed') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_status;
  END IF;

  BEGIN
    v_actor := COALESCE(auth.jwt() ->> 'email', auth.uid()::text);
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  UPDATE crm_directory_ai_suggestions
  SET
    status = p_status,
    applied_at = CASE WHEN p_status = 'applied' THEN NOW() ELSE applied_at END,
    applied_by = CASE WHEN p_status = 'applied' THEN v_actor ELSE applied_by END,
    updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- =============================================================================
-- 4. Grants
-- =============================================================================

GRANT SELECT, UPDATE ON crm_directory_ai_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_directory_ai_suggestions TO service_role;

GRANT EXECUTE ON FUNCTION upsert_directory_ai_suggestion(TEXT, UUID, UUID, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT, UUID[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_ai_suggestion_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_ai_suggestion_status(UUID, TEXT) TO authenticated, service_role;
