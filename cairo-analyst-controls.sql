-- ============================================================================
-- cairo-analyst-controls.sql
-- Human analyst control layer for CAIRO intelligence
--
-- Adds:
--   1. Analyst control columns to cairo_knowledge
--   2. retrieval_validation_log table
--   3. intel_health_log table
--   4. Analyst audit trigger
-- ============================================================================

-- ── 1. Analyst control columns ───────────────────────────────────────────────
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS is_suppressed        boolean   NOT NULL DEFAULT false;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS analyst_confidence    float     NOT NULL DEFAULT 1.0
  CHECK (analyst_confidence >= 0.0 AND analyst_confidence <= 1.0);
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS analyst_verified      boolean   NOT NULL DEFAULT false;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS analyst_notes         text;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS analyst_verified_by   uuid      REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS analyst_verified_at   timestamptz;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS priority_elevated     boolean   NOT NULL DEFAULT false;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS threat_override       text;     -- analyst-set threat level override

-- Index for analyst review queue
CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_unverified
  ON cairo_knowledge(analyst_verified, created_at DESC)
  WHERE analyst_verified = false AND intelligence_enabled = true;

CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_suppressed
  ON cairo_knowledge(is_suppressed)
  WHERE is_suppressed = true;

-- ── 2. Retrieval validation log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retrieval_validation_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid        REFERENCES cairo_knowledge(id) ON DELETE SET NULL,
  query_used          text,
  method              text        NOT NULL DEFAULT 'vector',   -- 'vector' | 'keyword'
  similarity_score    float,
  self_found          boolean,
  neighbors_returned  int,
  validated_at        timestamptz DEFAULT now(),
  pass                boolean     NOT NULL DEFAULT false,
  failure_reason      text
);

CREATE INDEX IF NOT EXISTS idx_retrieval_validation_doc   ON retrieval_validation_log(document_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_validation_time  ON retrieval_validation_log(validated_at DESC);

-- ── 3. Intel health log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intel_health_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  health_score    int,
  doc_count       int,
  embedded_count  int,
  vector_ok       boolean,
  keyword_ok      boolean,
  dead_letter_count int,
  errors          text[],
  recorded_at     timestamptz DEFAULT now()
);

-- ── 4. match_cairo_knowledge: honour suppression + confidence ─────────────────
-- Recreate to filter suppressed docs and weight by analyst_confidence
DROP FUNCTION IF EXISTS match_cairo_knowledge(vector, double precision, integer);
CREATE OR REPLACE FUNCTION match_cairo_knowledge(
  query_embedding  vector(512),
  match_threshold  float   DEFAULT 0.35,
  match_count      int     DEFAULT 10
)
RETURNS TABLE (
  id                uuid,
  title             text,
  content           text,
  summary           text,
  type              text,
  countries         text[],
  regions           text[],
  threat_categories text[],
  tags              text[],
  doc_tier          text,
  org_id            uuid,
  similarity        float,
  analyst_confidence float,
  analyst_verified   boolean,
  created_at         timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id, k.title, k.content, k.summary, k.type,
    k.countries, k.regions, k.threat_categories, k.tags,
    k.doc_tier, k.org_id,
    (1 - (k.embedding <=> query_embedding))::float          AS similarity,
    COALESCE(k.analyst_confidence, 1.0)                     AS analyst_confidence,
    COALESCE(k.analyst_verified, false)                     AS analyst_verified,
    k.created_at
  FROM cairo_knowledge k
  WHERE k.retrieval_ready      = true
    AND k.intelligence_enabled = true
    AND k.embedding            IS NOT NULL
    AND COALESCE(k.is_suppressed, false) = false
    AND (1 - (k.embedding <=> query_embedding)) > match_threshold
  ORDER BY
    -- Prioritise: similarity × analyst_confidence × (priority_elevated bonus)
    (1 - (k.embedding <=> query_embedding))
    * COALESCE(k.analyst_confidence, 1.0)
    * CASE WHEN COALESCE(k.priority_elevated, false) THEN 1.2 ELSE 1.0 END
    DESC
  LIMIT match_count;
END;
$$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE is_suppressed = true)                      AS suppressed,
  COUNT(*) FILTER (WHERE analyst_verified = true)                   AS verified,
  COUNT(*) FILTER (WHERE priority_elevated = true)                  AS elevated,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL)                     AS embedded,
  COUNT(*) FILTER (WHERE retrieval_ready = true)                    AS retrieval_ready
FROM cairo_knowledge;
