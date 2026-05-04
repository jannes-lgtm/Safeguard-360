-- ============================================================
-- SafeGuard360 – Supabase SQL Migrations
-- Paste this entire file into the Supabase SQL Editor and run.
-- All statements use CREATE TABLE IF NOT EXISTS so they are safe
-- to run multiple times (idempotent).
-- ============================================================


-- ============================================================
-- 1. PROVIDER VETTING RECORDS
--    Stores structured vetting checklists for service providers.
-- ============================================================

create table if not exists provider_vetting_records (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references service_providers(id) on delete cascade,
  vetted_by uuid references auth.users(id),
  vetted_at timestamptz not null default now(),
  checklist jsonb not null default '{}',
  pass_count int default 0,
  total_items int default 0,
  overall_status text not null default 'pending' check (overall_status in ('pass','conditional','fail','pending')),
  notes text,
  next_review_date date,
  created_at timestamptz not null default now()
);

alter table provider_vetting_records enable row level security;

-- Admins can do everything; regular users can read all vetting records.
create policy "admin_all_vetting" on provider_vetting_records for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "users_read_vetting" on provider_vetting_records for select using (true);


-- ============================================================
-- 2. SOS EVENTS
--    Emergency SOS triggers sent by travellers in distress.
-- ============================================================

create table if not exists sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  latitude decimal(10,8),
  longitude decimal(11,8),
  accuracy decimal,
  location_label text,
  message text,
  trip_name text,
  arrival_city text,
  status text not null default 'active' check (status in ('active','resolved','false_alarm')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table sos_events enable row level security;

-- Users can manage their own SOS events; admins can manage all.
create policy "users_own_sos" on sos_events for all using (auth.uid() = user_id);
create policy "admin_all_sos" on sos_events for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);


-- ============================================================
-- 3. STAFF CHECK-INS
--    Periodic welfare check-ins submitted by travelling staff.
-- ============================================================

create table if not exists staff_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  status text not null default 'safe' check (status in ('safe','distress')),
  latitude decimal(10,8),
  longitude decimal(11,8),
  location_label text,
  message text,
  trip_name text,
  arrival_city text,
  interval_hours int,
  next_checkin_due timestamptz,
  created_at timestamptz not null default now()
);

alter table staff_checkins enable row level security;

-- Users own their check-ins; admins see all.
create policy "users_own_checkins" on staff_checkins for all using (auth.uid() = user_id);
create policy "admin_all_checkins" on staff_checkins for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);


-- ============================================================
-- 4. STAFF LOCATIONS
--    Real-time / recent GPS locations shared by travelling staff.
-- ============================================================

create table if not exists staff_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text,
  latitude decimal(10,8) not null,
  longitude decimal(11,8) not null,
  accuracy decimal,
  trip_name text,
  arrival_city text,
  is_sharing boolean not null default true,
  recorded_at timestamptz not null default now()
);

alter table staff_locations enable row level security;

-- Users own their location data; admins see all.
create policy "users_own_locations" on staff_locations for all using (auth.uid() = user_id);
create policy "admin_all_locations" on staff_locations for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);


-- ============================================================
-- 5. TRIP ALERTS  (NEW)
--    Personalised, trip-specific alerts sourced from GDACS,
--    USGS, internal alerts, and FlightAware. Written by the
--    /api/trip-alert-scan serverless function.
-- ============================================================

create table if not exists trip_alerts (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid references itineraries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  alert_type text not null check (alert_type in ('security','disaster','earthquake','weather','flight','health','political')),
  severity text not null default 'Medium' check (severity in ('Critical','High','Medium','Low','Info')),
  title text not null,
  description text,
  source text,
  source_url text,
  country text,
  arrival_city text,
  flight_number text,
  trip_name text,
  dedup_key text,
  is_read boolean not null default false,
  expires_at timestamptz,
  event_date timestamptz,
  created_at timestamptz not null default now()
);

-- Deduplicate on (itinerary_id, dedup_key) so the scan function can
-- safely upsert without creating duplicate alert rows.
create unique index if not exists trip_alerts_dedup on trip_alerts (itinerary_id, dedup_key);

alter table trip_alerts enable row level security;

-- Users see only their own trip alerts; admins see all.
create policy "users_own_trip_alerts" on trip_alerts for all using (auth.uid() = user_id);
create policy "admin_all_trip_alerts" on trip_alerts for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
