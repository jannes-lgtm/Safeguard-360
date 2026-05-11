-- ============================================================
-- SafeGuard360 — Visa feature migration
-- Run in Supabase → SQL Editor
-- ============================================================

-- ── 1. Add line manager columns to profiles ───────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_name  text,
  ADD COLUMN IF NOT EXISTS manager_title text,
  ADD COLUMN IF NOT EXISTS manager_email text,
  ADD COLUMN IF NOT EXISTS manager_phone text;

-- ── 2. Visa letter requests table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visa_letter_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  org_id              uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  trip_id             uuid REFERENCES public.itineraries(id) ON DELETE SET NULL,
  passport_country    text NOT NULL,
  destination_country text NOT NULL,
  travel_purpose      text NOT NULL DEFAULT 'Business',
  trip_name           text,
  depart_date         date,
  return_date         date,
  letter_text         text,
  status              text NOT NULL DEFAULT 'generated'
                        CHECK (status IN ('generated','viewed','printed')),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.visa_letter_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own visa letters"  ON public.visa_letter_requests;
DROP POLICY IF EXISTS "Org admins view org visa letters" ON public.visa_letter_requests;
DROP POLICY IF EXISTS "Admins manage all visa letters"  ON public.visa_letter_requests;

-- Travellers can create and view their own letters
CREATE POLICY "Users manage own visa letters"
  ON public.visa_letter_requests FOR ALL
  USING (user_id = auth.uid());

-- Org admins can view letters for their org
CREATE POLICY "Org admins view org visa letters"
  ON public.visa_letter_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin','admin','developer')
        AND org_id = visa_letter_requests.org_id
    )
  );

-- Platform admins can manage all
CREATE POLICY "Admins manage all visa letters"
  ON public.visa_letter_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','developer'))
  );
