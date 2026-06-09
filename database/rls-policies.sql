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
 *   org_admin  — Organisation administrator (alias for admin in most policies)
 *   traveller  — Corporate employee, sees only their own data
 *   solo       — Independent traveller, sees only their own data (no org_id)
 *
 * POLICY NAMING CONVENTION:
 *   {table}__{role}__{action}
 *   e.g. profiles__admin__select, itineraries__own__all
 *
 * LAST UPDATED: Solo traveler audit — added missing tables:
 *   staff_locations, sos_events, emergency_contacts, policy_signatures,
 *   live_intelligence, event_correlations, feed_sources
 *   Fixed: control_room solo visibility, org_admin parity with admin
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
-- Previously missing — solo-critical tables
alter table staff_locations           enable row level security;
alter table sos_events                enable row level security;
alter table emergency_contacts        enable row level security;
alter table policy_signatures         enable row level security;
-- CAIRO Phase 4 tables (wrapped — may not exist yet in all environments)
do $$ begin alter table live_intelligence      enable row level security; exception when undefined_table then null; end $$;
do $$ begin alter table event_correlations     enable row level security; exception when undefined_table then null; end $$;
do $$ begin alter table feed_sources           enable row level security; exception when undefined_table then null; end $$;
-- Passive location pings (wrapped — table added in later migration)
do $$ begin alter table location_pings         enable row level security; exception when undefined_table then null; end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4: POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── profiles ──────────────────────────────────────────────────────────────────

create policy "profiles__own__select" on profiles
  for select using (auth.uid() = id);

create policy "profiles__own__update" on profiles
  for update using (auth.uid() = id);

-- Admin / org_admin: read profiles in their org
create policy "profiles__admin__select" on profiles
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and org_id is not null
    and org_id = auth_user_org_id()
  );

create policy "profiles__admin__update" on profiles
  for update using (
    auth_user_role() in ('admin', 'org_admin')
    and org_id = auth_user_org_id()
  );

-- Developer: full access
create policy "profiles__developer__all" on profiles
  for all using (auth_user_role() = 'developer');


-- ── organisations ─────────────────────────────────────────────────────────────

create policy "organisations__member__select" on organisations
  for select using (id = auth_user_org_id());

create policy "organisations__admin__update" on organisations
  for update using (
    auth_user_role() in ('admin', 'org_admin')
    and id = auth_user_org_id()
  );

create policy "organisations__developer__all" on organisations
  for all using (auth_user_role() = 'developer');


-- ── itineraries ───────────────────────────────────────────────────────────────

create policy "itineraries__own__all" on itineraries
  for all using (auth.uid() = user_id);

create policy "itineraries__admin__select" on itineraries
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "itineraries__admin__update" on itineraries
  for update using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "itineraries__developer__all" on itineraries
  for all using (auth_user_role() = 'developer');


-- ── alerts ────────────────────────────────────────────────────────────────────

create policy "alerts__authenticated__select" on alerts
  for select using (auth.uid() is not null);

create policy "alerts__developer__all" on alerts
  for all using (auth_user_role() = 'developer');


-- ── trip_alerts ───────────────────────────────────────────────────────────────

create policy "trip_alerts__own__all" on trip_alerts
  for all using (auth.uid() = user_id);

create policy "trip_alerts__admin__select" on trip_alerts
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "trip_alerts__developer__all" on trip_alerts
  for all using (auth_user_role() = 'developer');


-- ── training_modules ──────────────────────────────────────────────────────────

create policy "training_modules__authenticated__select" on training_modules
  for select using (auth.uid() is not null);

create policy "training_modules__developer__all" on training_modules
  for all using (auth_user_role() = 'developer');


-- ── training_records ─────────────────────────────────────────────────────────

create policy "training_records__own__all" on training_records
  for all using (auth.uid() = user_id);

create policy "training_records__admin__select" on training_records
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "training_records__developer__all" on training_records
  for all using (auth_user_role() = 'developer');


-- ── staff_checkins ────────────────────────────────────────────────────────────
-- NOTE: explicit WITH CHECK required so INSERT is permitted, not just SELECT.

create policy "staff_checkins__own__all" on staff_checkins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "staff_checkins__admin__all" on staff_checkins
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer', 'org_admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer', 'org_admin'))
  );


-- ── scheduled_checkins ───────────────────────────────────────────────────────

create policy "scheduled_checkins__own__all" on scheduled_checkins
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "scheduled_checkins__admin__all" on scheduled_checkins
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer', 'org_admin'))
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer', 'org_admin'))
  );


-- ── trip_training_assignments ─────────────────────────────────────────────────

create policy "trip_training__own__all" on trip_training_assignments
  for all using (auth.uid() = user_id);

create policy "trip_training__admin__select" on trip_training_assignments
  for select using (
    auth_user_role() in ('admin', 'org_admin')
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
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "incidents__developer__all" on incidents
  for all using (auth_user_role() = 'developer');


-- ── control_room_requests ─────────────────────────────────────────────────────
-- Solo users (org_id = null) submit requests with org_id = null.
-- Admin policy must match null org_id so solo requests reach the control room.

create policy "control_room_requests__own__all" on control_room_requests
  for all using (auth.uid() = user_id);

-- Admin/org_admin: see their org's requests
create policy "control_room_requests__admin__select" on control_room_requests
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and org_id = auth_user_org_id()
  );

create policy "control_room_requests__admin__update" on control_room_requests
  for update using (
    auth_user_role() in ('admin', 'org_admin')
    and org_id = auth_user_org_id()
  );

-- Developer: full access including solo requests (org_id = null)
create policy "control_room_requests__developer__all" on control_room_requests
  for all using (auth_user_role() = 'developer');


-- ── control_room_messages ─────────────────────────────────────────────────────

