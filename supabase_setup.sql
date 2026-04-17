-- ============================================================
-- SafeGuard360 — Supabase Setup Script
-- Run this in Supabase → SQL Editor
-- ============================================================

-- --------------------------------------------------------
-- 1. TABLES
-- --------------------------------------------------------

-- profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  company text,
  role text default 'traveller' check (role in ('admin', 'traveller')),
  phone text,
  country text,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now()
);

-- itineraries
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  trip_name text not null,
  departure_city text,
  arrival_city text,
  depart_date date,
  return_date date,
  flight_number text,
  hotel_name text,
  hotel_address text,
  meetings text,
  risk_level text default 'Medium' check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  status text default 'Upcoming' check (status in ('Upcoming', 'Active', 'Completed')),
  created_at timestamptz default now()
);

-- alerts
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text check (severity in ('Critical', 'High', 'Medium', 'Low')),
  country text,
  description text,
  affected_cities text,
  date_issued date default current_date,
  status text default 'Active' check (status in ('Active', 'Resolved')),
  created_at timestamptz default now()
);

-- policies
create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  file_url text,
  version text,
  last_updated date,
  status text default 'Active' check (status in ('Active', 'Under Review', 'Archived'))
);

-- training_progress
create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  module_name text not null,
  module_order int4,
  progress_pct int4 default 0 check (progress_pct between 0 and 100),
  status text default 'Not Started' check (status in ('Not Started', 'In Progress', 'Complete')),
  completed_date date,
  duration_minutes int4
);

-- --------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- --------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.itineraries enable row level security;
alter table public.alerts enable row level security;
alter table public.policies enable row level security;
alter table public.training_progress enable row level security;

-- profiles: users read/update own row; admins read all
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- itineraries: travellers own rows; admins read all
create policy "Users can read own itineraries"
  on public.itineraries for select
  using (auth.uid() = user_id);

create policy "Admins can read all itineraries"
  on public.itineraries for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Users can insert own itineraries"
  on public.itineraries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own itineraries"
  on public.itineraries for update
  using (auth.uid() = user_id);

-- alerts: all authenticated users read; admins write
create policy "Authenticated users can read alerts"
  on public.alerts for select
  using (auth.role() = 'authenticated');

create policy "Admins can insert alerts"
  on public.alerts for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can update alerts"
  on public.alerts for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins can delete alerts"
  on public.alerts for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- policies: all authenticated users read
create policy "Authenticated users can read policies"
  on public.policies for select
  using (auth.role() = 'authenticated');

-- training_progress: users see own rows; admins see all
create policy "Users can read own training progress"
  on public.training_progress for select
  using (auth.uid() = user_id);

create policy "Admins can read all training progress"
  on public.training_progress for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Users can update own training progress"
  on public.training_progress for update
  using (auth.uid() = user_id);

-- --------------------------------------------------------
-- 3. TRIGGER — auto-create profile on signup
-- --------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    'traveller',
    'active'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --------------------------------------------------------
-- 4. SEED DATA
-- --------------------------------------------------------

-- Alerts
insert into public.alerts (title, severity, country, description, affected_cities, date_issued, status) values
  ('Civil unrest — Lagos, Nigeria', 'Critical', 'Nigeria', 'Protests near Victoria Island affecting movement and business operations.', 'Lagos, Abuja', '2026-04-14', 'Active'),
  ('Severe weather — Nairobi', 'High', 'Kenya', 'Heavy flooding affecting road networks. Airport delays expected.', 'Nairobi', '2026-04-15', 'Active'),
  ('Policy renewal due — Travel Risk Policy', 'Low', 'N/A', 'Travel Risk Policy expires in 14 days. Review and renewal required.', 'N/A', '2026-04-16', 'Active'),
  ('Road closures — Johannesburg CBD', 'Medium', 'South Africa', 'CBD road closures due to protest action. Now resolved.', 'Johannesburg', '2026-04-10', 'Resolved');

-- Policies
insert into public.policies (name, category, description, version, last_updated, status) values
  ('Travel Risk Management Policy', 'Travel', 'Outlines the organisation''s framework for assessing and managing risks associated with business travel across all regions of operation.', 'v1.0', '2026-02-12', 'Active'),
  ('Duty of Care Framework', 'Compliance', 'Defines the organisation''s legal and moral obligations toward employees travelling on company business, aligned with ISO 31000.', 'v1.0', '2026-01-05', 'Active'),
  ('Emergency Response Procedures', 'Security', 'Step-by-step procedures for responding to emergencies affecting staff in the field, including evacuation, medical, and security incidents.', 'v2.1', '2026-03-18', 'Active'),
  ('Lone Worker Safety Policy', 'Health & Safety', 'Addresses the specific risks faced by employees working alone or remotely, including check-in protocols and emergency contact procedures.', 'v1.3', '2025-11-20', 'Under Review');

-- --------------------------------------------------------
-- 5. SEED TRAINING PROGRESS (run AFTER creating a user)
-- --------------------------------------------------------
-- Replace 'YOUR_USER_ID_HERE' with your actual user UUID from auth.users
-- Find it in Supabase → Authentication → Users

-- insert into public.training_progress (user_id, module_name, module_order, progress_pct, status, duration_minutes, completed_date) values
--   ('YOUR_USER_ID_HERE', 'Introduction to ISO 31000', 1, 100, 'Complete', 45, '2026-03-01'),
--   ('YOUR_USER_ID_HERE', 'Risk Identification', 2, 100, 'Complete', 60, '2026-03-08'),
--   ('YOUR_USER_ID_HERE', 'Risk Assessment & Evaluation', 3, 60, 'In Progress', 75, null),
--   ('YOUR_USER_ID_HERE', 'Risk Treatment Planning', 4, 20, 'In Progress', 60, null),
--   ('YOUR_USER_ID_HERE', 'Monitoring & Review', 5, 0, 'Not Started', 45, null),
--   ('YOUR_USER_ID_HERE', 'Duty of Care Obligations', 6, 0, 'Not Started', 90, null);
