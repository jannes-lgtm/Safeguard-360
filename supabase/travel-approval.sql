-- ══════════════════════════════════════════════════════════════════════════════
-- SafeGuard 360 — Travel Approval System
-- Run once in the Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS and IF NOT EXISTS on columns.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. Approval columns on itineraries ───────────────────────────────────────
--    Tracks whether a trip has been submitted, approved, or rejected.

alter table itineraries
  add column if not exists approval_status   text        not null default 'pending',
  add column if not exists approval_required boolean     not null default true,
  add column if not exists approved_by       uuid        references auth.users(id),
  add column if not exists approved_at       timestamptz,
  add column if not exists approval_notes    text,
  add column if not exists submitted_at      timestamptz;

-- Optional: constrain values
alter table itineraries
  drop constraint if exists itineraries_approval_status_check;

alter table itineraries
  add constraint itineraries_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected'));


-- ── 2. Trip training assignments ──────────────────────────────────────────────
--    Created automatically on approval. One row per required training module.
--    Seeded from RISK_MODULES in api/travel-approval.js.

create table if not exists trip_training_assignments (
  id                     uuid        primary key default gen_random_uuid(),
  trip_id                uuid        not null references itineraries(id) on delete cascade,
  user_id                uuid        not null references auth.users(id)  on delete cascade,
  module_order           int         not null,
  module_name            text        not null,
  required_before_travel boolean     not null default true,
  completed              boolean     not null default false,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),

  unique (trip_id, module_order)
);

alter table trip_training_assignments enable row level security;

-- Travellers can read/update their own assignments
drop policy if exists "users_own" on trip_training_assignments;
create policy "users_own" on trip_training_assignments
  for all
  using (auth.uid() = user_id);

-- Admins have full access
drop policy if exists "admin_all" on trip_training_assignments;
create policy "admin_all" on trip_training_assignments
  for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ── 3. Scheduled check-ins ────────────────────────────────────────────────────
--    Created automatically on approval. Includes one arrival check-in and
--    N randomised check-ins based on trip duration.

create table if not exists scheduled_checkins (
  id           uuid        primary key default gen_random_uuid(),
  trip_id      uuid        not null references itineraries(id) on delete cascade,
  user_id      uuid        not null references auth.users(id)  on delete cascade,
  checkin_type text        not null check (checkin_type in ('arrival', 'random')),
  due_at       timestamptz not null,
  window_hours int         not null default 12,
  completed    boolean     not null default false,
  completed_at timestamptz,
  missed       boolean     not null default false,
  label        text,
  created_at   timestamptz not null default now()
);

alter table scheduled_checkins enable row level security;

-- Travellers can read/update their own scheduled check-ins
drop policy if exists "users_own" on scheduled_checkins;
create policy "users_own" on scheduled_checkins
  for all
  using (auth.uid() = user_id);

-- Admins have full access
drop policy if exists "admin_all" on scheduled_checkins;
create policy "admin_all" on scheduled_checkins
  for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ── 4. Useful indexes ─────────────────────────────────────────────────────────

create index if not exists idx_itineraries_approval_status
  on itineraries (approval_status);

create index if not exists idx_trip_training_user
  on trip_training_assignments (user_id);

create index if not exists idx_trip_training_trip
  on trip_training_assignments (trip_id);

create index if not exists idx_scheduled_checkins_user_due
  on scheduled_checkins (user_id, due_at)
  where completed = false;

create index if not exists idx_scheduled_checkins_trip
  on scheduled_checkins (trip_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- Done. Tables created, RLS enabled, policies set.
-- ══════════════════════════════════════════════════════════════════════════════
