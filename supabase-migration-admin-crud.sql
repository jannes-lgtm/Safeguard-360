-- ============================================================
-- SafeGuard360 — Admin CRUD: training_modules + policies org_id
-- Run in Supabase → SQL Editor
-- ============================================================

-- ── 1. Training modules (admin-created, assignable to orgs) ──────────────────

CREATE TABLE IF NOT EXISTS public.training_modules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  duration_mins int  DEFAULT 30,
  topics       text,          -- comma-separated list
  category     text DEFAULT 'General',
  org_id       uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  required     boolean DEFAULT false,
  is_active    boolean DEFAULT true,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage training modules"   ON public.training_modules;
DROP POLICY IF EXISTS "Users read active modules"        ON public.training_modules;

CREATE POLICY "Admins manage training modules"
  ON public.training_modules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','developer'))
  );

CREATE POLICY "Users read active modules"
  ON public.training_modules FOR SELECT
  USING (
    is_active = true
    AND (
      org_id IS NULL
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND org_id = training_modules.org_id)
    )
  );

-- ── 2. Add org_id to policies table (scope policy to an org, null = global) ──

ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

-- ── 3. Make policies writable by admins ──────────────────────────────────────

DROP POLICY IF EXISTS "Admins manage policies" ON public.policies;

CREATE POLICY "Admins manage policies"
  ON public.policies FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','developer'))
  );
