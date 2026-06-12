-- Seguimiento del progreso del análisis con IA sobre los issues del directorio.
-- Permite recorrer TODA la tabla por lotes (cientos/miles) sin re-analizar lo ya visto:
-- la Edge Function directory-ai-analyze marca ai_analyzed_at al procesar cada issue
-- y consulta los pendientes (status='open' AND ai_analyzed_at IS NULL) en la siguiente pasada.

ALTER TABLE crm_directory_issues
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

-- Índice para localizar rápidamente los issues abiertos pendientes de análisis IA.
CREATE INDEX IF NOT EXISTS idx_directory_issues_ai_pending
  ON crm_directory_issues (status, ai_analyzed_at);
