-- ============================================================
-- SafeGuard 360 — MASTER DATABASE SETUP
-- Run this ONCE in Supabase → SQL Editor → New query → Run
-- All statements are idempotent (safe to re-run)
-- ============================================================


-- ============================================================
-- SECTION 0: Helper function (needed by policy RLS)
-- ============================================================

create or replace function my_profile_claim(claim text)
returns text
language sql
stable
security definer
as $$
  select
    case claim
      when 'role'   then p.role
      when 'org_id' then p.org_id::text
      else null
    end
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;


-- ============================================================
-- SECTION 1: Core tables
-- ============================================================

-- organisations (before profiles FK)
create table if not exists public.organisations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  industry            text,
  country             text,
  website             text,
  primary_contact     text,
  contact_email       text,
  contact_phone       text,
  address             text,
  emergency_number    text,
  security_contact    text,
  security_email      text,
  security_phone      text,
  subscription_plan   text default 'professional'
    check (subscription_plan in ('starter', 'professional', 'enterprise')),
  max_travellers      int default 50,
  approval_status     text default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  notes               text,
  is_active           boolean default true,
  org_onboarding_completed_at timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
alter table public.organisations enable row level security;


-- profiles (extends auth.users)
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  email                 text unique,
  company               text,
  role                  text default 'traveller'
    check (role in ('admin', 'org_admin', 'traveller', 'solo', 'developer')),
  phone                 text,
  whatsapp_number       text,
  country               text,
  status                text default 'active' check (status in ('active', 'inactive')),
  org_id                uuid references public.organisations(id) on delete set null,
  -- onboarding
  date_of_birth         date,
  nationality           text,
  passport_number       text,
  passport_expiry       date,
  blood_type            text,
  allergies             text,
  medications           text,
  kin_name              text,
  kin_relationship      text,
  kin_phone             text,
  kin_email             text,
  insurance_provider    text,
  insurance_policy      text,
  medical_aid           text,
  medical_aid_num       text,
  -- manager
  manager_name          text,
  manager_title         text,
  manager_email         text,
  manager_phone         text,
  -- terms & onboarding gates
  terms_version         text,
  terms_accepted_at     timestamptz,
  onboarding_completed_at timestamptz,
  created_at            timestamptz default now()
);
alter table public.profiles enable row level security;


-- itineraries
create table if not exists public.itineraries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  org_id          uuid references public.organisations(id) on delete set null,
  trip_name       text not null,
  departure_city  text,
  arrival_city    text,
  depart_date     date,
  return_date     date,
  flight_number   text,
  hotel_name      text,
  hotel_address   text,
  meetings        text,
  risk_level      text default 'Medium'
    check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  status          text default 'Upcoming'
    check (status in ('Upcoming', 'Active', 'Completed')),
  approval_status text default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approval_required boolean not null default false,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  approval_notes  text,
  submitted_at    timestamptz,
  share_token     text unique,
  share_passcode  text,
  created_at      timestamptz default now()
);
alter table public.itineraries enable row level security;


-- alerts
create table if not exists public.alerts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  severity        text check (severity in ('Critical', 'High', 'Medium', 'Low')),
  alert_type      text,
  country         text,
  location        text,
  description     text,
  affected_cities text,
  source          text,
  source_url      text,
  date_issued     date default current_date,
  status          text default 'Active' check (status in ('Active', 'Resolved')),
  created_at      timestamptz default now()
);
alter table public.alerts enable row level security;


-- policies
create table if not exists public.policies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text,
  description  text,
  file_url     text,
  version      text,
  last_updated date,
  org_id       uuid references public.organisations(id) on delete set null,
  status       text default 'Active' check (status in ('Active', 'Under Review', 'Archived'))
);
alter table public.policies enable row level security;


-- training_progress
create table if not exists public.training_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete cascade,
  module_name      text not null,
  module_order     int,
  progress_pct     int default 0 check (progress_pct between 0 and 100),
  status           text default 'Not Started'
    check (status in ('Not Started', 'In Progress', 'Complete')),
  completed_date   date,
  duration_minutes int
);
alter table public.training_progress enable row level security;


