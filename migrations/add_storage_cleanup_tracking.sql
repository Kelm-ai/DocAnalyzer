-- Migration: Add storage cleanup tracking to evaluation_documents
-- Tracks when files are deleted from Supabase Storage (48h auto-cleanup)

-- Add storage_deleted_at column to track cleanup status
-- NULL = file still in storage, non-NULL = file has been deleted
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'evaluation_documents' AND column_name = 'storage_deleted_at'
    ) THEN
        ALTER TABLE evaluation_documents
        ADD COLUMN storage_deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Partial index for efficient cleanup queries: find files eligible for deletion
CREATE INDEX IF NOT EXISTS idx_eval_docs_pending_cleanup
    ON evaluation_documents(created_at)
    WHERE storage_deleted_at IS NULL;
