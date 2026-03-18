ALTER TABLE compliance_reports
    ADD COLUMN IF NOT EXISTS executive_summary JSONB,
    ADD COLUMN IF NOT EXISTS requirement_presentations JSONB;
