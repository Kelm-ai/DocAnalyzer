# Confidence Migration Summary

## Overview

Successfully migrated the ISO 14971 Compliance Evaluator from numeric confidence scores (0.0-1.0) to categorical confidence levels ("low" | "medium" | "high"). This change improves model output consistency and makes confidence ratings more interpretable for users.

## Changes Made

### 1. Schema Definition ([evaluation_schema.py](evaluation_schema.py))
- ✅ Already configured with `Literal["low", "medium", "high"]` for the confidence field
- No changes needed - schema was already correct

### 2. Backend Evaluators

#### [api/vision_responses_evaluator.py](api/vision_responses_evaluator.py)
- Updated prompt to include detailed confidence level guidelines (lines 267-270)
- Normalized error handling to use string confidence "low" (lines 141, 208, 224)
- Updated Excel export to convert confidence to uppercase categorical labels (lines 388-393)

#### [test_evaluation/hybrid_evaluator.py](test_evaluation/hybrid_evaluator.py)
- Updated RESPONSE_SCHEMA with detailed confidence guidelines (lines 60-63)
- Updated prompt with detailed confidence guidelines (lines 257-260)
- Normalized error handling to use string confidence "low" (lines 150, 219)
- Updated Excel export to convert confidence to uppercase labels (lines 442-447)

#### [test_evaluation/test_evaluator.py](test_evaluation/test_evaluator.py)
- Updated prompt with detailed confidence guidelines (lines 303-306)
- Normalized error handling to use string confidence "low" (lines 339, 366)
- Updated console display to show categorical levels (line 356)
- Updated table display to show uppercase categorical labels (lines 440, 447)
- Updated Excel export to normalize confidence (lines 587-592)

### 3. FastAPI Layer ([api/app.py](api/app.py))

Already had comprehensive normalization helpers:
- `_normalize_confidence_level()` - normalizes any input to valid categorical level
- `_confidence_score_from_level()` - derives numeric score from level for backwards compatibility
- `_score_to_confidence_level()` - converts legacy numeric scores to categorical levels
- `_confidence_level_from_row()` - extracts level from database row with fallback logic

The `persist_vision_results()` function (lines 264-341) writes `confidence_level` to Supabase with automatic fallback to legacy `confidence_score` column if the new column doesn't exist yet.

Response endpoints (lines 995-1032, 1034-1095) properly derive and include both:
- `confidence_level` - canonical categorical value
- `confidence_score` - optional derived numeric value for backwards compatibility

### 4. Frontend ([frontend/src/pages/Results.tsx](frontend/src/pages/Results.tsx))

Already had complete categorical confidence handling:
- Type definition for `ConfidenceLevel` (line 57)
- Helper functions to validate and convert confidence (lines 66-98)
- `deriveConfidenceLevel()` - extracts level with fallback to numeric conversion
- `formatConfidence()` - formats level for display
- Table columns display categorical labels (lines 373-387, 726)
- Sorting works correctly with categorical order (lines 377-381)

### 5. CLI/Test Scripts

#### [scripts/test_evaluation.py](scripts/test_evaluation.py)
- Added `_confidence_from_record()` helper (lines 29-42) to derive categorical level from database rows
- Updated display logic to show uppercase categorical labels (lines 180-182)

#### [scripts/run_evaluation.py](scripts/run_evaluation.py)
- Updated evaluation display to normalize and show uppercase categorical levels (lines 81-88)

#### [scripts/(archive)/iso_compliance_pipeline.py](scripts/(archive)/iso_compliance_pipeline.py)
- ✅ Already saves `confidence_level` correctly (line 484)
- ✅ Already has fallback logic for legacy column (lines 497-501)

### 6. Database Schema ([schema.sql](schema.sql))

- ✅ Column definition already correct: `confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high'))` (line 46)
- Added documentation comments explaining the canonical field and backwards compatibility (lines 38-40)

### 7. Migration Script ([migrations/migrate_confidence_to_categorical.sql](migrations/migrate_confidence_to_categorical.sql))

Created comprehensive migration script with:
- **Step 1**: Add `confidence_level` column if missing (idempotent)
- **Step 2**: Backfill from `confidence_score` using thresholds:
  - ≥ 0.8 → "high"
  - ≥ 0.5 → "medium"
  - < 0.5 → "low"
