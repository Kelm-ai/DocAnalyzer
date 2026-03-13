-- Migration: Add evidence_metadata column to requirement_evaluations
-- Adds structured JSONB evidence with page/section/document metadata for inline citations.
-- Idempotent-safe (uses IF NOT EXISTS guard).
-- evidence_snippets TEXT[] is preserved for backward compatibility.

-- ============================================================================
-- STEP 1: Add evidence_metadata column
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirement_evaluations' AND column_name = 'evidence_metadata'
    ) THEN
        ALTER TABLE requirement_evaluations ADD COLUMN evidence_metadata JSONB;
    END IF;
END $$;

-- ============================================================================
-- Migration complete!
--
-- Summary of changes:
-- 1. Added 'evidence_metadata' JSONB column to requirement_evaluations
--    Each item shape: {"text": str, "page": int|null, "section": str|null,
--                      "document_name": str|null, "document_index": int|null}
-- 2. Old rows retain NULL in evidence_metadata — frontend falls back to
--    plain evidence_snippets rendering for those.
--
-- Next steps after running this migration:
-- 1. Deploy updated API (evidence_metadata populated on new evaluations)
-- 2. Run a new evaluation to verify evidence_metadata is stored correctly
-- ============================================================================
