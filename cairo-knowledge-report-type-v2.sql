-- ── Diagnose + fix cairo_knowledge type column ───────────────────────────────
-- Step 1: See what's actually there
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'cairo_knowledge' AND column_name = 'type';

-- Step 2: See all check constraints
SELECT conname, pg_get_constraintdef(oid)
FROM   pg_constraint
WHERE  conrelid = 'cairo_knowledge'::regclass AND contype = 'c';

-- Step 3: See enum values (if type is an enum)
SELECT e.enumlabel
FROM   pg_type t
JOIN   pg_enum e ON e.enumtypid = t.oid
WHERE  t.typname IN (
  SELECT udt_name FROM information_schema.columns
  WHERE  table_name = 'cairo_knowledge' AND column_name = 'type'
);
