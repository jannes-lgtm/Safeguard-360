-- ══════════════════════════════════════════════════════════════════════════════
-- SafeGuard 360 — Terms Acceptance + Passive Location Tracking
-- Run after multi-profile.sql and control-room.sql
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. Track T&C acceptance per user ─────────────────────────────────────────

create table if not exists terms_acceptances (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  version      text        not null default '1.0',
  accepted_at  timestamptz not null default now(),
  ip_address   text,
  user_agent   text,
  unique (user_id, version)
);

alter table terms_acceptances enable row level security;

drop policy if exists "users_own" on terms_acceptances;
create policy "users_own" on terms_acceptances
  for all using (auth.uid() = user_id);

drop policy if exists "developer_all" on terms_acceptances;
create policy "developer_all" on terms_acceptances
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

-- Add terms columns to profiles for fast lookup (avoids extra join on every page load)
alter table profiles
  add column if not exists terms_accepted_at  timestamptz,
  add column if not exists terms_version      text;

create index if not exists idx_terms_acceptances_user
  on terms_acceptances (user_id);


-- ── 2. Passive location pings ─────────────────────────────────────────────────
--    Written silently whenever traveller uses the app during an active trip.
--    Requires prior location permission grant (browser enforces this).

create table if not exists location_pings (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  trip_id      uuid        references itineraries(id) on delete set null,
  org_id       uuid        references organisations(id) on delete set null,
  latitude     decimal(10,8) not null,
  longitude    decimal(11,8) not null,
  accuracy     int,                      -- metres
  altitude     decimal(10,2),
  speed        decimal(6,2),
  source       text not null default 'passive'
               check (source in ('passive','checkin','sos','manual')),
  created_at   timestamptz not null default now()
);

alter table location_pings enable row level security;

-- Travellers can insert and read their own pings
drop policy if exists "users_own" on location_pings;
create policy "users_own" on location_pings
  for all using (auth.uid() = user_id);

-- Corporate admins can read pings from their org's travellers
drop policy if exists "admin_read_org" on location_pings;
create policy "admin_read_org" on location_pings
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role = 'admin'
        and org_id = location_pings.org_id
    )
  );

-- Developers can read all pings
drop policy if exists "developer_all" on location_pings;
create policy "developer_all" on location_pings
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

-- Indexes
create index if not exists idx_location_pings_user
  on location_pings (user_id, created_at desc);

create index if not exists idx_location_pings_trip
  on location_pings (trip_id, created_at desc);

create index if not exists idx_location_pings_org
  on location_pings (org_id, created_at desc);

-- Automatic cleanup: delete pings older than 90 days (data minimisation — GDPR/POPIA)
-- Run this as a scheduled job in Supabase (Database → Scheduled Jobs → pg_cron):
--
-- select cron.schedule(
--   'purge-old-location-pings',
--   '0 2 * * *',
--   $$delete from location_pings where created_at < now() - interval '90 days'$$
-- );


-- ══════════════════════════════════════════════════════════════════════════════
-- Done.
-- ══════════════════════════════════════════════════════════════════════════════
