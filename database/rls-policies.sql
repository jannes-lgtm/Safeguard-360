/**
 * SafeGuard360 — Master RLS Policy File
 * ─────────────────────────────────────────────────────────────────────────────
 * RULE: This is the ONLY place RLS policies are defined.
 *       Never write policies in ad-hoc SQL snippets.
 *       When you need to change a policy: edit this file, then run it in full.
 *
 * HOW TO RUN:
 *   Paste the entire file into Supabase SQL editor and execute.
 *   It is fully idempotent — safe to re-run at any time.
 *
 * ROLE MODEL:
 *   developer  — SafeGuard360 staff, sees everything across all orgs
 *   admin      — Corporate admin, scoped to their own org only
 *   traveller  — Corporate employee, sees only their own data
 *   solo       — Independent traveller, sees only their own data
 *
 * POLICY NAMING CONVENTION:
 *   {table}__{role}__{action}
 *   e.g. profiles__admin__select, itineraries__own__all
 * ─────────────────────────────────────────────────────────────────────────────
 */


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 1: SECURITY DEFINER HELPER FUNCTIONS
-- These bypass RLS to avoid infinite recursion when policies reference profiles.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function auth_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_user_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from profiles where id = auth.uid()
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 2: DROP ALL EXISTING POLICIES ON ALL TABLES
-- This prevents stale/conflicting policies from lingering.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 3: ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

alter table profiles                  enable row level security;
alter table organisations             enable row level security;
alter table itineraries               enable row level security;
alter table alerts                    enable row level security;
alter table trip_alerts               enable row level security;
alter table training_modules          enable row level security;
alter table training_records          enable row level security;
alter table staff_checkins            enable row level security;
alter table scheduled_checkins        enable row level security;
alter table trip_training_assignments enable row level security;
alter table incidents                 enable row level security;
alter table control_room_requests     enable row level security;
alter table control_room_messages     enable row level security;
alter table provider_vetting_records  enable row level security;
alter table terms_acceptances         enable row level security;
alter table policy_acknowledgements   enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── profiles ──────────────────────────────────────────────────────────────────
-- Own profile always visible and editable
create policy "profiles__own__select" on profiles
  for select using (auth.uid() = id);

create policy "profiles__own__update" on profiles
  for update using (auth.uid() = id);

-- Admin: read/update profiles in their org only (excludes solo users with no org)
create policy "profiles__admin__select" on profiles
  for select using (
    auth_user_role() = 'admin'
    and org_id is not null
    and org_id = auth_user_org_id()
  );

create policy "profiles__admin__update" on profiles
  for update using (
    auth_user_role() = 'admin'
    and org_id = auth_user_org_id()
  );

-- Developer: full access
create policy "profiles__developer__all" on profiles
  for all using (auth_user_role() = 'developer');


-- ── organisations ─────────────────────────────────────────────────────────────
-- Users see their own org
create policy "organisations__member__select" on organisations
  for select using (id = auth_user_org_id());

-- Admin: update their own org
create policy "organisations__admin__update" on organisations
  for update using (
    auth_user_role() = 'admin'
    and id = auth_user_org_id()
  );

-- Developer: full access
create policy "organisations__developer__all" on organisations
  for all using (auth_user_role() = 'developer');


-- ── itineraries ───────────────────────────────────────────────────────────────
-- Users manage their own trips
create policy "itineraries__own__all" on itineraries
  for all using (auth.uid() = user_id);

-- Admin: read and update trips in their org
create policy "itineraries__admin__select" on itineraries
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "itineraries__admin__update" on itineraries
  for update using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

-- Developer: full access
create policy "itineraries__developer__all" on itineraries
  for all using (auth_user_role() = 'developer');


-- ── alerts ────────────────────────────────────────────────────────────────────
-- All authenticated users can read active alerts (public intel)
create policy "alerts__authenticated__select" on alerts
  for select using (auth.uid() is not null);

-- Developer: full access (create, update, delete)
create policy "alerts__developer__all" on alerts
  for all using (auth_user_role() = 'developer');


-- ── trip_alerts ───────────────────────────────────────────────────────────────
create policy "trip_alerts__own__all" on trip_alerts
  for all using (auth.uid() = user_id);

create policy "trip_alerts__developer__all" on trip_alerts
  for all using (auth_user_role() = 'developer');


-- ── training_modules ─────────────────────────────────────────────────────────
-- All authenticated users can read modules
create policy "training_modules__authenticated__select" on training_modules
  for select using (auth.uid() is not null);