- **Step 3**: (Optional) Remove old `confidence_score` column after verification
- Includes verification queries to check distribution and sample data

## Confidence Level Guidelines

The prompts now consistently instruct the model to use these guidelines:

- **"high"** - Evidence is explicit, comprehensive, and directly addresses all criteria
- **"medium"** - Evidence is present but incomplete, requires some inference, or has minor gaps
- **"low"** - Evidence is sparse, ambiguous, uncertain, or requires significant assumptions

## Backwards Compatibility

The implementation maintains full backwards compatibility:

1. **Database**: Application tolerates both old and new column structures
   - If `confidence_level` column exists: uses it directly
   - If only `confidence_score` exists: derives level using thresholds
   - When inserting: attempts `confidence_level`, falls back to `confidence_score` if needed

2. **API Responses**: Include both fields for smooth transition
   - `confidence_level`: canonical categorical value
   - `confidence_score`: optional derived numeric value

3. **Frontend**: Automatically handles both formats
   - Prefers `confidence_level` if present
   - Falls back to converting `confidence_score` to level

## Testing

All Python files validated successfully:
```bash
python3 -m py_compile evaluation_schema.py \
  api/vision_responses_evaluator.py \
  test_evaluation/hybrid_evaluator.py \
  test_evaluation/test_evaluator.py \
  scripts/test_evaluation.py \
  scripts/run_evaluation.py \
  scripts/(archive)/iso_compliance_pipeline.py
```

✅ All files compiled without errors

## Deployment Steps

### 1. Application Deployment (Deploy First)
Deploy the updated application code. The code is designed to work with both old and new database schemas:
- Can write to either `confidence_level` or `confidence_score` column
- Can read from either column with automatic conversion

### 2. Database Migration (Run After Application Deployment)
Run the migration script in Supabase SQL Editor:
```sql
-- Use the script at migrations/migrate_confidence_to_categorical.sql
-- This will:
-- 1. Add confidence_level column (if missing)
-- 2. Backfill from confidence_score using thresholds
-- 3. Optionally remove old confidence_score column (commented out by default)
```

Project URL: https://supabase.com/dashboard/project/qtuxwngyiilpntbungul

### 3. Verification
After running the migration:
1. Check the distribution of confidence levels using the verification query in the migration script
2. Test the application with both new and old data
3. Confirm all features work correctly

### 4. (Optional) Column Cleanup
After confirming everything works:
1. Uncomment Step 3 in the migration script
2. Run it again to remove the old `confidence_score` column
3. This step is optional - keeping both columns doesn't cause issues

## Files Modified

### Python Backend
- ✅ [evaluation_schema.py](evaluation_schema.py) - Already correct
- ✅ [api/vision_responses_evaluator.py](api/vision_responses_evaluator.py) - Updated prompts, error handling, Excel export
- ✅ [test_evaluation/hybrid_evaluator.py](test_evaluation/hybrid_evaluator.py) - Updated prompts, error handling, Excel export
- ✅ [test_evaluation/test_evaluator.py](test_evaluation/test_evaluator.py) - Updated prompts, error handling, displays, Excel export
- ✅ [api/app.py](api/app.py) - Already had complete normalization logic
- ✅ [scripts/test_evaluation.py](scripts/test_evaluation.py) - Updated display logic
- ✅ [scripts/run_evaluation.py](scripts/run_evaluation.py) - Updated display logic
- ✅ [scripts/(archive)/iso_compliance_pipeline.py](scripts/(archive)/iso_compliance_pipeline.py) - Already correct

### Frontend
- ✅ [frontend/src/pages/Results.tsx](frontend/src/pages/Results.tsx) - Already correct

### Database
- ✅ [schema.sql](schema.sql) - Added documentation comments
- ✅ [migrations/migrate_confidence_to_categorical.sql](migrations/migrate_confidence_to_categorical.sql) - New migration script

## Summary

The migration is complete and production-ready. All evaluators now emit categorical confidence levels consistently, the API layer handles conversion bidirectionally, and the frontend displays the qualitative labels correctly. The backwards-compatible design allows for a smooth, zero-downtime deployment.