-- ============================================================
-- SECTION 2: Operational tables
-- ============================================================

-- emergency_contacts
create table if not exists public.emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  full_name    text not null,
  relationship text,
  email        text,
  phone        text,
  whatsapp     text,
  priority     int default 1,
  created_at   timestamptz default now()
);
alter table public.emergency_contacts enable row level security;


-- sos_events
create table if not exists public.sos_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade,
  full_name      text,
  latitude       decimal(10,8),
  longitude      decimal(11,8),
  accuracy       decimal,
  location_label text,
  message        text,
  trip_name      text,
  arrival_city   text,
  status         text not null default 'active'
    check (status in ('active', 'resolved', 'false_alarm')),
  resolved_by    uuid references auth.users(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.sos_events enable row level security;


-- staff_checkins (manual welfare check-ins)
create table if not exists public.staff_checkins (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,
  full_name         text,
  status            text not null default 'safe' check (status in ('safe', 'distress')),
  latitude          decimal(10,8),
  longitude         decimal(11,8),
  location_label    text,
  message           text,
  trip_name         text,
  arrival_city      text,
  interval_hours    int,
  next_checkin_due  timestamptz,
  created_at        timestamptz not null default now()
);
alter table public.staff_checkins enable row level security;


-- scheduled_checkins (auto-generated on trip approval)
create table if not exists public.scheduled_checkins (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid references public.itineraries(id) on delete cascade not null,
  user_id            uuid references auth.users(id) on delete cascade not null,
  checkin_type       text not null check (checkin_type in ('arrival', 'random')),
  due_at             timestamptz not null,
  window_hours       int not null default 12,
  completed          boolean not null default false,
  completed_at       timestamptz,
  missed             boolean not null default false,
  missed_notified_at timestamptz,
  label              text,
  created_at         timestamptz not null default now()
);
alter table public.scheduled_checkins enable row level security;


-- staff_locations
create table if not exists public.staff_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  full_name   text,
  latitude    decimal(10,8) not null,
  longitude   decimal(11,8) not null,
  accuracy    decimal,
  trip_name   text,
  arrival_city text,
  is_sharing  boolean not null default true,
  recorded_at timestamptz not null default now()
);
alter table public.staff_locations enable row level security;


