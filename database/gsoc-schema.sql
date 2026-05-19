-- ─────────────────────────────────────────────────────────────────────────────
-- GSOC Schema
-- Global Security Operations Center tables.
-- Extends the existing platform tables — does not replace them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gsoc_projects (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','monitoring','closed','archived')),
  priority     text        NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('critical','high','medium','low')),
  country      text,
  region       text,
  org_id       uuid        REFERENCES organisations(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  due_date     timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gsoc_tasks (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid        REFERENCES gsoc_projects(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','in_progress','blocked','done')),
  priority     text        NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('critical','high','medium','low')),
  assigned_to  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  due_at       timestamptz,
  completed_at timestamptz,
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- ── Escalations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gsoc_escalations (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text        NOT NULL,
  description    text,
  severity       text        NOT NULL DEFAULT 'high'
                             CHECK (severity IN ('critical','high','medium','low')),
  status         text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','acknowledged','in_progress','resolved')),
  source_type    text        -- 'incident' | 'sos' | 'geofence' | 'manual' | 'intel'
                             CHECK (source_type IN ('incident','sos','geofence','manual','intel')),
  source_id      uuid,       -- FK to whichever table raised this
  country        text,
  location_label text,
  assigned_to    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at    timestamptz,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- ── Shift Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gsoc_shift_logs (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_start  timestamptz NOT NULL DEFAULT now(),
  shift_end    timestamptz,
  operator_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  summary      text        NOT NULL,
  open_items   text,        -- freetext list of items to hand over
  threat_level text        DEFAULT 'normal'
                           CHECK (threat_level IN ('critical','elevated','guarded','normal')),
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- ── Geofences ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofences (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text        NOT NULL,
  description  text,
  -- Simple bounding box for MVP; upgrade to PostGIS polygon later
  lat_min      numeric(10,7) NOT NULL,
  lat_max      numeric(10,7) NOT NULL,
  lng_min      numeric(11,7) NOT NULL,
  lng_max      numeric(11,7) NOT NULL,
  radius_km    numeric(8,3), -- optional circular fence radius
  center_lat   numeric(10,7),
  center_lng   numeric(11,7),
  org_id       uuid        REFERENCES organisations(id) ON DELETE CASCADE,
  project_id   uuid        REFERENCES gsoc_projects(id) ON DELETE SET NULL,
  alert_on_enter boolean   DEFAULT true,
  alert_on_exit  boolean   DEFAULT false,
  is_active    boolean     DEFAULT true,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- ── Geofence Breaches ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofence_breaches (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  geofence_id  uuid        REFERENCES geofences(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  breach_type  text        NOT NULL CHECK (breach_type IN ('enter','exit')),
  latitude     numeric(10,7),
  longitude    numeric(11,7),
  created_at   timestamptz DEFAULT now() NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gsoc_projects_status   ON gsoc_projects(status);
CREATE INDEX IF NOT EXISTS idx_gsoc_projects_org      ON gsoc_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_gsoc_tasks_project     ON gsoc_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_gsoc_tasks_status      ON gsoc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_gsoc_escalations_status ON gsoc_escalations(status);
CREATE INDEX IF NOT EXISTS idx_gsoc_escalations_sev   ON gsoc_escalations(severity);
CREATE INDEX IF NOT EXISTS idx_gsoc_shift_logs_op     ON gsoc_shift_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_geofences_org          ON geofences(org_id);
CREATE INDEX IF NOT EXISTS idx_geofence_breaches_fence ON geofence_breaches(geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_breaches_user  ON geofence_breaches(user_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE gsoc_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsoc_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsoc_escalations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsoc_shift_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_breaches ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "service_all_gsoc_projects"     ON gsoc_projects     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_gsoc_tasks"        ON gsoc_tasks        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_gsoc_escalations"  ON gsoc_escalations  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_gsoc_shift_logs"   ON gsoc_shift_logs   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_geofences"         ON geofences         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_geofence_breaches" ON geofence_breaches FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read/write based on role (enforced in app layer via profiles.role)
-- GSOC operators and admins (gsoc_operator, gsoc_admin, developer, admin) — full access
-- Other roles — no access (GSOC data not exposed to travellers or org_admins)
CREATE POLICY "gsoc_rw_projects"     ON gsoc_projects     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gsoc_rw_tasks"        ON gsoc_tasks        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gsoc_rw_escalations"  ON gsoc_escalations  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gsoc_rw_shift_logs"   ON gsoc_shift_logs   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gsoc_rw_geofences"    ON geofences         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gsoc_rw_breaches"     ON geofence_breaches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Updated_at trigger for projects ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_gsoc_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gsoc_projects_updated_at
  BEFORE UPDATE ON gsoc_projects
  FOR EACH ROW EXECUTE FUNCTION update_gsoc_projects_updated_at();
