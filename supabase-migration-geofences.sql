-- ── Geofencing Migration ──────────────────────────────────────────────────────
-- Run once in Supabase SQL Editor

-- Alert zones: polygon boundaries drawn by org admins
create table if not exists public.alert_zones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organisations(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  name        text not null,
  description text,
  severity    text not null default 'Medium'
    check (severity in ('Critical','High','Medium','Low')),
  coordinates jsonb not null,   -- GeoJSON polygon ring: [[lng,lat],...]
  color       text,             -- optional override; defaults to severity colour
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.alert_zones enable row level security;

create policy "org_admin_manage_zones" on public.alert_zones
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin','developer','admin')
    )
  );

-- Geofence events: enter / exit log per traveller per zone
create table if not exists public.geofence_events (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid references public.alert_zones(id) on delete cascade,
  zone_name   text,
  user_id     uuid references auth.users(id) on delete cascade,
  user_name   text,
  event_type  text not null check (event_type in ('enter','exit')),
  latitude    decimal(10,8),
  longitude   decimal(11,8),
  ts          timestamptz not null default now()
);
alter table public.geofence_events enable row level security;

create policy "admin_all_geofence_events" on public.geofence_events
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin','developer','admin')
    )
  );

-- updated_at trigger for alert_zones
create or replace function public.alert_zones_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists alert_zones_updated_at on public.alert_zones;
create trigger alert_zones_updated_at
  before update on public.alert_zones
  for each row execute function public.alert_zones_set_updated_at();