create policy "control_room_messages__own__all" on control_room_messages
  for all using (
    exists (
      select 1 from control_room_requests r
      where r.id = request_id and r.user_id = auth.uid()
    )
  );

create policy "control_room_messages__admin__all" on control_room_messages
  for all using (
    auth_user_role() in ('admin', 'org_admin')
    and exists (
      select 1 from control_room_requests r
      where r.id = request_id and r.org_id = auth_user_org_id()
    )
  );

create policy "control_room_messages__developer__all" on control_room_messages
  for all using (auth_user_role() = 'developer');


-- ── provider_vetting_records ──────────────────────────────────────────────────

create policy "provider_vetting__admin__select" on provider_vetting_records
  for select using (auth_user_role() in ('admin', 'org_admin', 'developer'));

create policy "provider_vetting__developer__all" on provider_vetting_records
  for all using (auth_user_role() = 'developer');


-- ── terms_acceptances ─────────────────────────────────────────────────────────

create policy "terms__own__all" on terms_acceptances
  for all using (auth.uid() = user_id);

create policy "terms__admin__select" on terms_acceptances
  for select using (
    auth_user_role() in ('admin', 'org_admin')
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
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "policy_ack__developer__all" on policy_acknowledgements
  for all using (auth_user_role() = 'developer');


-- ── emergency_contacts ────────────────────────────────────────────────────────
-- Solo-critical: users store personal emergency contacts here during onboarding.
-- Previously missing from this file — RLS was enabled but no policies existed.

create policy "emergency_contacts__own__all" on emergency_contacts
  for all using (auth.uid() = user_id);

create policy "emergency_contacts__admin__select" on emergency_contacts
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "emergency_contacts__developer__all" on emergency_contacts
  for all using (auth_user_role() = 'developer');


-- ── sos_events ────────────────────────────────────────────────────────────────
-- Solo-critical: solo users trigger SOS without an org_id.
-- Previously missing from this file — all SOS operations were silently denied.

create policy "sos_events__own__all" on sos_events
  for all using (auth.uid() = user_id);

-- Admin/org_admin: see SOS events for their org's travellers
create policy "sos_events__admin__select" on sos_events
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

create policy "sos_events__admin__update" on sos_events
  for update using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

-- Developer: full access including solo SOS events
create policy "sos_events__developer__all" on sos_events
  for all using (auth_user_role() = 'developer');


-- ── staff_locations ───────────────────────────────────────────────────────────
-- Solo-critical: solo users share location without an org_id.
-- Previously missing — location sharing was silently denied for all users.
-- NOTE: Supabase Realtime postgres_changes does NOT automatically apply RLS.
--       The LiveMap component adds an explicit user_id filter for solo users.

create policy "staff_locations__own__all" on staff_locations
  for all using (auth.uid() = user_id);

-- Admin/org_admin: see locations of their org's travellers
create policy "staff_locations__admin__select" on staff_locations
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and user_id in (
      select id from profiles where org_id = auth_user_org_id()
    )
  );

-- Developer: full access
create policy "staff_locations__developer__all" on staff_locations
  for all using (auth_user_role() = 'developer');


-- ── policy_signatures ────────────────────────────────────────────────────────
-- Org travellers sign their org travel policy here.
-- Solo users do NOT write here (their acceptance is in profiles.terms_version).
-- Previously missing — org policy signing was silently denied.

create policy "policy_signatures__own__all" on policy_signatures
  for all using (auth.uid() = user_id);

create policy "policy_signatures__admin__select" on policy_signatures
  for select using (
    auth_user_role() in ('admin', 'org_admin')
    and org_id = auth_user_org_id()
  );

create policy "policy_signatures__developer__all" on policy_signatures
  for all using (auth_user_role() = 'developer');


-- ── location_pings (passive background tracking) ─────────────────────────────
-- Written by usePassiveLocation hook during active trips.
-- Missing from previous RLS runs — passive location was silently denied.

do $$ begin
  create policy "location_pings__own__all" on location_pings
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when undefined_table then null; end $$;

do $$ begin
  create policy "location_pings__admin__select" on location_pings
    for select using (
      exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer', 'org_admin'))
    );
exception when undefined_table then null; end $$;


-- ── live_intelligence (CAIRO Phase 4) ────────────────────────────────────────
-- Wrapped — table may not exist yet in all environments.

do $$ begin
  create policy "live_intelligence__authenticated__select" on live_intelligence
    for select using (auth.uid() is not null);
exception when undefined_table then null; end $$;

do $$ begin
  create policy "live_intelligence__developer__all" on live_intelligence
    for all using (auth_user_role() = 'developer');
exception when undefined_table then null; end $$;


-- ── event_correlations (CAIRO Phase 4) ───────────────────────────────────────

do $$ begin
  create policy "event_correlations__authenticated__select" on event_correlations
    for select using (auth.uid() is not null);
exception when undefined_table then null; end $$;

do $$ begin
  create policy "event_correlations__developer__all" on event_correlations
    for all using (auth_user_role() = 'developer');
exception when undefined_table then null; end $$;


-- ── feed_sources (CAIRO Phase 4) ──────────────────────────────────────────────

do $$ begin
  create policy "feed_sources__authenticated__select" on feed_sources
    for select using (auth.uid() is not null);
exception when undefined_table then null; end $$;

do $$ begin
  create policy "feed_sources__developer__all" on feed_sources
    for all using (auth_user_role() = 'developer');
exception when undefined_table then null; end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 5: AUDIT — run this after to verify everything is correct
-- Expected: every table has at least 2 policies
-- ═══════════════════════════════════════════════════════════════════════════════

select
  tablename,
  count(*) as policy_count,
  array_agg(policyname order by policyname) as policies
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
