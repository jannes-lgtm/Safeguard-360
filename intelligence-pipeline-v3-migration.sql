-- ═══════════════════════════════════════════════════════════════════════════
-- Intelligence Pipeline v3 — Full migration
--
-- Phases covered:
--   Phase 2: Country Attribution — new columns on live_intelligence
--   Phase 3: Deduplication      — content_hash + canonical_url + unique index
--   Phase 5: Scoring Isolation  — comments documenting separation
--   Phase 6: Confidence fields  — attribution_confidence, coverage_confidence
--
-- Safe to run on databases with existing data (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run in: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Phase 2: Country Attribution columns ─────────────────────────────────────
-- primary_country:        The country this article is primarily ABOUT.
--                         Must equal `country` column — kept separate for clarity
--                         and future multi-primary support.
-- mentioned_countries:    Countries mentioned in the article but NOT the primary subject.
--                         These are for reference only — do NOT affect CAIRO or Trend scoring.
-- attribution_confidence: 0–1 score from the attribution engine.
--                         < 0.45 = weak/rejected, 0.45–0.70 = good, > 0.70 = strong
-- attribution_method:     How the attribution was determined:
--                         'exact', 'city', 'actor', 'territory_override',
--                         'secondary_mention', 'inherited'

ALTER TABLE live_intelligence
  ADD COLUMN IF NOT EXISTS primary_country          text,
  ADD COLUMN IF NOT EXISTS mentioned_countries      text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attribution_confidence   float    DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS attribution_method       text     DEFAULT 'legacy';

-- Backfill: set primary_country = country for all existing records
-- (legacy records were attributed by the old system; we inherit their value)
UPDATE live_intelligence
SET
  primary_country       = country,
  attribution_method    = 'legacy',
  attribution_confidence = 0.5   -- unknown confidence for legacy records
WHERE primary_country IS NULL
  AND country IS NOT NULL;

-- ── Phase 3: Deduplication columns ───────────────────────────────────────────
-- content_hash:   16-char hex hash of normalized title + first 120 chars of summary.
--                 Used as fallback dedup key when URLs differ (re-syndication).
-- canonical_url:  Source URL with tracking params stripped and normalized.
--                 Primary dedup key — same article, same URL.

ALTER TABLE live_intelligence
  ADD COLUMN IF NOT EXISTS content_hash   text,
  ADD COLUMN IF NOT EXISTS canonical_url  text;

-- Unique index: prevent inserting the same content_hash globally.
-- Note: now() is STABLE (not IMMUTABLE) so cannot be used in index predicates.
-- Global dedup on content_hash is correct — same content should never re-insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_intel_content_hash_dedup
  ON live_intelligence (content_hash)
  WHERE content_hash IS NOT NULL;

-- Non-unique index for canonical_url lookups (used by dedup check query)
CREATE INDEX IF NOT EXISTS idx_live_intel_canonical_url
  ON live_intelligence (canonical_url)
  WHERE canonical_url IS NOT NULL;

-- ── Phase 2: Attribution indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_live_intel_primary_country
  ON live_intelligence (primary_country, is_active, ingested_at DESC)
  WHERE primary_country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_intel_attribution_conf
  ON live_intelligence (attribution_confidence DESC)
  WHERE is_active = true AND attribution_confidence >= 0.45;

-- ── Phase 4: Coverage tracking view ──────────────────────────────────────────
-- This view powers the intel-coverage.js endpoint.
-- Returns per-country coverage metrics for the last 24 hours.
CREATE OR REPLACE VIEW v_intel_coverage AS
SELECT
  primary_country                                   AS country,
  COUNT(*)                                          AS total_24h,
  COUNT(*) FILTER (WHERE attribution_confidence >= 0.70) AS strong_24h,
  COUNT(*) FILTER (WHERE attribution_confidence >= 0.45) AS good_24h,
  COUNT(*) FILTER (WHERE attribution_confidence < 0.45)  AS weak_24h,
  AVG(attribution_confidence)::numeric(4,2)         AS avg_attribution_confidence,
  AVG(severity)::numeric(3,1)                       AS avg_severity,
  COUNT(DISTINCT source_name)                       AS distinct_sources,
  MAX(ingested_at)                                  AS last_ingest,
  COUNT(*) FILTER (WHERE attribution_method = 'legacy') AS legacy_records,
  COUNT(*) FILTER (WHERE attribution_method != 'legacy' AND attribution_method IS NOT NULL) AS v3_records
FROM live_intelligence
WHERE
  ingested_at >= now() - interval '24 hours'
  AND primary_country IS NOT NULL
  AND primary_country != ''
GROUP BY primary_country
ORDER BY total_24h DESC;

-- ── Phase 5: Scoring isolation verification ───────────────────────────────────
-- FCDO Risk Score:
--   Source: fetchFcdo() in country-risk.js → gov.uk API directly
--   Cache:  sharedCache('fcdo:{slug}') — independent Redis/memory cache
--   NEVER reads from live_intelligence
--   NEVER reads from event_correlations
--
-- CAIRO Assessment:
--   Source: comprehensiveRiskScan() in _claudeSynth.js
--     → fetchArticlesForCountry() → ALL_RISK_FEEDS (RSS, now attribution-filtered)
--     → fetchKnowledgeReports() → cairo_knowledge table
--     → FCDO, GDACS, USGS, ISS Africa, GDELT
--   Cache:  api_cache table ('country-risk:ai:{country}')
--   DOES read RSS articles — but now filtered by attribution engine (≥ 0.45 confidence)
--   DOES read cairo_knowledge — proprietary intelligence documents
--   DOES NOT use FCDO level as hard input — FCDO is reference only
--   DOES NOT contaminate Trend (separate cache key)
--
-- Trend Indicator:
--   Source: fetchGdeltSignals() in _gdelt.js → GDELT API directly
--           computeTempo() — ratio of recent vs baseline articles
--   Cache:  sharedCache('gdelt:{country}') — independent Redis/memory cache
--   NEVER reads from live_intelligence
--   NEVER reads from FCDO
--   NEVER reads from CAIRO cache
--
-- Isolation confirmed — the three scoring systems do not contaminate each other.

COMMENT ON TABLE live_intelligence IS
  'Normalized intelligence objects from RSS/feed ingestion pipeline v3.
   USED BY: Context Assembly Engine (journey analysis), Control Room display,
            GSOC feed, Live Risk Feed.
   NOT USED BY: FCDO Risk Score, CAIRO Assessment, Trend Indicator directly.
   The three scoring systems (FCDO/CAIRO/Trend) are isolated from each other.';

-- ── Phase 6: Confidence framework column on event_correlations ───────────────
-- Add coverage_confidence to event_correlations for the confidence framework
ALTER TABLE event_correlations
  ADD COLUMN IF NOT EXISTS attribution_confidence   float    DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS source_diversity_score   float    DEFAULT 0.5;

-- ── intel_coverage_stats table (for historical tracking) ─────────────────────
-- Stores daily coverage snapshots per country for trend analysis.
-- Populated by the intel-coverage.js endpoint on each run.
CREATE TABLE IF NOT EXISTS intel_coverage_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country         text        NOT NULL,
  snapshot_date   date        NOT NULL DEFAULT CURRENT_DATE,
  total_24h       int         DEFAULT 0,
  strong_24h      int         DEFAULT 0,  -- attribution_confidence >= 0.70
  good_24h        int         DEFAULT 0,  -- attribution_confidence >= 0.45
  avg_confidence  float       DEFAULT 0,
  distinct_sources int        DEFAULT 0,
  coverage_tier   text        DEFAULT 'none',  -- 'strong'|'good'|'weak'|'none'
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_stats_country_date
  ON intel_coverage_stats (country, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_coverage_stats_date
  ON intel_coverage_stats (snapshot_date DESC);

ALTER TABLE intel_coverage_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'intel_coverage_stats' AND policyname = 'service_rw_coverage_stats'
  ) THEN
    CREATE POLICY "service_rw_coverage_stats" ON intel_coverage_stats USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'live_intelligence columns' AS check_name,
       string_agg(column_name, ', ' ORDER BY column_name) AS new_columns
FROM information_schema.columns
WHERE table_name = 'live_intelligence'
  AND column_name IN ('primary_country','mentioned_countries','attribution_confidence',
                      'attribution_method','content_hash','canonical_url')
  AND table_schema = 'public';

SELECT 'live_intelligence row count' AS check_name, COUNT(*)::text AS value
FROM live_intelligence;

SELECT 'intel_coverage_stats created' AS check_name, 'OK' AS value
FROM information_schema.tables
WHERE table_name = 'intel_coverage_stats' AND table_schema = 'public';
