-- ============================================================================
-- SafeGuard 360 — Security Remediation 2026-06-05
-- Fixes Critical and High findings from the RLS Security Audit.
--
-- Safe to re-run (idempotent).
-- Each section is independent and will not affect other tables.
-- ============================================================================


-- ── CRITICAL-1 & CRITICAL-2: event_correlations + live_intelligence ──────────
-- Previous state: USING(true) — all rows readable by anonymous users.
-- Fix: service_role writes only; authenticated users read only.

-- event_correlations
DROP POLICY IF EXISTS "service_rw_correlations"             ON event_correlations;
DROP POLICY IF EXISTS "auth_read_correlations"              ON event_correlations;

CREATE POLICY "event_correlations__service__write"
  ON event_correlations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "event_correlations__authenticated__select"
  ON event_correlations FOR SELECT
  TO authenticated
  USING (true);

-- live_intelligence
DROP POLICY IF EXISTS "service_rw_live_intel"               ON live_intelligence;
DROP POLICY IF EXISTS "live_intelligence__authenticated__select" ON live_intelligence;
DROP POLICY IF EXISTS "auth_read_live_intel"                ON live_intelligence;

CREATE POLICY "live_intelligence__service__write"
  ON live_intelligence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "live_intelligence__authenticated__select"
  ON live_intelligence FOR SELECT
  TO authenticated
  USING (true);


-- ── HIGH-1: feed_sources ──────────────────────────────────────────────────────
-- Previous state: USING(true) — readable by anonymous users.
-- Fix: service_role writes only; admin/developer read only.

DROP POLICY IF EXISTS "service_rw_feed_sources"             ON feed_sources;

CREATE POLICY "feed_sources__service__write"
  ON feed_sources FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "feed_sources__admin__select"
  ON feed_sources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'developer')
    )
  );


-- ── HIGH-2: facilities ────────────────────────────────────────────────────────
-- Previous state: 1000+ rows readable by anonymous users.
-- Fix: authenticated users only; service_role full access for cron writes.
-- Note: DROP all possible legacy policy names first.

DROP POLICY IF EXISTS "facilities_public_read"              ON facilities;
DROP POLICY IF EXISTS "allow_read"                          ON facilities;
DROP POLICY IF EXISTS "public_read"                         ON facilities;
DROP POLICY IF EXISTS "anyone_can_read"                     ON facilities;
DROP POLICY IF EXISTS "facilities__authenticated__select"   ON facilities;
DROP POLICY IF EXISTS "service_role_full_access"            ON facilities;

CREATE POLICY "facilities__service__all"
  ON facilities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "facilities__authenticated__select"
  ON facilities FOR SELECT
  TO authenticated
  USING (true);


-- ── CRITICAL-3: get_missed_checkins RPC ──────────────────────────────────────
-- Previous state: SECURITY DEFINER function callable by anon role.
-- Fix: revoke EXECUTE from anon and authenticated; grant only to service_role.

REVOKE EXECUTE ON FUNCTION get_missed_checkins() FROM anon;
REVOKE EXECUTE ON FUNCTION get_missed_checkins() FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_missed_checkins() TO   service_role;


-- ── Verification query ────────────────────────────────────────────────────────
-- Run this after applying to confirm policy state:
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('event_correlations','live_intelligence','feed_sources','facilities')
ORDER BY tablename, policyname;
