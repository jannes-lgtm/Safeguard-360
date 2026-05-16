-- ─────────────────────────────────────────────────────────────────────────────
-- SafeGuard360 — Traffic Monitoring Schema
--
-- Three tables:
--   traffic_corridors  — the road corridors we monitor (seeded below)
--   traffic_snapshots  — live readings from TomTom (rolling 30-day window)
--   traffic_patterns   — learned baseline per corridor/day/hour (auto-built)
--
-- Run once against your Supabase project.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Corridors ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS traffic_corridors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,           -- e.g. "Lagos → Abuja"
  country       text NOT NULL,           -- primary country (matches CAIRO geo-context)
  region        text,                    -- e.g. "West Africa"
  origin_name   text NOT NULL,
  dest_name     text NOT NULL,
  origin_lat    double precision NOT NULL,
  origin_lon    double precision NOT NULL,
  dest_lat      double precision NOT NULL,
  dest_lon      double precision NOT NULL,
  distance_km   integer,
  route_type    text DEFAULT 'intercity', -- 'urban' | 'intercity' | 'border'
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- ── 2. Live snapshots (rolling 30-day window, auto-pruned) ────────────────────
CREATE TABLE IF NOT EXISTS traffic_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id       uuid NOT NULL REFERENCES traffic_corridors(id) ON DELETE CASCADE,
  captured_at       timestamptz DEFAULT now(),

  -- Travel time (seconds)
  travel_time_secs  integer,   -- current travel time WITH traffic
  free_flow_secs    integer,   -- baseline no-traffic travel time
  historic_secs     integer,   -- TomTom historical average
  delay_secs        integer,   -- traffic delay = travel_time - free_flow

  -- Congestion
  congestion_ratio  numeric(4,2),  -- delay / free_flow  (0 = clear, 1 = doubled)
  congestion_level  text,          -- 'free' | 'low' | 'moderate' | 'heavy' | 'standstill'

  -- Incidents on this corridor
  incident_count    integer DEFAULT 0,
  incidents         jsonb DEFAULT '[]',  -- [{type, description, delay_mins, from, to}]

  -- Metadata
  tomtom_ok         boolean DEFAULT true  -- false = API call failed for this snapshot
);

-- Index for fast corridor lookups
CREATE INDEX IF NOT EXISTS idx_traffic_snapshots_corridor_time
  ON traffic_snapshots (corridor_id, captured_at DESC);

-- ── 3. Learned baseline patterns (auto-built from snapshots) ──────────────────
CREATE TABLE IF NOT EXISTS traffic_patterns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_id       uuid NOT NULL REFERENCES traffic_corridors(id) ON DELETE CASCADE,
  day_of_week       integer NOT NULL,  -- 0=Sun … 6=Sat
  hour_of_day       integer NOT NULL,  -- 0–23 UTC
  avg_congestion    numeric(4,2),
  avg_delay_secs    integer,
  avg_travel_secs   integer,
  sample_count      integer DEFAULT 0,
  last_updated      timestamptz DEFAULT now(),
  UNIQUE (corridor_id, day_of_week, hour_of_day)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE traffic_corridors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_patterns   ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read traffic data
CREATE POLICY "traffic_corridors__auth__select"  ON traffic_corridors  FOR SELECT TO authenticated USING (true);
CREATE POLICY "traffic_snapshots__auth__select"  ON traffic_snapshots  FOR SELECT TO authenticated USING (true);
CREATE POLICY "traffic_patterns__auth__select"   ON traffic_patterns   FOR SELECT TO authenticated USING (true);

-- Only service role writes (ingest function uses service key)
CREATE POLICY "traffic_corridors__service__all"  ON traffic_corridors  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "traffic_snapshots__service__all"  ON traffic_snapshots  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "traffic_patterns__service__all"   ON traffic_patterns   FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed: Key African road corridors ──────────────────────────────────────────
INSERT INTO traffic_corridors (name, country, region, origin_name, dest_name, origin_lat, origin_lon, dest_lat, dest_lon, distance_km, route_type) VALUES

-- Nigeria
('Lagos → Ibadan',        'Nigeria', 'West Africa',  'Lagos',     'Ibadan',       6.4550,  3.3841,  7.3775,  3.9470,  120, 'intercity'),
('Lagos → Abuja',         'Nigeria', 'West Africa',  'Lagos',     'Abuja',        6.4550,  3.3841,  9.0765,  7.3986,  760, 'intercity'),
('Lagos → Benin City',    'Nigeria', 'West Africa',  'Lagos',     'Benin City',   6.4550,  3.3841,  6.3350,  5.6270,  300, 'intercity'),
('Abuja → Kaduna',        'Nigeria', 'West Africa',  'Abuja',     'Kaduna',       9.0765,  7.3986, 10.5222,  7.4383,  185, 'intercity'),
('Abuja → Kano',          'Nigeria', 'West Africa',  'Abuja',     'Kano',         9.0765,  7.3986, 12.0022,  8.5920,  360, 'intercity'),
('Port Harcourt → Aba',   'Nigeria', 'West Africa',  'Port Harcourt', 'Aba',      4.8156,  7.0498,  5.1067,  7.3667,   60, 'intercity'),

