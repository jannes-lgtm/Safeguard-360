-- ── Geocoding upgrade migration ───────────────────────────────────────────────
--
-- Adds city_lat and city_lon to live_intelligence so events carry their own
-- coordinates from ingest. The proximity scoring engine uses these directly
-- instead of the static CITY_COORDS lookup table in route-lookup.js.
--
-- Run once in Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS guards.
--
-- After running this, deploy the updated api/_geocoder.js, api/ingest-feeds.js,
-- and api/route-lookup.js. New events will be geocoded at ingest automatically.
-- Existing events without coordinates continue to score via CITY_COORDS fallback.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE live_intelligence
  ADD COLUMN IF NOT EXISTS city_lat float,
  ADD COLUMN IF NOT EXISTS city_lon float;

-- Index for any future spatial filtering queries on the intelligence table
CREATE INDEX IF NOT EXISTS idx_live_intel_city_geo
  ON live_intelligence (city_lat, city_lon)
  WHERE city_lat IS NOT NULL;

-- Verify
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'live_intelligence'
  AND column_name IN ('city', 'city_lat', 'city_lon')
ORDER BY column_name;
