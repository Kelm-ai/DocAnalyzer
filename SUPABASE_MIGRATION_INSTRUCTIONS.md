# Supabase Migration Instructions

## Quick Start

Run the migration script in your Supabase SQL Editor to add the `confidence_level` column and backfill existing data.

**Project URL**: https://supabase.com/dashboard/project/qtuxwngyiilpntbungul

## Migration Overview

This migration converts confidence scores from numeric (0.0-1.0 float) to categorical ("low", "medium", "high") text values.

### What the Migration Does

1. **Adds new column**: `confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('low','medium','high'))`
2. **Backfills data**: Converts existing `confidence_score` values using thresholds:
   - `confidence_score >= 0.8` → `confidence_level = 'high'`
   - `confidence_score >= 0.5` → `confidence_level = 'medium'`
   - `confidence_score < 0.5` → `confidence_level = 'low'`
3. **Optional cleanup**: Can remove the old `confidence_score` column (commented out by default)

## Step-by-Step Instructions

### Step 1: Open Supabase SQL Editor

1. Navigate to: https://supabase.com/dashboard/project/qtuxwngyiilpntbungul
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"

### Step 2: Run the Migration Script

Copy and paste the contents of [`migrations/migrate_confidence_to_categorical.sql`](migrations/migrate_confidence_to_categorical.sql) into the SQL editor and click "Run".

The script is idempotent - it's safe to run multiple times.

### Step 3: Verify the Migration

After running the migration, check the results using the verification query included at the end of the migration script:

```sql
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
```

Expected output:
```
confidence_level | count | percentage
-----------------|-------|------------
low              |   X   |   XX.XX
medium           |   X   |   XX.XX
high             |   X   |   XX.XX
```

### Step 4: Test the Application

1. Create a new evaluation through the frontend
2. Check that confidence levels are saved correctly
3. Verify that old evaluations (with numeric scores) still display correctly
4. Confirm the API responses include both `confidence_level` and `confidence_score`

### Step 5: (Optional) Remove Legacy Column

**Only do this after confirming everything works correctly!**

After you've verified that:
- The application is working correctly
- All old data has been backfilled
- You've tested both new and old evaluations

You can optionally remove the `confidence_score` column by:

1. Open the migration script again
2. Uncomment the lines in Step 3 (lines starting with `-- DO $$`)
3. Run the script again

**Note**: Keeping both columns doesn't cause any issues, so this step is optional.

## Rollback (If Needed)

If you need to rollback the migration:

```sql
-- Remove the confidence_level column
ALTER TABLE requirement_evaluations DROP COLUMN IF EXISTS confidence_level;

-- The application will automatically fall back to using confidence_score
```

## Troubleshooting

### Error: "column confidence_level already exists"

This is normal - the script is idempotent and will skip adding the column if it already exists.

### Error: "column confidence_score does not exist"

This means the migration has already been completed and the old column was removed. No action needed.

### Error: "violates check constraint"

This shouldn't happen with the migration script, but if you manually insert data, make sure `confidence_level` is one of: 'low', 'medium', 'high'.

### Data not backfilled correctly

Re-run the migration script. The UPDATE statement in Step 2 only updates rows where `confidence_level = 'low'` (the default), so it won't overwrite manually-set values.

## Support

If you encounter any issues:
1. Check the Supabase logs for detailed error messages
2. Verify the script syntax was copied correctly
3. Review the [CONFIDENCE_MIGRATION_SUMMARY.md](CONFIDENCE_MIGRATION_SUMMARY.md) for technical details
4. Create an issue at https://github.com/anthropics/claude-code/issues if needed

## Post-Migration Cleanup

After successful migration and verification:
1. Consider removing the old `confidence_score` column (optional)
2. Update any custom queries or reports to use `confidence_level` instead of `confidence_score`
3. Archive any old documentation that references numeric confidence scores
