-- ============================================================
-- SafeGuard360 — Billing & Stripe migration
-- Run this against your Supabase project via the SQL editor
-- or Supabase CLI: supabase db push
-- ============================================================

-- 1. Extend organisations table with Stripe / billing fields
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS stripe_customer_id          TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS billing_status              TEXT DEFAULT 'inactive'
                             CHECK (billing_status IN ('active','past_due','canceled','inactive','trialing')),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

-- Rename existing plan field values to match new plan keys
-- (old: starter / professional / enterprise  →  new: solo / team / operations / enterprise)
UPDATE organisations
  SET subscription_plan = CASE subscription_plan
    WHEN 'starter'      THEN 'solo'
    WHEN 'professional' THEN 'team'
    ELSE subscription_plan
  END
WHERE subscription_plan IN ('starter', 'professional');

-- Add constraint for valid plan keys (update the CHECK if you add new plans)
ALTER TABLE organisations
  DROP CONSTRAINT IF EXISTS organisations_subscription_plan_check;

ALTER TABLE organisations
  ADD CONSTRAINT organisations_subscription_plan_check
    CHECK (subscription_plan IN ('solo','team','operations','enterprise') OR subscription_plan IS NULL);

-- 2. Indexes for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer   ON organisations (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_sub        ON organisations (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_orgs_billing_status    ON organisations (billing_status);

-- 3. Usage tracking table (soft fair-use monitoring, no hard blocks)
CREATE TABLE IF NOT EXISTS usage_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      TEXT         NOT NULL,  -- 'ai_summary' | 'notification' | 'sms' | 'location_ping' | 'briefing_gen'
  quantity        INTEGER      NOT NULL DEFAULT 1,
  metadata        JSONB,
  recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org_type_date ON usage_events (org_id, event_type, recorded_at DESC);

-- RLS: only service role writes; org admins can read their own
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_org_read ON usage_events;
CREATE POLICY usage_events_org_read ON usage_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organisation_id = usage_events.org_id
        AND p.role IN ('org_admin', 'admin', 'developer')
    )
  );

-- 4. Enterprise inquiries table (contact-sales submissions)
CREATE TABLE IF NOT EXISTS enterprise_inquiries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  org         TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  size        TEXT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE enterprise_inquiries ENABLE ROW LEVEL SECURITY;
-- Only admins/developers can view; inserts handled by service role API
DROP POLICY IF EXISTS enterprise_inquiries_admin_read ON enterprise_inquiries;
CREATE POLICY enterprise_inquiries_admin_read ON enterprise_inquiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'developer')
    )
  );

-- ============================================================
-- Done — check organisations table and run app to verify.
-- ============================================================
