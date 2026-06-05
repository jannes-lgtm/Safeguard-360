-- ── Incident Lifecycle Migration ──────────────────────────────────────────────
-- Run once in Supabase SQL Editor
-- Adds: reported_by, type, city, incident_date, assignment, escalation,
--       resolution, timeline audit trail, updated_at

alter table public.incidents
  add column if not exists reported_by       text,
  add column if not exists type              text,           -- matches incident_type; code uses 'type'
  add column if not exists city              text,
  add column if not exists incident_date     date,           -- occurred_at alias for UI layer
  add column if not exists assigned_to_name  text,           -- display name of assignee
  add column if not exists assigned_at       timestamptz,
  add column if not exists escalated_to      text,           -- freetext: name / team / external body
  add column if not exists escalated_at      timestamptz,
  add column if not exists resolution_notes  text,
  add column if not exists resolved_at       timestamptz,
  add column if not exists timeline          jsonb not null default '[]'::jsonb,
  add column if not exists updated_at        timestamptz not null default now();

-- Back-fill type from incident_type where type is null
update public.incidents set type = incident_type where type is null and incident_type is not null;

-- Back-fill incident_date from occurred_at where incident_date is null
update public.incidents set incident_date = occurred_at::date where incident_date is null and occurred_at is not null;

-- Auto-update updated_at on every row change
create or replace function public.incidents_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists incidents_updated_at on public.incidents;
create trigger incidents_updated_at
  before update on public.incidents
  for each row execute function public.incidents_set_updated_at();

-- Org admin policy: full access to own-org incidents
drop policy if exists "org_admin_all_incidents" on public.incidents;
create policy "org_admin_all_incidents" on public.incidents
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin','developer')
        and (p.org_id = public.incidents.org_id or public.incidents.org_id is null)
    )
  );
