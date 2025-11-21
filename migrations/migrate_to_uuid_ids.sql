-- Migration: Convert iso_requirements.id from TEXT to UUID with auto-generation
-- This migration preserves existing data while transitioning to UUID-based IDs

BEGIN;

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS requirement_compliance_rates CASCADE;
DROP VIEW IF EXISTS evaluation_summary CASCADE;

-- Step 2: Add new UUID column to iso_requirements
ALTER TABLE iso_requirements
ADD COLUMN id_new UUID DEFAULT gen_random_uuid();

-- Step 3: Populate the new UUID column for existing rows
UPDATE iso_requirements
SET id_new = gen_random_uuid()
WHERE id_new IS NULL;

-- Step 4: Create a mapping table to preserve old_id -> new_id relationship temporarily
CREATE TEMP TABLE id_mapping AS
SELECT id AS old_id, id_new AS new_id
FROM iso_requirements;

-- Step 5: Add new UUID column to requirement_evaluations
ALTER TABLE requirement_evaluations
ADD COLUMN requirement_id_new UUID;

-- Step 6: Update requirement_evaluations with new UUIDs using the mapping
UPDATE requirement_evaluations re
SET requirement_id_new = im.new_id
FROM id_mapping im
WHERE re.requirement_id = im.old_id;

-- Step 7: Drop old foreign key constraint
ALTER TABLE requirement_evaluations
DROP CONSTRAINT IF EXISTS requirement_evaluations_requirement_id_fkey;

-- Step 8: Drop old columns
ALTER TABLE requirement_evaluations
DROP COLUMN requirement_id;

ALTER TABLE iso_requirements
DROP COLUMN id;

-- Step 9: Rename new columns to original names
ALTER TABLE iso_requirements
RENAME COLUMN id_new TO id;

ALTER TABLE requirement_evaluations
RENAME COLUMN requirement_id_new TO requirement_id;

-- Step 10: Set the new UUID column as primary key
ALTER TABLE iso_requirements
ADD PRIMARY KEY (id);

-- Step 11: Make id column default to gen_random_uuid()
ALTER TABLE iso_requirements
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Step 12: Recreate foreign key constraint
ALTER TABLE requirement_evaluations
ADD CONSTRAINT requirement_evaluations_requirement_id_fkey
FOREIGN KEY (requirement_id) REFERENCES iso_requirements(id);

-- Step 13: Recreate index on requirement_evaluations.requirement_id
CREATE INDEX IF NOT EXISTS idx_requirement_evaluations_req_id
ON requirement_evaluations(requirement_id);

-- Step 14: Recreate the views with UUID support
CREATE VIEW requirement_compliance_rates AS
SELECT
    r.id AS requirement_id,
    r.clause,
    r.title,
    r.evaluation_type,
    count(re.id) AS total_evaluations,
    count(CASE WHEN re.status = 'PASS' THEN 1 ELSE NULL END) AS pass_count,
    count(CASE WHEN re.status = 'FAIL' THEN 1 ELSE NULL END) AS fail_count,
    round((100.0 * count(CASE WHEN re.status = 'PASS' THEN 1 ELSE NULL END)::numeric / NULLIF(count(re.id), 0)::numeric), 2) AS pass_rate
FROM iso_requirements r
LEFT JOIN requirement_evaluations re ON r.id = re.requirement_id
GROUP BY r.id, r.clause, r.title, r.evaluation_type
ORDER BY r.clause;

CREATE VIEW evaluation_summary AS
SELECT
    de.id,
    de.document_name,
    de.status,
    de.overall_compliance_score,
    de.started_at,
    de.completed_at,
    count(re.id) AS total_evaluations,
    count(CASE WHEN re.status = 'PASS' THEN 1 ELSE NULL END) AS passed,
    count(CASE WHEN re.status = 'FAIL' THEN 1 ELSE NULL END) AS failed,
    count(CASE WHEN re.status = 'PARTIAL' THEN 1 ELSE NULL END) AS partial,
    count(CASE WHEN re.status = 'NOT_APPLICABLE' THEN 1 ELSE NULL END) AS not_applicable
FROM document_evaluations de
LEFT JOIN requirement_evaluations re ON de.id = re.document_evaluation_id
GROUP BY de.id;

-- Step 15: Touch updated_at to signal schema change
UPDATE iso_requirements
SET updated_at = CURRENT_TIMESTAMP;

COMMIT;
