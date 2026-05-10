-- ============================================================
-- SafeGuard360 — Travel Policy & Signatures Migration
-- Run in Supabase → SQL Editor
-- ============================================================

-- ── 1. travel_policies: one per organisation ──────────────────

CREATE TABLE IF NOT EXISTS public.travel_policies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  company_name           text,
  emergency_number       text,
  travel_manager_name    text,
  travel_manager_email   text,
  hr_contact_name        text,
  hr_contact_email       text,
  insurance_provider     text,
  insurance_policy_num   text,
  medical_provider       text,
  max_risk_level         text DEFAULT 'High'
    CHECK (max_risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  restricted_countries   text,
  additional_requirements text,
  policy_version         text DEFAULT '1.0',
  effective_date         date DEFAULT now(),
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ── 2. policy_signatures: one per traveller per version ───────

CREATE TABLE IF NOT EXISTS public.policy_signatures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id        uuid REFERENCES public.travel_policies(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id           uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  signed_name      text NOT NULL,
  signed_at        timestamptz DEFAULT now(),
  policy_version   text,
  latitude         numeric,
  longitude        numeric,
  location_name    text,
  UNIQUE (user_id, policy_id)
);

-- ── 3. RLS: travel_policies ───────────────────────────────────

ALTER TABLE public.travel_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read their policy"   ON public.travel_policies;
DROP POLICY IF EXISTS "Org admins manage their policy"  ON public.travel_policies;
DROP POLICY IF EXISTS "Platform admins read all"        ON public.travel_policies;

CREATE POLICY "Org members read their policy"
  ON public.travel_policies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id = org_id)
  );

CREATE POLICY "Org admins manage their policy"
  ON public.travel_policies FOR ALL
  USING (
    my_profile_claim('role') IN ('org_admin', 'admin', 'developer')
    AND my_profile_claim('org_id') = org_id::text
  );

CREATE POLICY "Platform admins read all policies"
  ON public.travel_policies FOR SELECT
  USING (
    my_profile_claim('role') IN ('admin', 'developer')
  );

-- ── 4. RLS: policy_signatures ─────────────────────────────────

ALTER TABLE public.policy_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own signatures"         ON public.policy_signatures;
DROP POLICY IF EXISTS "Org admins read their org signatures" ON public.policy_signatures;

CREATE POLICY "Users manage own signatures"
  ON public.policy_signatures FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Org admins read their org signatures"
  ON public.policy_signatures FOR SELECT
  USING (
    my_profile_claim('role') IN ('org_admin', 'admin', 'developer')
    AND my_profile_claim('org_id') = org_id::text
  );