-- trip_alerts (personalised, per-trip alerts from scan)
create table if not exists public.trip_alerts (
  id           uuid primary key default gen_random_uuid(),
  itinerary_id uuid references public.itineraries(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  alert_type   text not null
    check (alert_type in ('security','disaster','earthquake','weather','flight','health','political','ai_brief')),
  severity     text not null default 'Medium'
    check (severity in ('Critical','High','Medium','Low','Info')),
  title        text not null,
  description  text,
  source       text,
  source_url   text,
  country      text,
  arrival_city text,
  flight_number text,
  trip_name    text,
  dedup_key    text,
  is_read      boolean not null default false,
  notified_at  timestamptz,
  expires_at   timestamptz,
  event_date   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists trip_alerts_dedup on public.trip_alerts (itinerary_id, dedup_key);
alter table public.trip_alerts enable row level security;


-- incidents
create table if not exists public.incidents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  org_id       uuid references public.organisations(id) on delete set null,
  trip_id      uuid references public.itineraries(id) on delete set null,
  title        text not null,
  description  text,
  incident_type text,
  severity     text default 'Medium'
    check (severity in ('Critical','High','Medium','Low')),
  status       text default 'Open'
    check (status in ('Open','In Progress','Resolved','Closed')),
  location     text,
  country      text,
  occurred_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.incidents enable row level security;


-- audit_logs
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references auth.users(id) on delete set null,
  actor_email    text,
  actor_role     text,
  actor_org_id   uuid,
  action         text not null,
  entity_type    text,
  entity_id      text,
  entity_org_id  uuid,
  description    text,
  metadata       jsonb default '{}',
  ip_address     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);
alter table public.audit_logs enable row level security;


-- trip_training_assignments (created on trip approval)
create table if not exists public.trip_training_assignments (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid references public.itineraries(id) on delete cascade not null,
  user_id               uuid references auth.users(id) on delete cascade not null,
  module_order          int not null,
  module_name           text not null,
  required_before_travel boolean not null default true,
  completed             boolean not null default false,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  unique(trip_id, module_order)
);
alter table public.trip_training_assignments enable row level security;


-- briefings (AI-generated pre-trip briefing documents)
create table if not exists public.briefings (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid references public.itineraries(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  org_id         uuid references public.organisations(id) on delete set null,
  title          text,
  content        jsonb,
  summary        text,
  risk_level     text,
  country        text,
  city           text,
  acknowledged   boolean not null default false,
  acknowledged_at timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.briefings enable row level security;


-- pre_travel_health
create table if not exists public.pre_travel_health (
  id                         uuid primary key default gen_random_uuid(),
  trip_id                    uuid references public.itineraries(id) on delete cascade not null,
  user_id                    uuid references auth.users(id) on delete cascade not null,
  fit_to_travel              boolean not null default false,
  vaccination_statuses       jsonb,
  has_medical_conditions     boolean not null default false,
  medical_details            text,
  has_medications            boolean not null default false,
  medications_details        text,
  has_allergies              boolean not null default false,
  allergy_details            text,
  emergency_contact_name     text,
  emergency_contact_phone    text,
  emergency_contact_relation text,
  insurance_confirmed        boolean not null default false,
  notes                      text,
  submitted_at               timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique(trip_id, user_id)
);
alter table public.pre_travel_health enable row level security;


-- org_invites
create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  org_name    text,
  email       text not null,
  role        text default 'traveller'
    check (role in ('org_admin', 'traveller')),
  token       text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz default now(),
  expires_at  timestamptz default (now() + interval '7 days')
);
alter table public.org_invites enable row level security;


-- service_providers
create table if not exists public.service_providers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organisations(id) on delete cascade,
  name         text not null,
  category     text,
  country      text,
  city         text,
  contact_name text,
  contact_email text,
  contact_phone text,
  website      text,
  notes        text,
  status       text default 'Active' check (status in ('Active', 'Inactive', 'Pending')),
  created_at   timestamptz default now()
);
alter table public.service_providers enable row level security;


-- provider_vetting_records
create table if not exists public.provider_vetting_records (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid references public.service_providers(id) on delete cascade,
  vetted_by       uuid references auth.users(id),
  vetted_at       timestamptz not null default now(),
  checklist       jsonb not null default '{}',
  pass_count      int default 0,
  total_items     int default 0,
  overall_status  text not null default 'pending'
    check (overall_status in ('pass', 'conditional', 'fail', 'pending')),
  notes           text,
  next_review_date date,
  created_at      timestamptz not null default now()
);
alter table public.provider_vetting_records enable row level security;


-- training_modules
create table if not exists public.training_modules (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  duration_mins int default 30,
  topics        text,
  category      text default 'General',
  org_id        uuid references public.organisations(id) on delete set null,
  required      boolean default false,
  is_active     boolean default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);
alter table public.training_modules enable row level security;


-- travel_policies
create table if not exists public.travel_policies (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid references public.organisations(id) on delete cascade,
  company_name            text,
  emergency_number        text,
  travel_manager_name     text,
  travel_manager_email    text,
  hr_contact_name         text,
  hr_contact_email        text,
  insurance_provider      text,
  insurance_policy_num    text,
  medical_provider        text,
  max_risk_level          text default 'High'
    check (max_risk_level in ('Low', 'Medium', 'High', 'Critical')),
  restricted_countries    text,
  additional_requirements text,
  policy_version          text default '1.0',
  effective_date          date default now(),
  is_active               boolean default true,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
alter table public.travel_policies enable row level security;


-- policy_signatures
create table if not exists public.policy_signatures (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid references public.travel_policies(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete cascade,
  org_id         uuid references public.organisations(id) on delete cascade,
  signed_name    text not null,
  signed_at      timestamptz default now(),
  policy_version text,
  latitude       numeric,
  longitude      numeric,
  location_name  text,
  unique(user_id, policy_id)
);
alter table public.policy_signatures enable row level security;


-- visa_letter_requests
create table if not exists public.visa_letter_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete cascade not null,
  org_id              uuid references public.organisations(id) on delete set null,
  trip_id             uuid references public.itineraries(id) on delete set null,
  passport_country    text not null,
  destination_country text not null,
  travel_purpose      text not null default 'Business',
  trip_name           text,
  depart_date         date,
  return_date         date,
  letter_text         text,
  status              text not null default 'generated'
    check (status in ('generated', 'viewed', 'printed')),
  created_at          timestamptz default now()
);
alter table public.visa_letter_requests enable row level security;


-- crisis_broadcasts
create table if not exists public.crisis_broadcasts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid references public.organisations(id) on delete set null,
  sent_by           uuid references auth.users(id) on delete set null,
  subject           text not null,
  message           text not null,
  severity          text not null default 'High',
  recipients_filter text not null default 'all',
  recipient_count   int not null default 0,
  sent_at           timestamptz not null default now()
);
alter table public.crisis_broadcasts enable row level security;


-- ============================================================
-- SECTION 3: Trigger — auto-create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, org_id, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    coalesce(new.raw_user_meta_data->>'role', 'traveller'),
    nullif(new.raw_user_meta_data->>'org_id', '')::uuid,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- SECTION 4: Row Level Security Policies
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "Users can read own profile"          on public.profiles;
drop policy if exists "Admins can read all profiles"        on public.profiles;
drop policy if exists "Users can update own profile"        on public.profiles;
drop policy if exists "Org admins read their org profiles"  on public.profiles;
drop policy if exists "Org admins update their org profiles" on public.profiles;
drop policy if exists "Admins insert profiles"              on public.profiles;

create policy "Users can read own profile" on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles" on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "Org admins read their org profiles" on public.profiles for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.org_id = org_id and p.role in ('org_admin', 'admin', 'developer')
  ));

