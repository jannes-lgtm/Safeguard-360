-- ============================================================
-- CAIRO Solo Traveler RLS Patch
-- SafeGuard360 — Run in Supabase SQL Editor
-- ============================================================
-- PROBLEM: database/rls-policies.sql declares itself the canonical
-- RLS file but is missing policies for 4 solo-critical tables:
--   - staff_locations
--   - sos_events
--   - emergency_contacts
--   - policy_signatures
--
-- If rls-policies.sql was run last (it drops all policies first),
-- these tables have RLS ENABLED but NO POLICIES, meaning ALL
-- operations for all users are silently denied.
--
-- This patch ensures all 4 tables have correct policies.
-- Safe to run multiple times (DROP IF EXISTS before each CREATE).
-- ============================================================


-- ── emergency_contacts ────────────────────────────────────────

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_contacts" ON public.emergency_contacts;
DROP POLICY IF EXISTS "admin_all_contacts" ON public.emergency_contacts;

CREATE POLICY "users_own_contacts" ON public.emergency_contacts FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "admin_all_contacts" ON public.emergency_contacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer', 'org_admin')
  ));


-- ── sos_events ────────────────────────────────────────────────

ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_sos"    ON public.sos_events;
DROP POLICY IF EXISTS "admin_all_sos"    ON public.sos_events;
DROP POLICY IF EXISTS "org_admin_view"   ON public.sos_events;
DROP POLICY IF EXISTS "org_admin_update" ON public.sos_events;

CREATE POLICY "users_own_sos" ON public.sos_events FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "admin_all_sos" ON public.sos_events FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer')
  ));

CREATE POLICY "org_admin_view" ON public.sos_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles actor
    JOIN public.profiles traveller ON traveller.id = sos_events.user_id
    WHERE actor.id = auth.uid()
      AND actor.role = 'org_admin'
      AND actor.org_id = traveller.org_id
  ));

CREATE POLICY "org_admin_update" ON public.sos_events FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles actor
    JOIN public.profiles traveller ON traveller.id = sos_events.user_id
    WHERE actor.id = auth.uid()
      AND actor.role = 'org_admin'
      AND actor.org_id = traveller.org_id
  ));


-- ── staff_locations ───────────────────────────────────────────

ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_locations" ON public.staff_locations;
DROP POLICY IF EXISTS "admin_all_locations" ON public.staff_locations;

CREATE POLICY "users_own_locations" ON public.staff_locations FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "admin_all_locations" ON public.staff_locations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer', 'org_admin')
  ));


-- ── policy_signatures ────────────────────────────────────────

ALTER TABLE public.policy_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own signatures"          ON public.policy_signatures;
DROP POLICY IF EXISTS "Org admins read their org signatures" ON public.policy_signatures;

CREATE POLICY "Users manage own signatures" ON public.policy_signatures FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Org admins read their org signatures" ON public.policy_signatures FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('org_admin', 'admin', 'developer')
      AND (p.org_id = policy_signatures.org_id OR p.role IN ('admin', 'developer'))
  ));


-- ── Verify ────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('staff_locations', 'sos_events', 'emergency_contacts', 'policy_signatures')
ORDER BY tablename, policyname;
