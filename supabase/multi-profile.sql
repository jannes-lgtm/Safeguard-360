-- ══════════════════════════════════════════════════════════════════════════════
-- SafeGuard 360 — Multi-Profile Role System
-- Run once in the Supabase SQL editor.
-- Introduces: organisations, org_id scoping, company training modules.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. Organisations ──────────────────────────────────────────────────────────
--    One row per corporate client. Travellers are linked via profiles.org_id.

create table if not exists organisations (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  industry          text,
  country           text,
  logo_url          text,
  website           text,
  primary_contact   text,
  contact_email     text,
  contact_phone     text,
  subscription_plan text        not null default 'professional'
                                check (subscription_plan in ('starter','professional','enterprise')),
  max_travellers    int         not null default 50,
  is_active         boolean     not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table organisations enable row level security;

-- Developers can see and manage all orgs
drop policy if exists "developer_all" on organisations;
create policy "developer_all" on organisations
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

-- Corporate admins can read their own org
drop policy if exists "admin_read_own" on organisations;
create policy "admin_read_own" on organisations
  for select
  using (
    exists (select 1 from profiles where id = auth.uid() and org_id = organisations.id)
  );

-- Corporate admins can update their own org
drop policy if exists "admin_update_own" on organisations;
create policy "admin_update_own" on organisations
  for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and org_id = organisations.id and role = 'admin'
    )
  );


-- ── 2. Add org_id + developer role to profiles ────────────────────────────────

alter table profiles
  add column if not exists org_id uuid references organisations(id) on delete set null;

-- Widen the role constraint to include 'developer'
alter table profiles
  drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
    check (role in ('developer', 'admin', 'traveller'));

-- Index for fast org-scoped queries
create index if not exists idx_profiles_org_id
  on profiles (org_id);

create index if not exists idx_profiles_role
  on profiles (role);


-- ── 3. Organisation training modules ──────────────────────────────────────────
--    Corporate admins upload their own training content per org.
--    Travellers in the org see these alongside ISO modules.

create table if not exists org_training_modules (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references organisations(id) on delete cascade,
  created_by   uuid        references auth.users(id),
  title        text        not null,
  description  text,
  content_type text        not null default 'document'
                           check (content_type in ('document','video','link','pdf')),
  content_url  text,
  content_body text,       -- rich text / markdown for inline content
  module_order int         not null default 1,
  required     boolean     not null default true,
  iso_aligned  boolean     not null default false,  -- flags if aligned to ISO 31030
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table org_training_modules enable row level security;

-- Corporate admins: full access to their org's modules
drop policy if exists "admin_all" on org_training_modules;
create policy "admin_all" on org_training_modules
  for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and org_id = org_training_modules.org_id and role = 'admin'
    )
  );

-- Travellers: read-only for their org's modules
drop policy if exists "traveller_read" on org_training_modules;
create policy "traveller_read" on org_training_modules
  for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and org_id = org_training_modules.org_id
    )
  );

-- Developers: full access to all
drop policy if exists "developer_all" on org_training_modules;
create policy "developer_all" on org_training_modules
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

create index if not exists idx_org_training_org_id
  on org_training_modules (org_id, module_order);


-- ── 4. Org-scope completion tracking ─────────────────────────────────────────
--    Tracks which travellers have completed which org-specific modules.

create table if not exists org_training_completions (
  id         uuid        primary key default gen_random_uuid(),
  module_id  uuid        not null references org_training_modules(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  org_id     uuid        not null references organisations(id) on delete cascade,
  completed  boolean     not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (module_id, user_id)
);

alter table org_training_completions enable row level security;

drop policy if exists "users_own" on org_training_completions;
create policy "users_own" on org_training_completions
  for all
  using (auth.uid() = user_id);

drop policy if exists "admin_read_org" on org_training_completions;
create policy "admin_read_org" on org_training_completions
  for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and org_id = org_training_completions.org_id and role = 'admin'
    )
  );

drop policy if exists "developer_all" on org_training_completions;
create policy "developer_all" on org_training_completions
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );


-- ── 5. Scope existing tables to org ──────────────────────────────────────────
--    itineraries already has user_id — admins query via profiles join.
--    No schema change needed for itineraries; org filtering done in app via
--    "user_id in (select id from profiles where org_id = X)".
--
--    Policies table: add org_id so corporates can upload their own policies.

alter table policies
  add column if not exists org_id uuid references organisations(id) on delete set null;

-- NULL org_id = platform-wide policy (visible to all)
-- Non-null org_id = company-specific policy (visible to that org only)

create index if not exists idx_policies_org_id
  on policies (org_id);


-- ── 6. Helper view: org compliance summary ────────────────────────────────────

create or replace view org_compliance_summary as
select
  o.id                                                           as org_id,
  o.name                                                         as org_name,
  count(distinct p.id)                                           as traveller_count,
  count(distinct i.id) filter (where i.status = 'Active')        as active_trips,
  count(distinct i.id) filter (where i.approval_status = 'pending') as pending_approvals,
  round(
    100.0 * count(distinct tr.id) filter (where tr.completed)
    / nullif(count(distinct tr.id), 0)
  )                                                              as training_pct,
  round(
    100.0 * count(distinct sc.id) filter (where sc.completed)
    / nullif(count(distinct sc.id), 0)
  )                                                              as checkin_pct
from organisations o
left join profiles p         on p.org_id = o.id and p.role = 'traveller'
left join itineraries i      on i.user_id = p.id
left join training_records tr on tr.user_id = p.id
left join scheduled_checkins sc on sc.user_id = p.id
group by o.id, o.name;

-- Only developers can query this view
drop policy if exists "developer_view" on org_compliance_summary;
-- (views don't support RLS directly — restrict via app logic)


-- ══════════════════════════════════════════════════════════════════════════════
-- Done.
-- ══════════════════════════════════════════════════════════════════════════════