create policy "Users can update own profile" on public.profiles for update
  using (auth.uid() = id);

create policy "Org admins update their org profiles" on public.profiles for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.org_id = org_id and p.role in ('org_admin', 'admin', 'developer')
  ));

create policy "Admins insert profiles" on public.profiles for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── organisations ─────────────────────────────────────────────────────────────
drop policy if exists "Platform admins read all orgs"   on public.organisations;
drop policy if exists "Org members can read their org"  on public.organisations;
drop policy if exists "Authenticated can create org"    on public.organisations;
drop policy if exists "Org admins can update their org" on public.organisations;

create policy "Platform admins read all orgs" on public.organisations for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "Org members can read their org" on public.organisations for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = id));

create policy "Authenticated can create org" on public.organisations for insert
  with check (auth.role() = 'authenticated');

create policy "Org admins can update their org" on public.organisations for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.org_id = id and p.role in ('org_admin', 'admin', 'developer')
  ));


-- ── itineraries ───────────────────────────────────────────────────────────────
drop policy if exists "Users can read own itineraries"    on public.itineraries;
drop policy if exists "Admins can read all itineraries"   on public.itineraries;
drop policy if exists "Users can insert own itineraries"  on public.itineraries;
drop policy if exists "Users can update own itineraries"  on public.itineraries;
drop policy if exists "Org admins read org itineraries"   on public.itineraries;
drop policy if exists "Org admins update org itineraries" on public.itineraries;

create policy "Users can read own itineraries" on public.itineraries for select
  using (auth.uid() = user_id);

create policy "Admins can read all itineraries" on public.itineraries for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "Org admins read org itineraries" on public.itineraries for select
  using (exists (
    select 1 from public.profiles me
    join public.profiles traveller on traveller.id = itineraries.user_id
    where me.id = auth.uid()
      and me.role in ('org_admin', 'admin', 'developer')
      and (me.org_id = traveller.org_id or me.role in ('admin', 'developer'))
  ));

