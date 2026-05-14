-- ============================================================
-- CAIRO Phase 4 — Live Intelligence Schema
-- Run in Supabase SQL Editor
-- ============================================================
-- Tables created:
--   live_intelligence    — normalized intelligence objects from feeds
--   event_correlations   — corroboration clusters from event correlator
--   feed_sources         — source registry with trust tier scores
-- ============================================================

-- ── live_intelligence ─────────────────────────────────────────────────────────
-- Stores normalized, pre-processed intelligence objects ingested from RSS feeds.
-- Populated by api/ingest-feeds.js (hourly cron).
-- Read by api/_contextAssembly.js (per-query retrieval).

DROP TABLE IF EXISTS live_intelligence CASCADE;

CREATE TABLE live_intelligence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          text NOT NULL DEFAULT 'general_security',
  country             text,
  city                text,
  region              text,
  severity            int  CHECK (severity BETWEEN 1 AND 5) DEFAULT 2,
  confidence          float CHECK (confidence BETWEEN 0 AND 1) DEFAULT 0.5,
  source_reliability  float CHECK (source_reliability BETWEEN 0 AND 1) DEFAULT 0.5,
  source_tier         int  CHECK (source_tier BETWEEN 1 AND 4) DEFAULT 3,
  movement_impact     text DEFAULT 'minor',
  affected_routes     text[],
  raw_title           text,
  raw_summary         text,
  source_name         text,
  source_url          text,
  feed_name           text,
  event_timestamp     timestamptz DEFAULT now(),
  ingested_at         timestamptz DEFAULT now(),
  expires_at          timestamptz,
  is_active           boolean DEFAULT true,
  correlation_cluster_id uuid,
  keywords            text[],
  duplicate_of        uuid REFERENCES live_intelligence(id)
);

-- Retrieval indexes for Context Assembly Engine
CREATE INDEX idx_live_intel_country        ON live_intelligence(country, is_active, ingested_at DESC);
CREATE INDEX idx_live_intel_active_ingested ON live_intelligence(is_active, ingested_at DESC);
CREATE INDEX idx_live_intel_event_type      ON live_intelligence(event_type);
CREATE INDEX idx_live_intel_severity        ON live_intelligence(severity DESC) WHERE is_active = true;

-- ── event_correlations ────────────────────────────────────────────────────────
-- Stores corroboration clusters detected by the Event Correlation Engine.
-- Multiple intel objects reporting the same event → one correlation cluster.
-- Higher corroboration_score = more confident, multi-source event.

DROP TABLE IF EXISTS event_correlations CASCADE;

CREATE TABLE event_correlations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_name        text,
  event_type          text,
  country             text,
  city                text,
  signal_count        int DEFAULT 1,
  corroboration_score float CHECK (corroboration_score BETWEEN 0 AND 1) DEFAULT 0.5,
  severity_consensus  int  CHECK (severity_consensus BETWEEN 1 AND 5) DEFAULT 2,
  movement_impact     text DEFAULT 'minor',
  first_signal_at     timestamptz DEFAULT now(),
  latest_signal_at    timestamptz DEFAULT now(),
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_correlations_country       ON event_correlations(country, is_active);
CREATE INDEX idx_correlations_latest        ON event_correlations(latest_signal_at DESC) WHERE is_active = true;
CREATE INDEX idx_correlations_event_type    ON event_correlations(event_type, is_active);

-- ── feed_sources ──────────────────────────────────────────────────────────────
-- Registry of all intelligence feed sources with trust tier classifications.
-- Used by source weighting engine to assign reliability scores.

DROP TABLE IF EXISTS feed_sources CASCADE;

CREATE TABLE feed_sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name             text UNIQUE NOT NULL,
  source_url              text,
  source_tier             int  CHECK (source_tier BETWEEN 1 AND 4) DEFAULT 3,
  base_trust_score        float DEFAULT 0.54,
  region_coverage         text[],
  event_type_coverage     text[],
  last_fetched_at         timestamptz,
  fetch_interval_minutes  int DEFAULT 60,
  is_active               boolean DEFAULT true,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE live_intelligence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sources       ENABLE ROW LEVEL SECURITY;

