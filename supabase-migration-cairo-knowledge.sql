-- ============================================================================
-- supabase-migration-cairo-knowledge.sql
-- CAIRO Knowledge Base — Base Table Creation
--
-- Run this BEFORE cairo-intelligence-v2.sql, cairo-embeddings-v3.sql,
-- cairo-analyst-controls.sql, and cairo-phase4-migration.sql.
--
-- Context: cairo_knowledge was created directly in production Supabase and
-- never had a corresponding migration file. This file reconstructs the full
-- final table schema so staging environments can be provisioned correctly.
--
-- All subsequent CAIRO migration files use ADD COLUMN IF NOT EXISTS, so they
-- remain idempotent regardless of whether this file is run first.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS).
-- ============================================================================

-- ── 0. Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. cairo_knowledge ────────────────────────────────────────────────────────
-- Core intelligence document store.
-- Populated via api/cairo-upload.js (admin upload) and api/backfill-embeddings.js.
-- Read by api/cairo-context.js and api/journey-agent.js via match_cairo_knowledge().

CREATE TABLE IF NOT EXISTS public.cairo_knowledge (
  -- Identity
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core document fields
  title                 text          NOT NULL,
  type                  text          NOT NULL DEFAULT 'sop'
                          CHECK (type IN ('sop', 'case', 'report')),
  content               text,
  summary               text,
  source_file           text,

  -- Geographic and categorical metadata
  countries             text[],
  regions               text[],
  threat_categories     text[],
  tags                  text[],

  -- Tier classification (global | regional | local | org)
  doc_tier              text          NOT NULL DEFAULT 'global',

  -- Ownership
  org_id                uuid          REFERENCES public.organisations(id) ON DELETE SET NULL,
  created_by            uuid          REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Ingestion pipeline status
  is_active             boolean       NOT NULL DEFAULT true,
  intelligence_enabled  boolean       NOT NULL DEFAULT false,
  retrieval_ready       boolean       NOT NULL DEFAULT false,
  ingestion_status      text          NOT NULL DEFAULT 'pending',
  processing_stage      text,
  last_error            text,
  parsed_text_length    integer       DEFAULT 0,

  -- Embedding
  embedding             vector(1024),
  embedding_status      text          NOT NULL DEFAULT 'pending',
  indexed_at            timestamptz,
  verified_at           timestamptz,

  -- Analyst controls (added by cairo-analyst-controls.sql — included here for completeness)
  is_suppressed         boolean       NOT NULL DEFAULT false,
  analyst_confidence    float         NOT NULL DEFAULT 1.0
                          CHECK (analyst_confidence >= 0.0 AND analyst_confidence <= 1.0),
  analyst_verified      boolean       NOT NULL DEFAULT false,
  analyst_notes         text,
  analyst_verified_by   uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  analyst_verified_at   timestamptz,
  priority_elevated     boolean       NOT NULL DEFAULT false,
  threat_override       text,

  -- Timestamps
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_retrieval
  ON public.cairo_knowledge (retrieval_ready, intelligence_enabled)
  WHERE retrieval_ready = true AND intelligence_enabled = true;

CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_unverified
  ON public.cairo_knowledge (analyst_verified, created_at DESC)
  WHERE analyst_verified = false AND intelligence_enabled = true;

CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_suppressed
  ON public.cairo_knowledge (is_suppressed)
  WHERE is_suppressed = true;

CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_org
  ON public.cairo_knowledge (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_type
  ON public.cairo_knowledge (type, is_active);

-- ── 3. HNSW vector index ──────────────────────────────────────────────────────
-- Created after embeddings are backfilled. Uncomment once > 100 rows exist
-- with embeddings; the index creation is slow on large tables.
-- CREATE INDEX IF NOT EXISTS idx_cairo_knowledge_embedding_hnsw
--   ON public.cairo_knowledge USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);

-- ── 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.cairo_knowledge ENABLE ROW LEVEL SECURITY;

-- Service role: full access (Vercel API functions use service role key)
CREATE POLICY IF NOT EXISTS "service_role_full_cairo_knowledge"
  ON public.cairo_knowledge
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read-only access to active, enabled documents
CREATE POLICY IF NOT EXISTS "auth_read_cairo_knowledge"
  ON public.cairo_knowledge
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND intelligence_enabled = true
    AND is_suppressed = false
  );

-- ── 5. Updated-at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_cairo_knowledge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cairo_knowledge_updated_at ON public.cairo_knowledge;
CREATE TRIGGER trg_cairo_knowledge_updated_at
  BEFORE UPDATE ON public.cairo_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_cairo_knowledge_updated_at();

-- ── 6. Verify ─────────────────────────────────────────────────────────────────
SELECT
  'cairo_knowledge created' AS status,
  COUNT(*) AS row_count
FROM public.cairo_knowledge;