create policy "Users can insert own itineraries" on public.itineraries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own itineraries" on public.itineraries for update
  using (auth.uid() = user_id);

create policy "Org admins update org itineraries" on public.itineraries for update
  using (exists (
    select 1 from public.profiles me
    join public.profiles traveller on traveller.id = itineraries.user_id
    where me.id = auth.uid()
      and me.role in ('org_admin', 'admin', 'developer')
      and (me.org_id = traveller.org_id or me.role in ('admin', 'developer'))
  ));


-- ── alerts ────────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read alerts" on public.alerts;
drop policy if exists "Admins can insert alerts"            on public.alerts;
drop policy if exists "Admins can update alerts"            on public.alerts;
drop policy if exists "Admins can delete alerts"            on public.alerts;
drop policy if exists "Users can insert alerts"             on public.alerts;

create policy "Authenticated users can read alerts" on public.alerts for select
  using (auth.role() = 'authenticated');

create policy "Admins can insert alerts" on public.alerts for insert
  with check (auth.role() = 'authenticated');

create policy "Admins can update alerts" on public.alerts for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "Admins can delete alerts" on public.alerts for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── policies ──────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read policies" on public.policies;
drop policy if exists "Admins manage policies"                on public.policies;

create policy "Authenticated users can read policies" on public.policies for select
  using (auth.role() = 'authenticated');

create policy "Admins manage policies" on public.policies for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── training_progress ─────────────────────────────────────────────────────────
drop policy if exists "Users can read own training progress"  on public.training_progress;
drop policy if exists "Admins can read all training progress" on public.training_progress;
drop policy if exists "Users can update own training progress" on public.training_progress;
drop policy if exists "Users insert own training progress"     on public.training_progress;

create policy "Users can read own training progress" on public.training_progress for select
  using (auth.uid() = user_id);

create policy "Admins can read all training progress" on public.training_progress for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));

create policy "Users insert own training progress" on public.training_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own training progress" on public.training_progress for update
  using (auth.uid() = user_id);


-- ── emergency_contacts ───────────────────────────────────────────────────────
drop policy if exists "users_own_contacts"  on public.emergency_contacts;
drop policy if exists "admin_all_contacts"  on public.emergency_contacts;

create policy "users_own_contacts" on public.emergency_contacts for all
  using (auth.uid() = user_id);

create policy "admin_all_contacts" on public.emergency_contacts for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── sos_events ───────────────────────────────────────────────────────────────
drop policy if exists "users_own_sos"      on public.sos_events;
drop policy if exists "admin_all_sos"      on public.sos_events;
drop policy if exists "org_admin_view"     on public.sos_events;
drop policy if exists "org_admin_update"   on public.sos_events;

create policy "users_own_sos" on public.sos_events for all
  using (auth.uid() = user_id);

create policy "admin_all_sos" on public.sos_events for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "org_admin_view" on public.sos_events for select
  using (exists (
    select 1 from public.profiles actor
    join public.profiles traveller on traveller.id = sos_events.user_id
    where actor.id = auth.uid() and actor.role = 'org_admin' and actor.org_id = traveller.org_id
  ));

create policy "org_admin_update" on public.sos_events for update
  using (exists (
    select 1 from public.profiles actor
    join public.profiles traveller on traveller.id = sos_events.user_id
    where actor.id = auth.uid() and actor.role = 'org_admin' and actor.org_id = traveller.org_id
  ));


-- ── staff_checkins ───────────────────────────────────────────────────────────
drop policy if exists "users_own_checkins"   on public.staff_checkins;
drop policy if exists "admin_all_checkins"   on public.staff_checkins;

create policy "users_own_checkins" on public.staff_checkins for all
  using (auth.uid() = user_id);

create policy "admin_all_checkins" on public.staff_checkins for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── scheduled_checkins ───────────────────────────────────────────────────────
drop policy if exists "users_own"  on public.scheduled_checkins;
drop policy if exists "admin_all"  on public.scheduled_checkins;

create policy "users_own" on public.scheduled_checkins for all
  using (auth.uid() = user_id);

