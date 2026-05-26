-- ============================================================================
-- cairo-embeddings-v3.sql
-- CAIRO Intelligence Pipeline — Embedding Architecture v3
--
-- Run this in Supabase SQL Editor ONCE.
-- Safe to re-run (all operations are idempotent).
--
-- What this migration does:
--   1. Fixes cairo_knowledge.embedding column: vector(512) → vector(1024)
--   2. Creates document_chunks table (chunked document storage)
--   3. Creates document_embeddings table (dedicated vector store)
--   4. Creates cairo_dead_letter table (failed ingestion queue)
--   5. Enhances cairo_ingestion_log with telemetry columns
--   6. Recreates match_cairo_knowledge() for vector(1024)
--   7. Adds check_embedding_column_dims() for migration safety
--   8. Creates HNSW index for fast similarity search
-- ============================================================================

-- ── 0. Enable required extensions ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Fix cairo_knowledge.embedding column dimension ────────────────────────
-- Drop any existing index that would block the column type change
DROP INDEX IF EXISTS cairo_knowledge_embedding_idx;
DROP INDEX IF EXISTS idx_cairo_knowledge_embedding;

-- Change column to correct dimension (safe since all values are NULL)
ALTER TABLE cairo_knowledge DROP COLUMN IF EXISTS embedding;
ALTER TABLE cairo_knowledge ADD COLUMN embedding vector(1024);

-- Ensure all required status columns exist
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS is_active            boolean      NOT NULL DEFAULT true;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS intelligence_enabled boolean      NOT NULL DEFAULT false;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS retrieval_ready      boolean      NOT NULL DEFAULT false;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS ingestion_status     text         NOT NULL DEFAULT 'pending';
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS embedding_status     text         NOT NULL DEFAULT 'pending';
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS parsed_text_length   int;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS doc_tier             text         NOT NULL DEFAULT 'global';
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS indexed_at           timestamptz;
ALTER TABLE cairo_knowledge ADD COLUMN IF NOT EXISTS verified_at          timestamptz;

-- Activate all existing docs with real content
UPDATE cairo_knowledge
SET
  is_active            = true,
  intelligence_enabled = true,
  retrieval_ready      = false,   -- false until embeddings are backfilled
  ingestion_status     = 'pending'
WHERE content IS NOT NULL AND length(content) > 20
  AND is_active = false;

-- ── 2. Create document_chunks table ──────────────────────────────────────────
-- Stores individual text chunks from documents (for future chunked retrieval)
CREATE TABLE IF NOT EXISTS document_chunks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid        NOT NULL REFERENCES cairo_knowledge(id) ON DELETE CASCADE,
  chunk_index   int         NOT NULL DEFAULT 0,
  chunk_text    text        NOT NULL,
  chunk_length  int         GENERATED ALWAYS AS (length(chunk_text)) STORED,
  metadata      jsonb       DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

-- ── 3. Create document_embeddings table ──────────────────────────────────────
-- Dedicated vector storage — separate from document content
CREATE TABLE IF NOT EXISTS document_embeddings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid        NOT NULL REFERENCES cairo_knowledge(id) ON DELETE CASCADE,
  chunk_id         uuid        REFERENCES document_chunks(id) ON DELETE SET NULL,
  chunk_index      int         NOT NULL DEFAULT 0,
  embedding        vector(1024) NOT NULL,
  embedding_model  text        NOT NULL DEFAULT 'voyage-3-lite',
  embedding_dims   int         NOT NULL DEFAULT 1024,
  provider         text        NOT NULL DEFAULT 'voyageai',
  retrieval_score  float,      -- optional: cached relevance score
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);

-- HNSW index for fast approximate nearest-neighbor search on the new table
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw
  ON document_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 4. Create cairo_dead_letter table ────────────────────────────────────────
