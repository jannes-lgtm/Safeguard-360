-- ============================================================
-- SafeGuard360 — Traveller Onboarding Profile Fields
-- Run in Supabase → SQL Editor
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS date_of_birth      date,
  ADD COLUMN IF NOT EXISTS nationality        text,
  ADD COLUMN IF NOT EXISTS passport_number    text,
  ADD COLUMN IF NOT EXISTS passport_expiry    date,
  ADD COLUMN IF NOT EXISTS blood_type         text,
  ADD COLUMN IF NOT EXISTS allergies          text,
  ADD COLUMN IF NOT EXISTS medications        text,
  ADD COLUMN IF NOT EXISTS kin_name           text,
  ADD COLUMN IF NOT EXISTS kin_relationship   text,
  ADD COLUMN IF NOT EXISTS kin_phone          text,
  ADD COLUMN IF NOT EXISTS kin_email          text,
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS insurance_policy   text,
  ADD COLUMN IF NOT EXISTS medical_aid        text,
  ADD COLUMN IF NOT EXISTS medical_aid_num    text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
