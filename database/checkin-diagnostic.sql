-- SafeGuard360 — Check-in diagnostic
-- Run this in Supabase SQL Editor to diagnose the "Never" check-in issue.
-- Shows: row count, newest rows, and whether policies exist correctly.

-- 1. How many check-in rows exist in total?
select count(*) as total_checkins from public.staff_checkins;

-- 2. Most recent 10 check-ins (bypasses RLS — run as service role in SQL editor)
select
  id,
  user_id,
  full_name,
  status,
  created_at,
  next_checkin_due
from public.staff_checkins
order by created_at desc
limit 10;

-- 3. Which RLS policies are active on staff_checkins right now?
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where tablename = 'staff_checkins'
order by policyname;

-- 4. Does auth_user_role() function exist and is it SECURITY DEFINER?
select
  proname,
  prosecdef,
  prosrc
from pg_proc
where proname = 'auth_user_role';

-- 5. Check for any users whose profile role is NULL (would break role-based policies)
select id, email, role, org_id
from public.profiles
where role is null or role = ''
limit 20;
