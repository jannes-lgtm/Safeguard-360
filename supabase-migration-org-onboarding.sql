-- ============================================================
-- SafeGuard360 — Organisation Onboarding Extra Columns
-- Run in Supabase → SQL Editor
-- ============================================================

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS address                    text,
  ADD COLUMN IF NOT EXISTS emergency_number           text,
  ADD COLUMN IF NOT EXISTS security_contact           text,
  ADD COLUMN IF NOT EXISTS security_email             text,
  ADD COLUMN IF NOT EXISTS security_phone             text,
  ADD COLUMN IF NOT EXISTS org_onboarding_completed_at timestamptz;
