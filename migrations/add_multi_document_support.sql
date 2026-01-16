-- Migration: Add multi-document support
-- This migration adds the evaluation_documents table and updates document_evaluations
-- to support primary document + supporting documents per evaluation.
-- Run this in your Supabase/Postgres instance. Idempotent-safe.

-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: Create evaluation_documents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS evaluation_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES document_evaluations(id) ON DELETE CASCADE,
    document_role TEXT NOT NULL CHECK (document_role IN ('primary', 'supporting')),
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    page_count INTEGER,
    mime_type TEXT DEFAULT 'application/pdf',
    -- Summary fields (for supporting docs)
    summary_text TEXT,
    summary_generated_at TIMESTAMPTZ,
    summary_model TEXT,
    summary_tokens_used INTEGER,
    -- Provider file references (cached for LLM uploads)
    openai_file_id TEXT,
    openai_uploaded_at TIMESTAMPTZ,
    gemini_file_id TEXT,
    gemini_file_uri TEXT,
    gemini_uploaded_at TIMESTAMPTZ,
    gemini_expires_at TIMESTAMPTZ,
    claude_file_id TEXT,
    claude_uploaded_at TIMESTAMPTZ,
    -- Ordering for supporting docs
    display_order INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for evaluation_documents
CREATE INDEX IF NOT EXISTS idx_eval_docs_evaluation_id ON evaluation_documents(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_eval_docs_role ON evaluation_documents(document_role);
CREATE INDEX IF NOT EXISTS idx_eval_docs_file_hash ON evaluation_documents(file_hash);

-- Ensure exactly one primary document per evaluation
-- This constraint uses a partial unique index
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_eval_docs_primary_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_eval_docs_primary_unique
        ON evaluation_documents(evaluation_id)
        WHERE document_role = 'primary';
    END IF;
END $$;

-- Enable RLS on evaluation_documents
ALTER TABLE evaluation_documents ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for evaluation_documents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'evaluation_documents' AND policyname = 'Allow all access to evaluation_documents'
    ) THEN
        CREATE POLICY "Allow all access to evaluation_documents" ON evaluation_documents FOR ALL USING (true);
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add multi-document columns to document_evaluations
-- ============================================================================

-- Add framework_id column (references frameworks table for multi-framework support)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_evaluations' AND column_name = 'framework_id'
    ) THEN
        ALTER TABLE document_evaluations ADD COLUMN framework_id UUID REFERENCES frameworks(id);
    END IF;
END $$;

-- Add error_message column for storing failure details
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_evaluations' AND column_name = 'error_message'
    ) THEN
        ALTER TABLE document_evaluations ADD COLUMN error_message TEXT;
    END IF;
END $$;

-- Add supporting_docs_count column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_evaluations' AND column_name = 'supporting_docs_count'
    ) THEN
        ALTER TABLE document_evaluations ADD COLUMN supporting_docs_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add summaries_status column for tracking summary generation state
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_evaluations' AND column_name = 'summaries_status'
    ) THEN
        ALTER TABLE document_evaluations ADD COLUMN summaries_status TEXT
        CHECK (summaries_status IN ('pending', 'generating', 'completed', 'failed', 'not_required'));
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Create updated_at trigger for evaluation_documents
-- ============================================================================

-- Ensure the trigger function exists (may have been created by previous migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for evaluation_documents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_evaluation_documents_updated_at'
    ) THEN
        CREATE TRIGGER update_evaluation_documents_updated_at
            BEFORE UPDATE ON evaluation_documents
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Backfill existing evaluations (optional)
-- ============================================================================

-- For existing evaluations without multi-doc support, set summaries_status to 'not_required'
UPDATE document_evaluations
SET summaries_status = 'not_required'
WHERE summaries_status IS NULL;

-- ============================================================================
-- Migration complete!
--
-- Summary of changes:
-- 1. Created 'evaluation_documents' table for storing primary and supporting documents
-- 2. Added unique constraint to ensure exactly one primary document per evaluation
-- 3. Added 'supporting_docs_count' and 'summaries_status' columns to document_evaluations
-- 4. Created indexes for efficient querying
-- 5. Added updated_at trigger for evaluation_documents
-- 6. Backfilled existing evaluations with 'not_required' summaries_status
--
-- Next steps after running this migration:
-- 1. Create Supabase Storage bucket for documents (if not exists)
-- 2. Deploy the updated API with multi-document upload support
-- ============================================================================
