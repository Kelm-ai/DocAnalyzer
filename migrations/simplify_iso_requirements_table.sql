-- Simplify iso_requirements to the minimal fields used by the app
-- Final shape: id, clause, title, requirement_text (nullable), display_order, evaluation_type, timestamps

BEGIN;

-- Ensure display_order column exists (preferred ordering field for UI)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'iso_requirements' AND column_name = 'display_order'
    ) THEN
        ALTER TABLE iso_requirements
        ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Remove deprecated columns
ALTER TABLE iso_requirements DROP COLUMN IF EXISTS acceptance_criteria;
ALTER TABLE iso_requirements DROP COLUMN IF EXISTS expected_artifacts;
ALTER TABLE iso_requirements DROP COLUMN IF EXISTS guidance_notes;
ALTER TABLE iso_requirements DROP COLUMN IF EXISTS sort_order;

-- Ensure evaluation_type remains available (guarded for older deployments)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'iso_requirements' AND column_name = 'evaluation_type'
    ) THEN
        ALTER TABLE iso_requirements
        ADD COLUMN evaluation_type TEXT;
    END IF;
END $$;

-- Seed display_order for existing rows that don't have a value yet
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY clause, title) AS rn
    FROM iso_requirements
)
UPDATE iso_requirements r
SET display_order = COALESCE(NULLIF(display_order, 0), ranked.rn, 0)
FROM ranked
WHERE r.id = ranked.id
  AND (r.display_order IS NULL OR r.display_order = 0);

-- Touch updated_at so downstream caches notice the schema change
UPDATE iso_requirements
SET updated_at = CURRENT_TIMESTAMP
WHERE updated_at IS NOT NULL;

COMMIT;
