-- ============================================================
-- SafeGuard360 — Organisation & Invite Migration
-- Run this in Supabase → SQL Editor
-- ============================================================

-- ── 1. Add missing columns to profiles ───────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number   text,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS org_id            uuid;

-- Expand role check to include org_admin, solo, developer
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'org_admin', 'traveller', 'solo', 'developer'));

-- ── 2. Create organisations table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organisations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  industry          text,
  country           text,
  website           text,
  primary_contact   text,
  contact_email     text,
  contact_phone     text,
  subscription_plan text DEFAULT 'professional'
    CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
  max_travellers    int  DEFAULT 50,
  notes             text,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Add FK from profiles → organisations (now that the table exists)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_org_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE SET NULL;

-- ── 3. Create org_invites table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  org_name    text,
  email       text NOT NULL,
  role        text DEFAULT 'traveller'
    CHECK (role IN ('org_admin', 'traveller')),
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT (now() + INTERVAL '7 days')
);

-- ── 4. Add approval_status to itineraries ────────────────────────────────────

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS org_id uuid
    REFERENCES public.organisations(id) ON DELETE SET NULL;

-- ── 5. Update handle_new_user trigger to support org_id + role ───────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, org_id, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(new.raw_user_meta_data->>'role', 'traveller'),
    NULLIF(new.raw_user_meta_data->>'org_id', '')::uuid,
    'active'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Row-level security ─────────────────────────────────────────────────────

-- organisations
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read their org"     ON public.organisations;
DROP POLICY IF EXISTS "Authenticated can create org"        ON public.organisations;
DROP POLICY IF EXISTS "Org admins can update their org"    ON public.organisations;
DROP POLICY IF EXISTS "Platform admins read all orgs"      ON public.organisations;

CREATE POLICY "Platform admins read all orgs"
  ON public.organisations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer'))
  );

CREATE POLICY "Org members can read their org"
  ON public.organisations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id = id)
  );

CREATE POLICY "Authenticated can create org"
  ON public.organisations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Org admins can update their org"
  ON public.organisations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_id = id AND p.role IN ('org_admin', 'admin', 'developer')
    )
  );

-- org_invites
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins manage invites" ON public.org_invites;
DROP POLICY IF EXISTS "Platform admins read all invites" ON public.org_invites;

CREATE POLICY "Org admins manage invites"
  ON public.org_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_id = org_id AND p.role IN ('org_admin', 'admin', 'developer')
    )
  );

CREATE POLICY "Platform admins read all invites"
  ON public.org_invites FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer'))
  );

-- profiles — add org_admin visibility
DROP POLICY IF EXISTS "Org admins read their org profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Org admins update their org profiles" ON public.profiles;
DROP POLICY IF EXISTS "Org admins insert profiles"           ON public.profiles;

CREATE POLICY "Org admins read their org profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_id = org_id AND p.role IN ('org_admin', 'admin', 'developer')
    )
  );

CREATE POLICY "Org admins update their org profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_id = org_id AND p.role IN ('org_admin', 'admin', 'developer')
    )
  );

-- itineraries — org_admin sees their org's trips
DROP POLICY IF EXISTS "Org admins read org itineraries" ON public.itineraries;

CREATE POLICY "Org admins read org itineraries"
  ON public.itineraries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles traveller ON traveller.id = itineraries.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('org_admin', 'admin', 'developer')
        AND (me.org_id = traveller.org_id OR me.role IN ('admin', 'developer'))
    )
  );
