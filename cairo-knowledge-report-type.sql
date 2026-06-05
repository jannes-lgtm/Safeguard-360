-- ── cairo_knowledge: allow 'report' as a valid document type ─────────────────
--
-- The table was originally created with CHECK (type IN ('sop', 'case')).
-- The Knowledge Base UI now supports Country Risk Reports (type = 'report').
-- Run this in Supabase → SQL Editor.

-- 1. Drop the old constraint (name may vary — try both)
ALTER TABLE cairo_knowledge DROP CONSTRAINT IF EXISTS cairo_knowledge_type_check;
ALTER TABLE cairo_knowledge DROP CONSTRAINT IF EXISTS knowledge_type_check;

-- 2. Add updated constraint
ALTER TABLE cairo_knowledge
  ADD CONSTRAINT cairo_knowledge_type_check
  CHECK (type IN ('sop', 'case', 'report'));

-- 3. Verify
SELECT conname, pg_get_constraintdef(oid)
FROM   pg_constraint
WHERE  conrelid = 'cairo_knowledge'::regclass
AND    contype  = 'c';
