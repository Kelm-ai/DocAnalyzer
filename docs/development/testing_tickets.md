Testing Framework Implementation Tickets (Consolidated)

1) Hardcode minimal eval config for repeatability runs
- Objective: Add a single source of truth for the V1 eval set and config label used by the testing framework.
- Scope: Create a config module (TypeScript or Python) defining `EVAL_DOCS`, `EVAL_REQUIREMENTS`, `NUM_RUNS`, `CONFIG_LABEL`; document placeholders for doc IDs/paths and requirement IDs (subset of the 38); export values directly consumable by the batch runner.
- Deliverables: Config file (e.g., `src/eval/evalConfig.ts` or `src/eval/eval_config.py`) with sample values and comments on inserting real doc paths/IDs; brief inline docstring/README note on changing the config label for new prompt versions.
- Acceptance Criteria: All four constants importable without extra parsing; `NUM_RUNS` integer; `EVAL_DOCS` entries include `id` and `path`; `EVAL_REQUIREMENTS` list of IDs; `CONFIG_LABEL` string; changing `CONFIG_LABEL` alone stamps future runs.
- Open Questions: Confirm canonical doc IDs/paths for the eval subset and whether S3 URIs are acceptable.

2) Create `eval_results` table for per-call logging
- Objective: Persist every evaluation call (doc x requirement x run) with config context to enable repeatability analysis.
- Scope: Add migration/DDL to create `eval_results` with columns `id uuid primary key default gen_random_uuid()`, `batch_id text not null`, `config_label text not null`, `doc_id text not null`, `requirement_id text not null`, `run_index int not null`, `model_label text not null`, `raw_output jsonb`, `created_at timestamptz not null default now()`; ensure UUID default works (`pgcrypto` or `uuid_generate_v4()`); add index/constraint to prevent duplicates if desired.
- Deliverables: Migration/DDL file ready for the current DB workflow; notes on UUID extension requirements and rerun/rollback steps if migrations are used.
- Acceptance Criteria: Table exists and is writable from the app’s DB client; inserting a sample row with required fields succeeds; querying a batch returns distinct rows across runs/requirements; PK and uniqueness constraints enforced as designed.
- Open Questions: Should we enforce uniqueness on `(batch_id, doc_id, requirement_id, run_index)` to guard against retries, or allow duplicates and dedupe in analysis?

3) Implement batch evaluation runner and logging
- Objective: Provide a script to run repeated evaluations for the hardcoded eval set and log every call into `eval_results`.
- Scope: Create a CLI script (`runEvalBatch`, Node/TS or Python) accepting optional `batch_id` (`manual_<timestamp>` fallback); import eval config and iterate `EVAL_DOCS` x `EVAL_REQUIREMENTS` x `run_index in [0..NUM_RUNS-1]`; call `evaluateDocumentRequirement`, parse `modelLabel`, insert row into `eval_results` with `batch_id`, `config_label`, `doc_id`, `requirement_id`, `run_index`, `model_label`, `raw_output`; add minimal logging and defined error handling; document usage examples (`node runEvalBatch.js 2025-11-20_baseline_v1`).
- Deliverables: Script under a discoverable path (e.g., `scripts/runEvalBatch.ts` or `tools/run_eval_batch.py`) wired to the existing pipeline and DB client; README/comment block for env requirements, setting/overriding `batch_id`, and changing `CONFIG_LABEL`.
- Acceptance Criteria: Running the script produces `NUM_RUNS * |EVAL_DOCS| * |EVAL_REQUIREMENTS|` rows in `eval_results` for a given `batch_id`; `config_label` matches the config constant; failure behavior defined (abort vs continue) and success logs completion of the batch ID.
- Open Questions: Should failures short-circuit or be retried/skipped with markers? Is parallelism desired, or keep V1 sequential?

4) Ship repeatability and batch-comparison SQL
- Objective: Provide ready-to-run SQL to measure per-pair repeatability and compare two batches/configurations over the same eval set.
- Scope: Add SQL/README artifact containing (a) per `(batch_id, doc_id, requirement_id)` mode label and repeatability (mode frequency / total runs); (b) batch comparison query joining two `batch_id`s to show repeatability deltas per `(doc_id, requirement_id)`; include guidance on parameterizing batch IDs and expected inputs/outputs; note assumptions about uniqueness.
- Deliverables: SQL file (or markdown with SQL blocks) e.g., `docs/development/eval_metrics_queries.sql` or `.md` with both queries ready to paste; brief instructions for swapping batch IDs and sorting/filtering results.
- Acceptance Criteria: Queries run against the `eval_results` schema; per-pair repeatability returns mode label, repeatability (float), total run count; comparison query returns baseline repeatability, new repeatability, delta for shared pairs ordered by delta.
- Open Questions: Should we materialize these queries as views for convenience, or keep them as ad-hoc snippets in V1?