create policy "admin_all" on public.scheduled_checkins for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── staff_locations ──────────────────────────────────────────────────────────
drop policy if exists "users_own_locations"   on public.staff_locations;
drop policy if exists "admin_all_locations"   on public.staff_locations;

create policy "users_own_locations" on public.staff_locations for all
  using (auth.uid() = user_id);

create policy "admin_all_locations" on public.staff_locations for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── trip_alerts ──────────────────────────────────────────────────────────────
drop policy if exists "users_own_trip_alerts"   on public.trip_alerts;
drop policy if exists "admin_all_trip_alerts"   on public.trip_alerts;

create policy "users_own_trip_alerts" on public.trip_alerts for all
  using (auth.uid() = user_id);

create policy "admin_all_trip_alerts" on public.trip_alerts for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── incidents ─────────────────────────────────────────────────────────────────
drop policy if exists "users_own_incidents"  on public.incidents;
drop policy if exists "admin_all_incidents"  on public.incidents;

create policy "users_own_incidents" on public.incidents for all
  using (auth.uid() = user_id);

create policy "admin_all_incidents" on public.incidents for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── audit_logs ───────────────────────────────────────────────────────────────
drop policy if exists "admins_read_audit_logs"   on public.audit_logs;
drop policy if exists "service_insert_audit_log" on public.audit_logs;

-- Only platform admins/developers can read audit logs
create policy "admins_read_audit_logs" on public.audit_logs for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

-- Any authenticated user can write an audit log entry (insert only — no update/delete)
create policy "authenticated_insert_audit" on public.audit_logs for insert
  with check (auth.role() = 'authenticated');


-- ── trip_training_assignments ────────────────────────────────────────────────
drop policy if exists "users_own"  on public.trip_training_assignments;
drop policy if exists "admin_all"  on public.trip_training_assignments;

create policy "users_own" on public.trip_training_assignments for all
  using (auth.uid() = user_id);

create policy "admin_all" on public.trip_training_assignments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── briefings ────────────────────────────────────────────────────────────────
drop policy if exists "users_own_briefings"   on public.briefings;
drop policy if exists "admin_all_briefings"   on public.briefings;

create policy "users_own_briefings" on public.briefings for all
  using (auth.uid() = user_id);

create policy "admin_all_briefings" on public.briefings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer', 'org_admin')));


-- ── pre_travel_health ────────────────────────────────────────────────────────
drop policy if exists "users_own"        on public.pre_travel_health;
drop policy if exists "org_admin_view"   on public.pre_travel_health;

create policy "users_own" on public.pre_travel_health for all
  using (auth.uid() = user_id);

create policy "org_admin_view" on public.pre_travel_health for select
  using (exists (
    select 1 from public.profiles actor
    join public.profiles traveller on traveller.id = pre_travel_health.user_id
    where actor.id = auth.uid()
      and actor.role in ('admin', 'developer', 'org_admin')
      and (actor.role in ('admin', 'developer') or actor.org_id = traveller.org_id)
  ));


-- ── org_invites ──────────────────────────────────────────────────────────────
drop policy if exists "Org admins manage invites"       on public.org_invites;
drop policy if exists "Platform admins read all invites" on public.org_invites;

create policy "Org admins manage invites" on public.org_invites for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.org_id = org_id and p.role in ('org_admin', 'admin', 'developer')
  ));

create policy "Platform admins read all invites" on public.org_invites for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── service_providers ────────────────────────────────────────────────────────
drop policy if exists "admin_all_providers"   on public.service_providers;
drop policy if exists "org_members_read"      on public.service_providers;

create policy "admin_all_providers" on public.service_providers for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "org_members_read" on public.service_providers for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = org_id));


-- ── provider_vetting_records ──────────────────────────────────────────────────
drop policy if exists "admin_all_vetting"   on public.provider_vetting_records;
drop policy if exists "users_read_vetting"  on public.provider_vetting_records;

create policy "admin_all_vetting" on public.provider_vetting_records for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "users_read_vetting" on public.provider_vetting_records for select
  using (true);


