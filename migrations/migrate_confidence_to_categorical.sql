-- Migration: Convert confidence from numeric to categorical
-- Description: Add confidence_level column, backfill from confidence_score, and optionally remove old column
--
-- This migration can be run safely multiple times (idempotent)
--
-- Run this in your Supabase SQL Editor:
-- Project URL: https://supabase.com/dashboard/project/qtuxwngyiilpntbungul

-- Step 1: Add the new confidence_level column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirement_evaluations'
        AND column_name = 'confidence_level'
    ) THEN
        ALTER TABLE requirement_evaluations
        ADD COLUMN confidence_level TEXT NOT NULL DEFAULT 'low'
        CHECK (confidence_level IN ('low', 'medium', 'high'));

        RAISE NOTICE 'Added confidence_level column';
    ELSE
        RAISE NOTICE 'confidence_level column already exists';
    END IF;
END $$;

-- Step 2: Backfill confidence_level from existing confidence_score values
-- Uses thresholds: >= 0.8 → high, >= 0.5 → medium, < 0.5 → low
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirement_evaluations'
        AND column_name = 'confidence_score'
    ) THEN
        UPDATE requirement_evaluations
        SET confidence_level = CASE
            WHEN confidence_score >= 0.8 THEN 'high'
            WHEN confidence_score >= 0.5 THEN 'medium'
            ELSE 'low'
        END
        WHERE confidence_score IS NOT NULL
        AND confidence_level = 'low';  -- Only update rows that still have the default value

        RAISE NOTICE 'Backfilled confidence_level from confidence_score';
    ELSE
        RAISE NOTICE 'confidence_score column does not exist, skipping backfill';
    END IF;
END $$;

-- Step 3: (Optional) Remove the old confidence_score column
-- UNCOMMENT THE LINES BELOW ONLY AFTER:
-- 1. Verifying the backfill completed successfully
-- 2. Confirming all application code has been updated to use confidence_level
-- 3. Testing that the application works without the confidence_score column

-- DO $$
-- BEGIN
--     IF EXISTS (
--         SELECT 1 FROM information_schema.columns
--         WHERE table_name = 'requirement_evaluations'
--         AND column_name = 'confidence_score'
--     ) THEN
--         ALTER TABLE requirement_evaluations DROP COLUMN confidence_score;
--         RAISE NOTICE 'Removed confidence_score column';
--     ELSE
--         RAISE NOTICE 'confidence_score column already removed';
--     END IF;
-- END $$;

-- Verification query: Check the distribution of confidence levels
SELECT
    confidence_level,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM requirement_evaluations
GROUP BY confidence_level
ORDER BY
    CASE confidence_level
        WHEN 'low' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'high' THEN 3
    END;

-- Verification query: Show any rows that might need attention
-- (This query will fail if confidence_score column has already been removed)
-- SELECT
--     id,
--     requirement_id,
--     confidence_level,
--     confidence_score,
--     status
-- FROM requirement_evaluations
-- WHERE confidence_score IS NOT NULL
-- LIMIT 10;
