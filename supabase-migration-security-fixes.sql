-- ============================================================
-- SafeGuard 360 — Security & Operational Fixes Migration
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. get_missed_checkins RPC ────────────────────────────────────────────────
-- Replaces the fallback raw query in missed-checkins.js with a proper function.
-- Returns scheduled_checkins rows where the window deadline has passed.
create or replace function get_missed_checkins()
returns setof scheduled_checkins
language sql
security definer
as $$
  select * from scheduled_checkins
  where completed = false
    and missed_notified_at is null
    and now() > (due_at + make_interval(hours => coalesce(window_hours, 24)));
$$;

-- ── 2. SOS events — allow org_admin to see their org's travellers' events ─────
-- The existing "admin_all" policy only covers role='admin'.
-- This adds visibility for org_admin scoped to their organisation.
drop policy if exists "org_admin_view" on sos_events;
create policy "org_admin_view" on sos_events
  for select
  using (
    exists (
      select 1
      from profiles actor
      join profiles traveller on traveller.id = sos_events.user_id
      where actor.id = auth.uid()
        and actor.role = 'org_admin'
        and actor.org_id = traveller.org_id
    )
  );

-- Also allow org_admin to update status (resolve/false_alarm) for their org's events
drop policy if exists "org_admin_update" on sos_events;
create policy "org_admin_update" on sos_events
  for update
  using (
    exists (
      select 1
      from profiles actor
      join profiles traveller on traveller.id = sos_events.user_id
      where actor.id = auth.uid()
        and actor.role = 'org_admin'
        and actor.org_id = traveller.org_id
    )
  );

-- ── 3. Persist notification state on trip_alerts ─────────────────────────────
-- Prevents duplicate alert emails on Vercel cold starts.
alter table trip_alerts
  add column if not exists notified_at timestamptz;

-- ── 4. Add missing_notified_at to scheduled_checkins if not present ───────────
alter table scheduled_checkins
  add column if not exists missed_notified_at timestamptz;

-- ── 5. Ensure crisis_broadcasts table exists ─────────────────────────────────
create table if not exists crisis_broadcasts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references organisations(id) on delete set null,
  sent_by          uuid references auth.users(id) on delete set null,
  subject          text not null,
  message          text not null,
  severity         text not null default 'High',
  recipients_filter text not null default 'all',
  recipient_count  int not null default 0,
  sent_at          timestamptz not null default now()
);
alter table crisis_broadcasts enable row level security;

drop policy if exists "admin_all" on crisis_broadcasts;
create policy "admin_all" on crisis_broadcasts for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'developer'))
);

drop policy if exists "org_admin_own" on crisis_broadcasts;
create policy "org_admin_own" on crisis_broadcasts for all using (
  exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'org_admin'
      and org_id = crisis_broadcasts.org_id
  )
);

-- ── 6. pre_travel_health table (if not already created) ──────────────────────
create table if not exists pre_travel_health (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid references itineraries(id) on delete cascade not null,
  user_id               uuid references auth.users(id) on delete cascade not null,
  fit_to_travel         boolean not null default false,
  vaccination_statuses  jsonb,
  has_medical_conditions boolean not null default false,
  medical_details       text,
  has_medications       boolean not null default false,
  medications_details   text,
  has_allergies         boolean not null default false,
  allergy_details       text,
  emergency_contact_name     text,
  emergency_contact_phone    text,
  emergency_contact_relation text,
  insurance_confirmed   boolean not null default false,
  notes                 text,
  submitted_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(trip_id, user_id)
);
alter table pre_travel_health enable row level security;

drop policy if exists "users_own" on pre_travel_health;
create policy "users_own" on pre_travel_health for all using (auth.uid() = user_id);

drop policy if exists "org_admin_view" on pre_travel_health;
create policy "org_admin_view" on pre_travel_health for select using (
  exists (
    select 1
    from profiles actor
    join profiles traveller on traveller.id = pre_travel_health.user_id
    where actor.id = auth.uid()
      and actor.role in ('admin', 'developer', 'org_admin')
      and (actor.role in ('admin', 'developer') or actor.org_id = traveller.org_id)
  )
);