-- No uploaded report disappears silently — all failures tracked here
CREATE TABLE IF NOT EXISTS cairo_dead_letter (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid,       -- null if failure was before insert
  document_title   text,
  storage_path     text,       -- original upload path if PDF
  failure_stage    text        NOT NULL,  -- 'storage_download'|'pdf_extraction'|'embedding'|'validate_embedding'|'db_insert'|'retrieval_verify'
  failure_reason   text        NOT NULL,
  raw_error        text,
  retry_count      int         NOT NULL DEFAULT 0,
  resolved         boolean     NOT NULL DEFAULT false,
  resolved_at      timestamptz,
  resolved_by      uuid,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cairo_dead_letter_unresolved ON cairo_dead_letter(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cairo_dead_letter_document   ON cairo_dead_letter(document_id);

-- ── 5. Enhance cairo_ingestion_log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cairo_ingestion_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id   uuid        REFERENCES cairo_knowledge(id) ON DELETE SET NULL,
  event          text        NOT NULL,
  detail         text,
  created_at     timestamptz DEFAULT now()
);

-- Add telemetry columns (safe if already exist)
ALTER TABLE cairo_ingestion_log ADD COLUMN IF NOT EXISTS embedding_model  text;
ALTER TABLE cairo_ingestion_log ADD COLUMN IF NOT EXISTS embedding_dims   int;
ALTER TABLE cairo_ingestion_log ADD COLUMN IF NOT EXISTS retrieval_ok     boolean;
ALTER TABLE cairo_ingestion_log ADD COLUMN IF NOT EXISTS processing_ms    int;

CREATE INDEX IF NOT EXISTS idx_cairo_ingestion_log_knowledge ON cairo_ingestion_log(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_cairo_ingestion_log_event     ON cairo_ingestion_log(event, created_at DESC);

-- ── 6. Recreate match_cairo_knowledge() for vector(1024) ─────────────────────
-- Primary retrieval function used by cairo-context, journey-agent, _claudeSynth
CREATE OR REPLACE FUNCTION match_cairo_knowledge(
  query_embedding  vector(1024),
  match_threshold  float   DEFAULT 0.40,
  match_count      int     DEFAULT 10
)
RETURNS TABLE (
  id               uuid,
  title            text,
  content          text,
  summary          text,
  type             text,
  countries        text[],
  regions          text[],
  threat_categories text[],
  tags             text[],
  doc_tier         text,
  org_id           uuid,
  similarity       float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.title,
    k.content,
    k.summary,
    k.type,
    k.countries,
    k.regions,
    k.threat_categories,
    k.tags,
    k.doc_tier,
    k.org_id,
    (1 - (k.embedding <=> query_embedding))::float AS similarity
  FROM cairo_knowledge k
  WHERE
    k.retrieval_ready      = true
    AND k.intelligence_enabled = true
    AND k.embedding        IS NOT NULL
    AND (1 - (k.embedding <=> query_embedding)) > match_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 7. Migration safety function ─────────────────────────────────────────────
-- Called by backfill-embeddings.js before running to detect schema drift
CREATE OR REPLACE FUNCTION check_embedding_column_dims()
RETURNS TABLE (
  table_name  text,
  column_name text,
  dims        int,
  matches_config boolean
)
LANGUAGE sql AS $$
  SELECT
    'cairo_knowledge'::text                                                AS table_name,
    'embedding'::text                                                      AS column_name,
    -- Extract dimension from type string e.g. 'vector(1024)' → 1024
    NULLIF(regexp_replace(udt_name, '[^0-9]', '', 'g'), '')::int          AS dims,
    NULLIF(regexp_replace(udt_name, '[^0-9]', '', 'g'), '')::int = 1024   AS matches_config
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'cairo_knowledge'
    AND column_name  = 'embedding';
$$;

-- ── 8. HNSW index on cairo_knowledge.embedding ───────────────────────────────
-- Used by match_cairo_knowledge() for sub-100ms vector search
CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_embedding_hnsw
  ON cairo_knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 9. RLS policies for new tables ───────────────────────────────────────────
ALTER TABLE document_chunks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cairo_dead_letter   ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_document_chunks"
  ON document_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_document_embeddings"
  ON document_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_cairo_dead_letter"
  ON cairo_dead_letter FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 10. Verification query ────────────────────────────────────────────────────
SELECT
  'cairo_knowledge'                                                                 AS table_name,
  COUNT(*)                                                                          AS total_docs,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL)                                     AS has_embedding,
  COUNT(*) FILTER (WHERE retrieval_ready = true)                                    AS retrieval_ready,
  COUNT(*) FILTER (WHERE intelligence_enabled = true)                               AS intel_enabled,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL AND retrieval_ready = true)          AS fully_active,
  (SELECT dims FROM check_embedding_column_dims() LIMIT 1)                          AS embedding_dims,
  (SELECT matches_config FROM check_embedding_column_dims() LIMIT 1)               AS dims_match_config
FROM cairo_knowledge;
