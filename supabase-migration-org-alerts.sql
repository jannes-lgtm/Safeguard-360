-- ── org_alerts ────────────────────────────────────────────────────────────────
-- In-app alert records for organisations, written by the FCDO advisory cron
-- when a country's advisory level changes and the org has active travellers there.
--
-- Referenced by: api/_fcdoAlert.js (INSERT only, service role)
-- Future use:    org_admin notification inbox UI
--
-- Safe to apply: additive only, no existing rows, no existing policies.

CREATE TABLE IF NOT EXISTS public.org_alerts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  type        text        NOT NULL,                          -- e.g. 'fcdo_advisory_change'
  severity    text        CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
  title       text        NOT NULL,
  body        text,
  country     text,
  is_read     boolean     NOT NULL DEFAULT false,
  read_at     timestamptz,
  read_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_alerts_org_id_idx     ON public.org_alerts (org_id);
CREATE INDEX IF NOT EXISTS org_alerts_is_read_idx    ON public.org_alerts (org_id, is_read);
CREATE INDEX IF NOT EXISTS org_alerts_created_at_idx ON public.org_alerts (created_at DESC);

ALTER TABLE public.org_alerts ENABLE ROW LEVEL SECURITY;

-- Org admins, admins, and developers can read alerts for their own org
CREATE POLICY "org_alerts__org_admin__select"
  ON public.org_alerts FOR SELECT
  USING (
    org_id = (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin', 'admin', 'developer')
      LIMIT 1
    )
  );

-- Org admins can mark their own org's alerts as read
CREATE POLICY "org_alerts__org_admin__update"
  ON public.org_alerts FOR UPDATE
  USING (
    org_id = (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'org_admin'
      LIMIT 1
    )
  )
  WITH CHECK (
    org_id = (
      SELECT org_id FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'org_admin'
      LIMIT 1
    )
  );

-- Platform admin and developer can see and manage all org alerts
CREATE POLICY "org_alerts__admin__all"
  ON public.org_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'developer')
    )
  );

-- Inserts are service-role only (cron writes these, service role bypasses RLS)
