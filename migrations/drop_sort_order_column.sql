-- Drop redundant sort_order column, keep only display_order
-- display_order is more descriptive and serves the same purpose

BEGIN;

-- Drop the sort_order column
ALTER TABLE iso_requirements
DROP COLUMN IF EXISTS sort_order;

COMMIT;
