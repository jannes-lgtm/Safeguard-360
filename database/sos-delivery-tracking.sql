-- sos-delivery-tracking.sql
-- Phase 1 operational hardening: SOS notification delivery tracking
--
-- Safe to run multiple times (all ALTER TABLE statements use IF NOT EXISTS).
-- Run this against the Supabase SQL editor before deploying api/sos-trigger.js.
--
-- What this adds to sos_events:
--   notification_status       — lifecycle: pending → sent | partial | failed
--   notification_sent_at      — timestamp of first delivery attempt
--   notification_delivery_count — how many channels confirmed delivery
--   notification_channels     — jsonb array of { type, label, status } per channel
--   last_escalation_at        — when the escalation cron last re-notified this event
--   escalation_count          — how many times the escalation cron has fired for this event

-- ── SOS delivery tracking columns ──────────────────────────────────────────────
alter table sos_events
  add column if not exists notification_status         text          default 'pending'
    check (notification_status in ('pending', 'sent', 'partial', 'failed')),
  add column if not exists notification_sent_at        timestamptz,
  add column if not exists notification_delivery_count int           default 0,
  add column if not exists notification_channels       jsonb,
  add column if not exists last_escalation_at          timestamptz,
  add column if not exists escalation_count            int           default 0;

-- ── Index for escalation cron query ────────────────────────────────────────────
-- The cron finds: active events > 5min old with zero or failed delivery
create index if not exists idx_sos_events_escalation_check
  on sos_events (status, notification_delivery_count, created_at)
  where status = 'active';

-- ── operational_events table ───────────────────────────────────────────────────
-- Lightweight structured event log for cross-system observability.
-- Used by Phase 1 event emitter. Not a full event bus — append-only log.
create table if not exists operational_events (
  id           uuid        primary key default gen_random_uuid(),
  event_type   text        not null,
  severity     text        not null default 'info'
                             check (severity in ('info', 'warning', 'critical')),
  source       text,                        -- originating system/module
  reference_id uuid,                        -- FK to the entity that triggered this (sos_events.id, etc.)
  reference_table text,                     -- which table the reference_id belongs to
  payload      jsonb       default '{}',    -- event-specific data
  user_id      uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table operational_events enable row level security;

-- Admins + developers can read all events; others cannot read this table directly
create policy "admin_read_operational_events" on operational_events
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('admin', 'developer', 'gsoc_admin', 'gsoc_operator')
    )
  );

-- Service role can insert (all server-side writes use service role)
-- No client-side insert policy — events are only written by server functions

-- Index for queries by type + time
create index if not exists idx_operational_events_type_time
  on operational_events (event_type, created_at desc);

create index if not exists idx_operational_events_reference
  on operational_events (reference_table, reference_id)
  where reference_id is not null;
