-- SafeGuard360 — Fix staff_checkins + scheduled_checkins RLS policies
-- Run this in Supabase SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Root cause: previous rls-policies.sql dropped all policies then failed
-- before reaching the staff_checkins / scheduled_checkins CREATE POLICY
-- statements. RLS enabled + zero policies = deny by default.
-- All inserts silently rejected, Tracker returns 0 rows (shows Never).

-- ═══════════════════════════════════════════════════════════════════════
-- staff_checkins
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "users_own_checkins"              on public.staff_checkins;
drop policy if exists "admin_all_checkins"              on public.staff_checkins;
drop policy if exists "users_own"                       on public.staff_checkins;
drop policy if exists "admin_all"                       on public.staff_checkins;
drop policy if exists "staff_checkins__own__all"        on public.staff_checkins;
drop policy if exists "staff_checkins__admin__select"   on public.staff_checkins;
drop policy if exists "staff_checkins__admin__all"      on public.staff_checkins;
drop policy if exists "staff_checkins__developer__all"  on public.staff_checkins;

create policy "staff_checkins__own__all"
on public.staff_checkins
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "staff_checkins__admin__all"
on public.staff_checkins
for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'developer', 'org_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'developer', 'org_admin')
  )
);


-- ═══════════════════════════════════════════════════════════════════════
-- scheduled_checkins  (same failure — same fix)
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "users_own"                           on public.scheduled_checkins;
drop policy if exists "admin_all"                           on public.scheduled_checkins;
drop policy if exists "scheduled_checkins__own__all"        on public.scheduled_checkins;
drop policy if exists "scheduled_checkins__admin__select"   on public.scheduled_checkins;
drop policy if exists "scheduled_checkins__admin__all"      on public.scheduled_checkins;
drop policy if exists "scheduled_checkins__developer__all"  on public.scheduled_checkins;

create policy "scheduled_checkins__own__all"
on public.scheduled_checkins
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "scheduled_checkins__admin__all"
on public.scheduled_checkins
for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'developer', 'org_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'developer', 'org_admin')
  )
);


-- ═══════════════════════════════════════════════════════════════════════
-- Verify — should show 2 rows for each table
-- ═══════════════════════════════════════════════════════════════════════

select tablename, policyname, cmd
from pg_policies
where tablename in ('staff_checkins', 'scheduled_checkins')
order by tablename, policyname;
