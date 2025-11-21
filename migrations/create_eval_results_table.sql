-- Migration: create eval_results table for repeatability testing
-- Run this in your Supabase/Postgres instance. Idempotent-safe.

-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,
    config_label TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    run_index INT NOT NULL,
    model_label TEXT NOT NULL,
    raw_output JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate rows per run for the same batch/doc/requirement
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'eval_results_unique_run'
    ) THEN
        ALTER TABLE eval_results
        ADD CONSTRAINT eval_results_unique_run
        UNIQUE (batch_id, doc_id, requirement_id, run_index);
    END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_eval_results_batch ON eval_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_config ON eval_results(config_label);
CREATE INDEX IF NOT EXISTS idx_eval_results_doc_req ON eval_results(doc_id, requirement_id);
