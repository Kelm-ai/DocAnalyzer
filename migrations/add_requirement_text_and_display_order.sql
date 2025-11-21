-- Add requirement_text and display_order columns to iso_requirements
-- requirement_text: stores the detailed requirement description
-- display_order: controls the display ordering (more descriptive than sort_order)

BEGIN;

-- Add requirement_text column
ALTER TABLE iso_requirements
ADD COLUMN IF NOT EXISTS requirement_text TEXT;

-- Add display_order column (we'll keep sort_order for now for backward compatibility)
-- Copy existing sort_order values to display_order
ALTER TABLE iso_requirements
ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Sync display_order with sort_order for existing rows
UPDATE iso_requirements
SET display_order = sort_order
WHERE display_order = 0 OR display_order IS NULL;

-- Add comment to columns for documentation
COMMENT ON COLUMN iso_requirements.requirement_text IS 'Detailed text description of the requirement';
COMMENT ON COLUMN iso_requirements.display_order IS 'Integer value controlling the display order of requirements in the UI';

COMMIT;
