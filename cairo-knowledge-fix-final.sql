-- ── Fix cairo_knowledge type column — handles all cases ──────────────────────

-- Step 1: Drop ALL check constraints on the table (whatever they're named)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE  conrelid = 'cairo_knowledge'::regclass AND contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE cairo_knowledge DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Step 2: If type is an enum, add 'report' to it; otherwise cast column to text
DO $$
DECLARE v_udt text;
BEGIN
  SELECT udt_name INTO v_udt
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
  AND    table_name   = 'cairo_knowledge'
  AND    column_name  = 'type';

  IF v_udt IS NOT DISTINCT FROM 'text' OR v_udt ILIKE '%char%' THEN
    -- Already a text type, nothing to do here
    RAISE NOTICE 'type column is text — skipping enum step';
  ELSE
    -- It's an enum — add 'report' value
    BEGIN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''report''', v_udt);
      RAISE NOTICE 'Added ''report'' to enum %', v_udt;
    EXCEPTION WHEN OTHERS THEN
      -- Can't modify enum (e.g. inside transaction) — convert to text instead
      RAISE NOTICE 'Enum add failed, converting column to text: %', SQLERRM;
      EXECUTE 'ALTER TABLE cairo_knowledge ALTER COLUMN type TYPE text USING type::text';
    END;
  END IF;
END $$;

-- Step 3: Add a clean CHECK constraint covering all valid types
ALTER TABLE cairo_knowledge
  ADD CONSTRAINT cairo_knowledge_type_check
  CHECK (type IN ('sop', 'case', 'report'));

-- Step 4: Verify
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'cairo_knowledge'::regclass AND contype = 'c';