create policy "training_modules__developer__all" on training_modules
  for all using (auth_user_role() = 'developer');


-- ── training_records ─────────────────────────────────────────────────────────
create policy "training_records__own__all" on training_records
  for all using (auth.uid() = user_id);

create policy "training_records__admin__select" on training_records
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "training_records__developer__all" on training_records
  for all using (auth_user_role() = 'developer');


-- ── staff_checkins ───────────────────────────────────────────────────────────
create policy "staff_checkins__own__all" on staff_checkins
  for all using (auth.uid() = user_id);

create policy "staff_checkins__admin__select" on staff_checkins
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "staff_checkins__developer__all" on staff_checkins
  for all using (auth_user_role() = 'developer');


-- ── scheduled_checkins ───────────────────────────────────────────────────────
create policy "scheduled_checkins__own__all" on scheduled_checkins
  for all using (auth.uid() = user_id);

create policy "scheduled_checkins__admin__select" on scheduled_checkins
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "scheduled_checkins__developer__all" on scheduled_checkins
  for all using (auth_user_role() = 'developer');


-- ── trip_training_assignments ─────────────────────────────────────────────────
create policy "trip_training__own__all" on trip_training_assignments
  for all using (auth.uid() = user_id);

create policy "trip_training__admin__select" on trip_training_assignments
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "trip_training__developer__all" on trip_training_assignments
  for all using (auth_user_role() = 'developer');


-- ── incidents ─────────────────────────────────────────────────────────────────
create policy "incidents__own__all" on incidents
  for all using (auth.uid() = user_id);

create policy "incidents__admin__select" on incidents
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "incidents__developer__all" on incidents
  for all using (auth_user_role() = 'developer');


-- ── control_room_requests ─────────────────────────────────────────────────────
-- Travellers manage their own requests
create policy "control_room_requests__own__all" on control_room_requests
  for all using (auth.uid() = user_id);

-- Admin: read + update requests from their org
create policy "control_room_requests__admin__select" on control_room_requests
  for select using (
    auth_user_role() = 'admin'
    and org_id = auth_user_org_id()
  );

create policy "control_room_requests__admin__update" on control_room_requests
  for update using (
    auth_user_role() = 'admin'
    and org_id = auth_user_org_id()
  );

-- Developer: full access
create policy "control_room_requests__developer__all" on control_room_requests
  for all using (auth_user_role() = 'developer');


-- ── control_room_messages ─────────────────────────────────────────────────────
-- Travellers access messages on their own requests
create policy "control_room_messages__own__all" on control_room_messages
  for all using (
    exists (
      select 1 from control_room_requests r
      where r.id = request_id and r.user_id = auth.uid()
    )
  );

-- Admin: access messages on their org's requests
create policy "control_room_messages__admin__all" on control_room_messages
  for all using (
    auth_user_role() = 'admin'
    and exists (
      select 1 from control_room_requests r
      where r.id = request_id and r.org_id = auth_user_org_id()
    )
  );

-- Developer: full access
create policy "control_room_messages__developer__all" on control_room_messages
  for all using (auth_user_role() = 'developer');


-- ── provider_vetting_records ──────────────────────────────────────────────────
-- Admin and developer only (not visible to regular travellers)
create policy "provider_vetting__admin__select" on provider_vetting_records
  for select using (auth_user_role() in ('admin', 'developer'));

create policy "provider_vetting__developer__all" on provider_vetting_records
  for all using (auth_user_role() = 'developer');


-- ── terms_acceptances ─────────────────────────────────────────────────────────
create policy "terms__own__all" on terms_acceptances
  for all using (auth.uid() = user_id);

create policy "terms__admin__select" on terms_acceptances
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "terms__developer__all" on terms_acceptances
  for all using (auth_user_role() = 'developer');


-- ── policy_acknowledgements ───────────────────────────────────────────────────
create policy "policy_ack__own__all" on policy_acknowledgements
  for all using (auth.uid() = user_id);

create policy "policy_ack__admin__select" on policy_acknowledgements
  for select using (
    auth_user_role() = 'admin'
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "policy_ack__developer__all" on policy_acknowledgements
  for all using (auth_user_role() = 'developer');


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: AUDIT — run this after to verify everything is correct
-- ═══════════════════════════════════════════════════════════════════════════════

select
  tablename,
  count(*) as policy_count,
  array_agg(policyname order by policyname) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
