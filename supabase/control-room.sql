-- ══════════════════════════════════════════════════════════════════════════════
-- SafeGuard 360 — Live Control Room + Solo Traveller Profile
-- Run once in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. Add 'solo' to the profiles role enum ───────────────────────────────────

alter table profiles
  drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
    check (role in ('developer', 'admin', 'traveller', 'solo'));


-- ── 2. Control room requests ──────────────────────────────────────────────────
--    Raised by any traveller (corporate or solo). Monitored by developer/ops.

create table if not exists control_room_requests (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  org_id          uuid        references organisations(id) on delete set null,

  -- What kind of help is needed
  request_type    text        not null default 'other'
                              check (request_type in (
                                'medical', 'security', 'evacuation',
                                'travel_disruption', 'lost_documents',
                                'accommodation', 'legal', 'other'
                              )),
  severity        text        not null default 'medium'
                              check (severity in ('critical','high','medium','low')),
  description     text        not null,

  -- Location at time of request
  latitude        decimal(10,8),
  longitude       decimal(11,8),
  location_label  text,

  -- Trip context (auto-populated from active trip)
  trip_id         uuid        references itineraries(id) on delete set null,
  trip_name       text,
  arrival_city    text,
  country         text,

  -- Operator response
  status          text        not null default 'pending'
                              check (status in ('pending','in_progress','resolved','cancelled')),
  assigned_to     text,       -- operator name/handle
  response_notes  text,
  resolved_at     timestamptz,

  -- Contact preference
  contact_method  text        default 'in_app'
                              check (contact_method in ('in_app','phone','email','whatsapp')),
  contact_detail  text,       -- phone number / email if different from profile

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table control_room_requests enable row level security;

-- Travellers can create and view their own requests
drop policy if exists "users_own" on control_room_requests;
create policy "users_own" on control_room_requests
  for all
  using (auth.uid() = user_id);

-- Corporate admins can view their org's requests
drop policy if exists "admin_read_org" on control_room_requests;
create policy "admin_read_org" on control_room_requests
  for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role = 'admin'
        and org_id = control_room_requests.org_id
    )
  );

-- Developers (operators) have full access to all requests
drop policy if exists "developer_all" on control_room_requests;
create policy "developer_all" on control_room_requests
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

-- Indexes
create index if not exists idx_crr_status
  on control_room_requests (status, created_at desc);

create index if not exists idx_crr_user
  on control_room_requests (user_id);

create index if not exists idx_crr_org
  on control_room_requests (org_id);

create index if not exists idx_crr_severity
  on control_room_requests (severity, status)
  where status in ('pending', 'in_progress');


-- ── 3. Control room messages (response thread) ────────────────────────────────

create table if not exists control_room_messages (
  id          uuid        primary key default gen_random_uuid(),
  request_id  uuid        not null references control_room_requests(id) on delete cascade,
  sender_id   uuid        references auth.users(id),
  sender_role text        not null check (sender_role in ('traveller','operator')),
  message     text        not null,
  created_at  timestamptz not null default now()
);

alter table control_room_messages enable row level security;

-- Users can see messages on their own requests
drop policy if exists "users_own_messages" on control_room_messages;
create policy "users_own_messages" on control_room_messages
  for all
  using (
    exists (
      select 1 from control_room_requests
      where id = control_room_messages.request_id
        and user_id = auth.uid()
    )
  );

-- Developers can see and send all messages
drop policy if exists "developer_all_messages" on control_room_messages;
create policy "developer_all_messages" on control_room_messages
  for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'developer')
  );

create index if not exists idx_crm_request
  on control_room_messages (request_id, created_at);


-- ── 4. Solo traveller: itineraries without org approval ──────────────────────
--    Solo travellers bypass the approval workflow.
--    When solo user creates a trip, set approval_required = false, status = 'approved'.
--    This is enforced in app logic, not DB — solo users simply don't see the
--    approval flow and their trips auto-set approval_status = 'approved'.


-- ── 5. Enable real-time on control room (for live updates) ───────────────────
--    Run this to enable Supabase Realtime on the control room tables.
--    Go to Supabase Dashboard → Database → Replication → enable for:
--      control_room_requests, control_room_messages


-- ══════════════════════════════════════════════════════════════════════════════
-- Done.
-- ══════════════════════════════════════════════════════════════════════════════
