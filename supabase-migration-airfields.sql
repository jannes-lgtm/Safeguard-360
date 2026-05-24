-- Migration: Create airfields table (OurAirports data)
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.airfields (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ident         text,                        -- ICAO / local code
  name          text          NOT NULL,
  airfield_type text          NOT NULL,      -- large_airport | medium_airport | small_airport | heliport | seaplane_base
  lat           double precision NOT NULL,
  lon           double precision NOT NULL,
  elevation_ft  integer,
  country       text,                        -- ISO 2-letter
  municipality  text,
  iata_code     text,
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS airfields_type_idx    ON public.airfields (airfield_type);
CREATE INDEX IF NOT EXISTS airfields_country_idx ON public.airfields (country);
CREATE INDEX IF NOT EXISTS airfields_updated_idx ON public.airfields (updated_at);

ALTER TABLE public.airfields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "airfields_select_all"
  ON public.airfields FOR SELECT
  USING (true);
