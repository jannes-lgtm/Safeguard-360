-- ============================================================================
-- supabase-migration-api-cache.sql
-- API Response Cache Table
--
-- Used by: api/_dbCache.js (all cached API responses)
-- Also referenced by: api/_fcdoAlert.js, api/country-risk.js,
--                     api/weather-alerts.js, api/acled.js
--
-- Context: api_cache was created directly in production Supabase. This file
-- reconstructs the schema so staging environments can be provisioned correctly.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS).
-- ============================================================================

-- ── 1. api_cache ──────────────────────────────────────────────────────────────
-- Generic key-value cache with TTL expiry.
-- Key format: "<endpoint>:<param-hash>" e.g. "country-risk:NG"
-- Rows with expires_at < now() are considered stale and will be overwritten.

CREATE TABLE IF NOT EXISTS public.api_cache (
  key         text          PRIMARY KEY,
  value       jsonb         NOT NULL,
  expires_at  timestamptz   NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
-- Fast TTL check on read
CREATE INDEX IF NOT EXISTS idx_api_cache_expires
  ON public.api_cache (expires_at);

-- ── 3. Row Level Security ─────────────────────────────────────────────────────
-- api_cache is a pure server-side cache. No authenticated user ever reads it
-- directly from the frontend. Service role has full access; all other roles
-- have no access.
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_role_full_api_cache"
  ON public.api_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. Cleanup function ───────────────────────────────────────────────────────
-- Optional: call this periodically to remove stale entries.
-- api/_dbCache.js handles TTL at read time; this is for storage hygiene.
CREATE OR REPLACE FUNCTION public.purge_expired_api_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.api_cache WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
SELECT
  'api_cache created' AS status,
  COUNT(*) AS row_count
FROM public.api_cache;
