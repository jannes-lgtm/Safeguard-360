-- SafeGuard360 — Fix staff_checkins RLS policies
-- Run this in Supabase SQL Editor.
-- Safe to run multiple times (idempotent).
--
-- Root cause: previous rls-policies.sql dropped ALL policies then failed
-- before reaching the staff_checkins CREATE POLICY statements.
-- Result: table had RLS enabled but zero policies → deny by default.

-- ── Drop any stale or partial policies ───────────────────────────────────────
drop policy if exists "users_own_checkins"              on public.staff_checkins;
drop policy if exists "admin_all_checkins"              on public.staff_checkins;
drop policy if exists "users_own"                       on public.staff_checkins;
drop policy if exists "admin_all"                       on public.staff_checkins;
drop policy if exists "staff_checkins__own__all"        on public.staff_checkins;
drop policy if exists "staff_checkins__admin__select"   on public.staff_checkins;
drop policy if exists "staff_checkins__developer__all"  on public.staff_checkins;

-- ── Recreate correct policies ─────────────────────────────────────────────────

-- Every user can insert / view / update their own check-ins
create policy "staff_checkins__own__all" on public.staff_checkins
  for all using (auth.uid() = user_id);

-- Admins, org_admins, and developers can SELECT all check-ins
create policy "staff_checkins__admin__select" on public.staff_checkins
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'developer', 'org_admin')
    )
  );

-- ── Verify ───────────────────────────────────────────────────────────────────
-- After running, confirm 2 rows appear here:
select policyname, cmd from pg_policies where tablename = 'staff_checkins';

-- Also confirm the table now has rows (or 0 if nobody has checked in yet):
select count(*) from public.staff_checkins;