-- Kenya
('Nairobi → Mombasa',     'Kenya',   'East Africa',  'Nairobi',   'Mombasa',     -1.2864, 36.8172, -4.0435, 39.6682,  480, 'intercity'),
('Nairobi → Nakuru',      'Kenya',   'East Africa',  'Nairobi',   'Nakuru',      -1.2864, 36.8172, -0.3031, 36.0800,  160, 'intercity'),
('Nairobi → Thika',       'Kenya',   'East Africa',  'Nairobi',   'Thika',       -1.2864, 36.8172, -1.0332, 37.0693,   45, 'urban'),
('Mombasa → Malindi',     'Kenya',   'East Africa',  'Mombasa',   'Malindi',     -4.0435, 39.6682, -3.2138, 40.1169,  120, 'intercity'),

-- South Africa
('Johannesburg → Pretoria',  'South Africa', 'Southern Africa', 'Johannesburg', 'Pretoria',  -26.2041, 28.0473, -25.7479, 28.2293,  60, 'urban'),
('Johannesburg → Durban',    'South Africa', 'Southern Africa', 'Johannesburg', 'Durban',    -26.2041, 28.0473, -29.8587, 31.0218, 560, 'intercity'),
('Cape Town → George',       'South Africa', 'Southern Africa', 'Cape Town',    'George',    -33.9249, 18.4241, -33.9648, 22.4597, 430, 'intercity'),

-- Ghana
('Accra → Kumasi',        'Ghana',   'West Africa',  'Accra',     'Kumasi',       5.5600, -0.2057,  6.6885, -1.6244,  270, 'intercity'),
('Accra → Tema',          'Ghana',   'West Africa',  'Accra',     'Tema',         5.5600, -0.2057,  5.6698, -0.0166,   30, 'urban'),

-- Ethiopia
('Addis Ababa → Adama',   'Ethiopia', 'East Africa', 'Addis Ababa', 'Adama',      9.0250, 38.7469,  8.5400, 39.2700,   99, 'intercity'),
('Addis Ababa → Dire Dawa','Ethiopia','East Africa', 'Addis Ababa', 'Dire Dawa',  9.0250, 38.7469,  9.5930, 41.8661,  515, 'intercity'),

-- Tanzania
('Dar es Salaam → Dodoma','Tanzania', 'East Africa', 'Dar es Salaam', 'Dodoma',  -6.7924, 39.2083, -6.1630, 35.7395,  450, 'intercity'),
('Dar es Salaam → Arusha','Tanzania', 'East Africa', 'Dar es Salaam', 'Arusha',  -6.7924, 39.2083, -3.3869, 36.6830,  650, 'intercity'),

-- Uganda
('Kampala → Entebbe',     'Uganda',  'East Africa',  'Kampala',   'Entebbe',      0.3476, 32.5825,  0.0524, 32.4637,   45, 'urban'),
('Kampala → Jinja',       'Uganda',  'East Africa',  'Kampala',   'Jinja',        0.3476, 32.5825,  0.4244, 33.2041,   85, 'intercity'),

-- Rwanda
('Kigali → Butare',       'Rwanda',  'East Africa',  'Kigali',    'Butare',      -1.9441, 30.0619, -2.5967, 29.7394,   135, 'intercity'),

-- Senegal
('Dakar → Thiès',         'Senegal', 'West Africa',  'Dakar',     'Thiès',       14.6928,-17.4467, 14.7910,-16.9260,   70, 'intercity'),

-- Egypt
('Cairo → Alexandria',    'Egypt',   'North Africa', 'Cairo',     'Alexandria',  30.0444, 31.2357, 31.2001, 29.9187,  220, 'intercity'),
('Cairo → Suez',          'Egypt',   'North Africa', 'Cairo',     'Suez',        30.0444, 31.2357, 29.9668, 32.5498,  130, 'intercity'),

-- Cameroon
('Douala → Yaoundé',      'Cameroon','Central Africa','Douala',   'Yaoundé',      4.0511,  9.7679,  3.8480, 11.5021,  240, 'intercity'),

-- Ivory Coast
('Abidjan → Yamoussoukro','Côte d''Ivoire','West Africa','Abidjan','Yamoussoukro',5.3599, -4.0083,  6.8276, -5.2893,  250, 'intercity'),

-- Angola
('Luanda → Benguela',     'Angola',  'Southern Africa','Luanda',  'Benguela',    -8.8390, 13.2894,-12.5763, 13.4055,  500, 'intercity'),

-- Mozambique
('Maputo → Beira',        'Mozambique','Southern Africa','Maputo', 'Beira',      -25.9692, 32.5732,-19.8436, 34.8389,  830, 'intercity'),

-- Zimbabwe
('Harare → Bulawayo',     'Zimbabwe','Southern Africa','Harare',  'Bulawayo',   -17.8252, 31.0335,-20.1325, 28.6262,  440, 'intercity')

ON CONFLICT DO NOTHING;

-- ── Auto-prune snapshots older than 30 days (keep DB lean) ───────────────────
-- Run this as a Supabase scheduled job or call from ingest function
-- DELETE FROM traffic_snapshots WHERE captured_at < now() - interval '30 days';