-- Service role: full access (used by Vercel functions)
CREATE POLICY "service_rw_live_intel"  ON live_intelligence  USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_correlations" ON event_correlations USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_feed_sources" ON feed_sources       USING (true) WITH CHECK (true);

-- Authenticated users: read-only (CAIRO can display intel in UI if needed)
CREATE POLICY "auth_read_live_intel"    ON live_intelligence  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_correlations"  ON event_correlations FOR SELECT USING (auth.role() = 'authenticated');

-- ── Seed: Feed Sources Registry ───────────────────────────────────────────────
INSERT INTO feed_sources (source_name, source_tier, base_trust_score, region_coverage, notes) VALUES
  ('Reuters',             1, 0.90, ARRAY['global'],                                 'Tier 1 wire service — primary'),
  ('AP News',             1, 0.89, ARRAY['global'],                                 'Tier 1 wire service'),
  ('BBC News Africa',     1, 0.88, ARRAY['sub-saharan-africa','north-africa'],       'Tier 1 broadcast — Africa desk'),
  ('AFP',                 1, 0.87, ARRAY['global'],                                 'Tier 1 French wire service'),
  ('UN OCHA',             1, 0.92, ARRAY['global'],                                 'UN Office for the Coordination of Humanitarian Affairs'),
  ('ReliefWeb',           1, 0.90, ARRAY['global'],                                 'UN humanitarian information platform'),
  ('ACLED',               1, 0.91, ARRAY['africa','mena','asia'],                   'Armed Conflict Location & Event Data — gold standard'),
  ('OSAC',                1, 0.88, ARRAY['global'],                                 'Overseas Security Advisory Council — US State Dept'),
  ('FCDO Travel Advice',  1, 0.87, ARRAY['global'],                                 'UK Foreign & Commonwealth Development Office'),
  ('Al Jazeera',          2, 0.74, ARRAY['mena','africa','global'],                 'Tier 2 broadcast — strong MENA/Africa coverage'),
  ('France 24',           2, 0.72, ARRAY['africa','mena','global'],                 'Tier 2 broadcast — strong Francophone Africa'),
  ('Deutsche Welle',      2, 0.71, ARRAY['africa','global'],                        'Tier 2 broadcast — DW Africa'),
  ('Bloomberg',           2, 0.73, ARRAY['global'],                                 'Tier 2 — strong on economic/political risk'),
  ('The Guardian',        2, 0.70, ARRAY['global'],                                 'Tier 2 broadsheet'),
  ('Daily Nation',        2, 0.68, ARRAY['sub-saharan-africa'],                     'Leading Kenyan newspaper'),
  ('Premium Times',       2, 0.66, ARRAY['sub-saharan-africa'],                     'Nigerian independent investigative media'),
  ('The East African',    2, 0.67, ARRAY['sub-saharan-africa'],                     'Regional East Africa newspaper'),
  ('Business Day SA',     2, 0.67, ARRAY['sub-saharan-africa'],                     'South African business daily'),
  ('allAfrica',           3, 0.55, ARRAY['sub-saharan-africa'],                     'Tier 3 — African news aggregator'),
  ('Voice of America',    3, 0.56, ARRAY['africa','global'],                        'Tier 3 — US government broadcaster'),
  ('Radio France Intl',   3, 0.54, ARRAY['africa','global'],                        'Tier 3 — RFI Africa'),
  ('GDELT',               3, 0.50, ARRAY['global'],                                 'Tier 3 — global event database, high volume, lower precision')
ON CONFLICT (source_name) DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT 'live_intelligence' AS table_name, COUNT(*) AS rows FROM live_intelligence
UNION ALL
SELECT 'event_correlations', COUNT(*) FROM event_correlations
UNION ALL
SELECT 'feed_sources', COUNT(*) FROM feed_sources;
