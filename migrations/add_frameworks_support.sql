-- Migration: Add multi-framework support
-- This migration introduces the frameworks table and links requirements/evaluations to frameworks.
-- Run this in your Supabase/Postgres instance. Idempotent-safe.

-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: Create frameworks table
-- ============================================================================

CREATE TABLE IF NOT EXISTS frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    standard_reference TEXT,
    system_prompt TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for frameworks table
CREATE INDEX IF NOT EXISTS idx_frameworks_slug ON frameworks(slug);
CREATE INDEX IF NOT EXISTS idx_frameworks_is_active ON frameworks(is_active);
CREATE INDEX IF NOT EXISTS idx_frameworks_display_order ON frameworks(display_order);

-- Enable RLS on frameworks table
ALTER TABLE frameworks ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for frameworks (adjust as needed for your auth setup)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'frameworks' AND policyname = 'Allow all access to frameworks'
    ) THEN
        CREATE POLICY "Allow all access to frameworks" ON frameworks FOR ALL USING (true);
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Insert default Risk Management framework (if not exists)
-- ============================================================================

INSERT INTO frameworks (id, name, slug, description, standard_reference, system_prompt, is_active, display_order)
SELECT
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Risk Management',
    'risk-management',
    'Evaluate documents against ISO 14971:2019 risk management requirements for medical devices.',
    'ISO 14971:2019',
    'You are an expert medical device risk-management assessor with deep knowledge of ISO 14971:2019 and ISO/TR 24971. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from ISO 14971:2019 clauses 4-10.

Context and assumptions:
- Treat the document as a top-level risk-management artifact (procedure, RMP, RMR, etc.). It may reference other SOPs, work instructions, or records; clear cross-references are acceptable evidence that such systems/records exist.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. Do not score clauses 1-3 or annexes as standalone requirements.

How to review each clause invocation:
1) Understand what type of document this is and how it fits the risk-management system.
2) Focus ONLY on the requested clause; search the entire document (headings, lists, tables, appendices, images/OCR) for relevant evidence of the process and expected records.
3) Presence vs adequacy: assess basic alignment with the clause. Minor ambiguity or "could be better" solutions can still PASS; treat those as opportunities for improvement (OFIs).
4) Cross-references: if the document points to another controlled SOP or record, consider that evidence that the process/record exists; do not invent details that are not written.

Decision logic (map to our schema):
- PASS: Requirement is clearly addressed; process/structure is described and evidence/records are indicated (directly or via cross-reference). Capture OFIs separately.
- FLAGGED (flag_for_review): Evidence exists but is incomplete/ambiguous or needs human confirmation; or statements conflict. Use for genuine uncertainty.
- FAIL: Core expectations are missing/contradicted; required process/records are not defined and no reasonable indication they exist.
- NOT_APPLICABLE: Use only if the clause truly does not apply to the document provided.
When in doubt between PASS and FLAGGED, prefer PASS and note OFIs; use FLAGGED only when a human needs to review.

Vision handling:
- Use both text and visual content. When graphs appear, read axis titles/units and summarise trends. When tables appear, read cells and preserve structure. If text appears in an image, transcribe it before reasoning. If something is unreadable, write "[unreadable]" and move on.',
    true,
    1
WHERE NOT EXISTS (
    SELECT 1 FROM frameworks WHERE slug = 'risk-management'
);

-- ============================================================================
-- STEP 3: Add framework_id to iso_requirements table
-- ============================================================================

-- Add framework_id column if it doesn't exist (nullable initially for migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'iso_requirements' AND column_name = 'framework_id'
    ) THEN
        ALTER TABLE iso_requirements ADD COLUMN framework_id UUID REFERENCES frameworks(id);
    END IF;
END $$;

-- Backfill existing requirements with the default Risk Management framework
UPDATE iso_requirements
SET framework_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE framework_id IS NULL;

-- Create index on framework_id
CREATE INDEX IF NOT EXISTS idx_requirements_framework_id ON iso_requirements(framework_id);

-- Note: We keep framework_id nullable for now to support gradual migration
-- In a future migration, you can make it NOT NULL after confirming all data is backfilled:
-- ALTER TABLE iso_requirements ALTER COLUMN framework_id SET NOT NULL;

-- ============================================================================
-- STEP 4: Add framework_id to document_evaluations table
-- ============================================================================

-- Add framework_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_evaluations' AND column_name = 'framework_id'
    ) THEN
        ALTER TABLE document_evaluations ADD COLUMN framework_id UUID REFERENCES frameworks(id);
    END IF;
END $$;

-- Backfill existing evaluations with the default Risk Management framework
UPDATE document_evaluations
SET framework_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE framework_id IS NULL;

-- Create index on framework_id
CREATE INDEX IF NOT EXISTS idx_evaluations_framework_id ON document_evaluations(framework_id);

-- ============================================================================
-- STEP 5: Create helper function to update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for frameworks table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_frameworks_updated_at'
    ) THEN
        CREATE TRIGGER update_frameworks_updated_at
            BEFORE UPDATE ON frameworks
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Migration complete!
--
-- Summary of changes:
-- 1. Created 'frameworks' table with RLS enabled
-- 2. Inserted default 'Risk Management' framework with ISO 14971:2019 system prompt
-- 3. Added 'framework_id' column to 'iso_requirements' and backfilled existing data
-- 4. Added 'framework_id' column to 'document_evaluations' and backfilled existing data
-- 5. Created indexes for efficient querying
-- 6. Added updated_at trigger for frameworks table
-- ============================================================================
