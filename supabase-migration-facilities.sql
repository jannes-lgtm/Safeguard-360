-- Migration: Create facilities table for caching OSM emergency services data
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.facilities (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text,
  facility_type text        NOT NULL,          -- 'hospital' | 'police' | 'fire'
  lat           double precision NOT NULL,
  lon           double precision NOT NULL,
  city          text,
  country       text,
  source        text        NOT NULL DEFAULT 'osm',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facilities_type_idx    ON public.facilities (facility_type);
CREATE INDEX IF NOT EXISTS facilities_updated_idx ON public.facilities (updated_at);

-- Allow authenticated reads (anon key is fine for map display)
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facilities_select_all"
  ON public.facilities FOR SELECT
  USING (true);
