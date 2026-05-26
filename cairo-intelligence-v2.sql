-- ═══════════════════════════════════════════════════════════════════════════
-- CAIRO Intelligence Pipeline v2 — Full migration
-- Run in Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. pgvector extension (already available in Supabase) ────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. Core tracking columns on cairo_knowledge ──────────────────────────────
ALTER TABLE cairo_knowledge
  ADD COLUMN IF NOT EXISTS is_active           boolean   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS intelligence_enabled boolean   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS retrieval_ready     boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ingestion_status    text               DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS processing_stage    text,
  ADD COLUMN IF NOT EXISTS last_error          text,
  ADD COLUMN IF NOT EXISTS parsed_text_length  integer            DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_status    text               DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS indexed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS embedding           vector(1024);   -- Voyage voyage-3-lite

-- ── 3. Activate all existing records that have real content ──────────────────
UPDATE cairo_knowledge
SET
  is_active            = true,
  intelligence_enabled = true,
  retrieval_ready      = true,
  ingestion_status     = 'active',
  embedding_status     = CASE WHEN embedding IS NOT NULL THEN 'done' ELSE 'pending' END,
  parsed_text_length   = COALESCE(length(content), 0),
  indexed_at           = COALESCE(indexed_at, updated_at, created_at)
WHERE content IS NOT NULL
  AND length(content) > 20;

-- ── 4. Vector similarity search function ────────────────────────────────────
CREATE OR REPLACE FUNCTION match_cairo_knowledge(
  query_embedding vector(1024),
  match_threshold float  DEFAULT 0.45,
  match_count     int    DEFAULT 10
)
RETURNS TABLE (
  id                uuid,
  title             text,
  content           text,
  summary           text,
  type              text,
  countries         text[],
  regions           text[],
  tags              text[],
  threat_categories text[],
  doc_tier          text,
  similarity        float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, title, content, summary, type,
    countries, regions, tags, threat_categories, doc_tier,
    1 - (embedding <=> query_embedding) AS similarity
  FROM cairo_knowledge
  WHERE retrieval_ready      = true
    AND intelligence_enabled = true
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 5. Index for fast vector search (run after data has embeddings) ──────────
-- Uncomment once you have > 100 rows with embeddings:
-- CREATE INDEX IF NOT EXISTS cairo_knowledge_embedding_idx
--   ON cairo_knowledge USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 50);

-- ── 6. Index for status queries ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cairo_knowledge_retrieval_idx
  ON cairo_knowledge (retrieval_ready, intelligence_enabled)
  WHERE retrieval_ready = true AND intelligence_enabled = true;

-- ── 7. Ingestion audit log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cairo_ingestion_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id uuid        REFERENCES cairo_knowledge(id) ON DELETE CASCADE,
  event        text        NOT NULL,   -- 'uploaded','parsing','embedding','indexed','verified','failed'
  detail       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 8. Verify the migration ───────────────────────────────────────────────────
SELECT
  COUNT(*)                                          AS total_docs,
  COUNT(*) FILTER (WHERE retrieval_ready = true)    AS retrieval_ready,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL)     AS has_embedding,
  COUNT(*) FILTER (WHERE is_active = true)          AS is_active
FROM cairo_knowledge;
