-- ══════════════════════════════════════════════════════════════════════════════
-- Projects Workspace Schema
-- Operational containers linking personnel, assets, incidents, tasks and intel.
-- Reuses existing platform tables (incidents, staff_locations, profiles, orgs).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Extend role check constraint to include new project roles ───────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin', 'org_admin', 'traveller', 'solo', 'developer',
    'gsoc_operator', 'gsoc_admin',
    'project_manager', 'project_operator'
  ));

-- ── 1. Projects ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text,                          -- short project code e.g. "OPS-001"
  client_name   text,
  client_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  type          text DEFAULT 'security'        -- security | escort | training | assessment | logistics | other
    CHECK (type IN ('security','escort','training','assessment','logistics','other')),
  status        text DEFAULT 'planning'
    CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  priority      text DEFAULT 'medium'
    CHECK (priority IN ('critical','high','medium','low')),
  country       text,
  region        text,
  location      text,                          -- free text specific location
  start_date    date,
  end_date      date,
  budget        numeric(12,2),
  currency      text DEFAULT 'USD',
  description   text,
  briefing_notes text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  manager_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ── 2. Project members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role  text DEFAULT 'operator'
    CHECK (member_role IN ('manager','operator','traveller','observer')),
  joined_at    timestamptz DEFAULT now(),
  added_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (project_id, user_id)
);

-- ── 3. Project tasks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  status       text DEFAULT 'open'
    CHECK (status IN ('open','in_progress','blocked','done')),
  priority     text DEFAULT 'medium'
    CHECK (priority IN ('critical','high','medium','low')),
  assigned_to  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_date     date,
  completed_at timestamptz,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── 4. Project incidents (junction to existing incidents table) ───────────────
CREATE TABLE IF NOT EXISTS project_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  linked_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  linked_at   timestamptz DEFAULT now(),
  notes       text,
  UNIQUE (project_id, incident_id)
);

-- ── 5. Project operational notes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  content     text NOT NULL,
  is_pinned   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── 6. Project shift logs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_shift_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operator_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  shift_start  timestamptz NOT NULL DEFAULT now(),
  shift_end    timestamptz,
  summary      text NOT NULL,
  open_items   text,
  threat_level text DEFAULT 'normal'
    CHECK (threat_level IN ('critical','elevated','guarded','normal')),
  created_at   timestamptz DEFAULT now()
);

-- ── 7. Project expenses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  logged_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount      numeric(10,2) NOT NULL,
  currency    text DEFAULT 'USD',
  category    text DEFAULT 'operational'
    CHECK (category IN ('operational','transport','accommodation','equipment','personnel','comms','other')),
  description text NOT NULL,
  receipt_url text,
  expense_date date DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);

-- ── 8. Project files ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  file_type   text,
  file_size   bigint,
  created_at  timestamptz DEFAULT now()
);

-- ── 9. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS projects_updated_at      ON projects;
DROP TRIGGER IF EXISTS project_tasks_updated_at ON project_tasks;
DROP TRIGGER IF EXISTS project_notes_updated_at ON project_notes;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER project_tasks_updated_at
  BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER project_notes_updated_at
  BEFORE UPDATE ON project_notes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 10. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_shift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files     ENABLE ROW LEVEL SECURITY;

-- Helper: is the user a member of (or manager of) a project?
CREATE OR REPLACE FUNCTION is_project_member(pid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members WHERE project_id = pid AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM projects WHERE id = pid AND (created_by = auth.uid() OR manager_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','developer','gsoc_admin')
  );
$$;

-- projects: members + admin can read; managers + admin can write
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (is_project_member(id));
CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin','developer','gsoc_admin','project_manager'))
  );
CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (
    manager_id = auth.uid() OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','developer'))
  );
CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','developer')));

-- All child tables: member read, member/manager write
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['project_members','project_tasks','project_incidents',
    'project_notes','project_shift_logs','project_expenses','project_files']
  LOOP
    EXECUTE format('
      CREATE POLICY %I ON %I FOR SELECT
        USING (is_project_member(project_id));
      CREATE POLICY %I ON %I FOR INSERT
        WITH CHECK (is_project_member(project_id));
      CREATE POLICY %I ON %I FOR UPDATE
        USING (is_project_member(project_id));
      CREATE POLICY %I ON %I FOR DELETE
        USING (is_project_member(project_id));
    ',
      tbl||'_sel', tbl,
      tbl||'_ins', tbl,
      tbl||'_upd', tbl,
      tbl||'_del', tbl
    );
  END LOOP;
END;
$$;

-- service_role full access on all project tables
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['projects','project_members','project_tasks',
    'project_incidents','project_notes','project_shift_logs','project_expenses','project_files']
  LOOP
    EXECUTE format('CREATE POLICY %I ON %I TO service_role USING (true) WITH CHECK (true);',
      tbl||'_svc', tbl);
  END LOOP;
END;
$$;
