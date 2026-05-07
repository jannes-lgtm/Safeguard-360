/**
 * SafeGuard360 — RLS Audit Queries
 * Run these in Supabase SQL editor whenever something looks wrong.
 * ─────────────────────────────────────────────────────────────────────────────
 */


-- ── 1. All policies across all tables ─────────────────────────────────────────
select
  tablename,
  policyname,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ── 2. Tables with RLS disabled (these are wide open — should be empty) ───────
select relname as table_name
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and pg_class.relkind = 'r'
  and not pg_class.relrowsecurity
order by relname;


-- ── 3. Tables with RLS enabled but NO policies (blocks all access) ────────────
select relname as table_name
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and pg_class.relkind = 'r'
  and pg_class.relrowsecurity
  and relname not in (
    select distinct tablename from pg_policies where schemaname = 'public'
  )
order by relname;


-- ── 4. User + org summary — who is in which org ───────────────────────────────
select
  p.email,
  p.role,
  p.org_id,
  o.name as org_name
from profiles p
left join organisations o on o.id = p.org_id
order by p.role, p.email;


-- ── 5. Simulate what admin sees in profiles ───────────────────────────────────
-- Replace the email below with your admin's email to test
select p.email, p.role, p.org_id
from profiles p
where p.org_id = (
  select org_id from profiles where email = 'jannes@covertstrategies.com'
)
   or p.id = (
  select id from profiles where email = 'jannes@covertstrategies.com'
);