-- ── training_modules ─────────────────────────────────────────────────────────
drop policy if exists "Admins manage training modules" on public.training_modules;
drop policy if exists "Users read active modules"      on public.training_modules;

create policy "Admins manage training modules" on public.training_modules for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "Users read active modules" on public.training_modules for select
  using (
    is_active = true
    and (org_id is null or exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = training_modules.org_id))
  );


-- ── travel_policies ──────────────────────────────────────────────────────────
drop policy if exists "Org members read their policy"  on public.travel_policies;
drop policy if exists "Org admins manage their policy" on public.travel_policies;
drop policy if exists "Platform admins read all policies" on public.travel_policies;

create policy "Org members read their policy" on public.travel_policies for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = org_id));

create policy "Org admins manage their policy" on public.travel_policies for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('org_admin', 'admin', 'developer') and (p.org_id = org_id or p.role in ('admin', 'developer'))
  ));

create policy "Platform admins read all policies" on public.travel_policies for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── policy_signatures ────────────────────────────────────────────────────────
drop policy if exists "Users manage own signatures"          on public.policy_signatures;
drop policy if exists "Org admins read their org signatures" on public.policy_signatures;

create policy "Users manage own signatures" on public.policy_signatures for all
  using (auth.uid() = user_id);

create policy "Org admins read their org signatures" on public.policy_signatures for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('org_admin', 'admin', 'developer') and (p.org_id = org_id or p.role in ('admin', 'developer'))
  ));


-- ── visa_letter_requests ──────────────────────────────────────────────────────
drop policy if exists "Users manage own visa letters"    on public.visa_letter_requests;
drop policy if exists "Org admins view org visa letters" on public.visa_letter_requests;
drop policy if exists "Admins manage all visa letters"   on public.visa_letter_requests;

create policy "Users manage own visa letters" on public.visa_letter_requests for all
  using (user_id = auth.uid());

create policy "Org admins view org visa letters" on public.visa_letter_requests for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('org_admin', 'admin', 'developer') and (p.org_id = org_id or p.role in ('admin', 'developer'))
  ));

create policy "Admins manage all visa letters" on public.visa_letter_requests for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));


-- ── crisis_broadcasts ────────────────────────────────────────────────────────
drop policy if exists "admin_all"      on public.crisis_broadcasts;
drop policy if exists "org_admin_own"  on public.crisis_broadcasts;

create policy "admin_all" on public.crisis_broadcasts for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'developer')));

create policy "org_admin_own" on public.crisis_broadcasts for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'org_admin' and p.org_id = crisis_broadcasts.org_id
  ));


-- ============================================================
-- SECTION 5: get_missed_checkins RPC
-- ============================================================

create or replace function get_missed_checkins()
returns setof public.scheduled_checkins
language sql
security definer
as $$
  select * from public.scheduled_checkins
  where completed = false
    and missed_notified_at is null
    and now() > (due_at + make_interval(hours => coalesce(window_hours, 24)));
$$;


-- ============================================================
-- SECTION 6: Seed data — default policies
-- ============================================================

insert into public.policies (name, category, description, version, last_updated, status)
values
  ('ISO 31030:2021 Travel Risk Management Policy',   'Risk Management', 'Organisational policy governing travel risk management in accordance with ISO 31030:2021.', 'v1.0', current_date, 'Active'),
  ('Traveller Code of Conduct',                      'HR & Compliance', 'Expected behaviour and responsibilities of all travelling staff members.',                   'v1.0', current_date, 'Active'),
  ('Emergency Response Procedures',                  'Security',        'Step-by-step procedures for responding to emergencies affecting staff in the field.',        'v2.1', current_date, 'Active'),
  ('Incident Reporting Policy',                      'Operations',      'Mandatory reporting requirements for security incidents, accidents, and near misses.',        'v1.0', current_date, 'Active'),
  ('Medical & Health Travel Standards',              'Health & Safety', 'Pre-travel health requirements, vaccination policies, and medical emergency procedures.',    'v1.0', current_date, 'Active')
on conflict do nothing;
