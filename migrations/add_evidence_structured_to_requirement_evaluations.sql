ALTER TABLE requirement_evaluations
ADD COLUMN IF NOT EXISTS evidence_structured JSONB NOT NULL DEFAULT '[]'::jsonb;
