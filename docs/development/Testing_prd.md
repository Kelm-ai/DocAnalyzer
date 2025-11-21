PRD — Minimal Testing Framework for Document Requirements Evaluation
1. Overview

We currently have an application that evaluates a PDF document against 38 requirements using parallel LLM calls. Each requirement call returns a categorical label: PASS, FAIL, or FLAG.

We need a minimal testing framework to:

Run repeated evaluations on a small, fixed eval set (subset of documents and requirements).

Log results for each run.

Compute repeatability per (document, requirement) and compare configurations (e.g., baseline vs new prompts).

This PRD describes a simple V1 centered around:

A hardcoded eval set in code.

A single eval_results table.

One script to run batches.

A few SQL queries to compute metrics.

2. Goals & Non-Goals
2.1 Goals

Be able to run N repeated evaluations over:

A small set of documents.

A subset of requirements.

A single configuration label (e.g., baseline_v1).

Log each individual evaluation into a database table.

Compute per (doc, requirement):

Mode (most frequent) label.

Repeatability (fraction of runs that match the mode label).

Compare two different batches/configurations on the same eval set to see which is more stable.

2.2 Non-Goals

No dynamic UI for managing eval sets.

No complex evaluation-set or config registries.

No automated orchestration or scheduling.

No advanced dashboards; basic SQL or notebook outputs are sufficient.

3. Eval Set & Configuration

The eval set and configuration will be defined in code.

3.1 Eval Set (hardcoded)

Create a configuration file (e.g., evalConfig.ts or .py) that defines:

Documents: subset of production documents to test.

export const EVAL_DOCS = [
  { id: "doc_1", path: "s3://path/to/doc1.pdf" },
  { id: "doc_2", path: "s3://path/to/doc2.pdf" },
  { id: "doc_3", path: "s3://path/to/doc3.pdf" },
];


Requirements: subset of requirement IDs to test (e.g., 10 of the 38).

export const EVAL_REQUIREMENTS = [
  "R1", "R2", "R3", "R4", "R5",
  "R6", "R7", "R8", "R9", "R10",
];


Number of runs per (doc, requirement):

export const NUM_RUNS = 5;

3.2 Configuration Label

Define a string that identifies the configuration under test (e.g., prompt version, doc loading mode):

export const CONFIG_LABEL = "baseline_v1";
// Later: "new_prompts_v2", "alt_doc_loading_v1", etc.

4. Data Model
4.1 eval_results Table

Create a single table to store every evaluation call:

create table eval_results (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,          -- e.g., "2025-11-20_baseline_v1"
  config_label text not null,      -- e.g., "baseline_v1"
  doc_id text not null,            -- matches EVAL_DOCS[id]
  requirement_id text not null,    -- matches EVAL_REQUIREMENTS entries
  run_index int not null,          -- 0..NUM_RUNS-1
  model_label text not null,       -- "PASS" | "FAIL" | "FLAG"
  raw_output jsonb,                -- full model response for debugging
  created_at timestamptz not null default now()
);


Notes:

batch_id groups all the results for one test run (e.g., all docs × requirements × runs for a given date/config).

config_label indicates which configuration was used (e.g., baseline vs new prompts).

run_index disambiguates repeated runs for the same (doc, requirement, batch).

4.2 (Optional) Ground Truth

If/when we want accuracy metrics, we can add a simple ground-truth table later:

create table eval_ground_truth (
  doc_id text not null,
  requirement_id text not null,
  label text not null,             -- "PASS" | "FAIL" | "FLAG"
  primary key (doc_id, requirement_id)
);


This is not required for the initial repeatability-only setup.

5. Execution Script
5.1 Responsibilities

Create a script (Node/TypeScript or Python) that:

Accepts a batch_id as an argument (or generates one).

Iterates over:

EVAL_DOCS

EVAL_REQUIREMENTS

run_index from 0 to NUM_RUNS - 1

For each combination, calls the existing evaluation pipeline.

Inserts a row into eval_results with:

batch_id

config_label

doc_id

requirement_id

run_index

model_label (parsed from the model output)

raw_output

5.2 Pseudo-code
import { EVAL_DOCS, EVAL_REQUIREMENTS, NUM_RUNS, CONFIG_LABEL } from "./evalConfig";
import { evaluateDocumentRequirement } from "./existingPipeline";
import { db } from "./db"; // DB client (e.g., Supabase or Postgres client)

async function runBatch(batchId: string) {
  for (const doc of EVAL_DOCS) {
    for (const requirementId of EVAL_REQUIREMENTS) {
      for (let runIndex = 0; runIndex < NUM_RUNS; runIndex++) {
        const result = await evaluateDocumentRequirement({
          docId: doc.id,
          requirementId,
          configLabel: CONFIG_LABEL,
        });

        // result.modelLabel should already be normalized to "PASS" | "FAIL" | "FLAG"
        await db
          .insert("eval_results", {
            batch_id: batchId,
            config_label: CONFIG_LABEL,
            doc_id: doc.id,
            requirement_id: requirementId,
            run_index: runIndex,
            model_label: result.modelLabel,
            raw_output: result.rawOutput,
          });
      }
    }
  }
  console.log(`Completed batch ${batchId}`);
}

// Usage: node runEvalBatch.js 2025-11-20_baseline_v1
const batchIdFromCli = process.argv[2];
const batchId = batchIdFromCli || `manual_${Date.now()}`;

runBatch(batchId).catch(console.error);


How it’s used:

For baseline config:

node runEvalBatch.js 2025-11-20_baseline_v1


After making changes (e.g., new prompts), update CONFIG_LABEL in code and run:

node runEvalBatch.js 2025-11-25_new_prompts_v2

6. Metrics & Analysis

All analysis is done via SQL (or a lightweight notebook) on eval_results.

6.1 Per-Pair Repeatability

Goal: For each (batch_id, doc_id, requirement_id) calculate:

Mode label (most common label across runs).

Repeatability = count(mode_label) / total_runs.

Example SQL:

with counts as (
  select
    batch_id,
    doc_id,
    requirement_id,
    model_label,
    count(*) as label_count
  from eval_results
  group by batch_id, doc_id, requirement_id, model_label
),
ranked as (
  select
    *,
    row_number() over (
      partition by batch_id, doc_id, requirement_id
      order by label_count desc
    ) as rn,
    sum(label_count) over (
      partition by batch_id, doc_id, requirement_id
    ) as total_runs
  from counts
)
select
  batch_id,
  doc_id,
  requirement_id,
  model_label as mode_label,
  label_count::float / total_runs::float as repeatability,
  total_runs
from ranked
where rn = 1
order by repeatability asc;


This gives a list of all evaluated (doc, requirement) pairs per batch, sorted by stability (lowest repeatability first).

6.2 Comparing Two Batches / Configurations

Goal: for the same eval set, compare repeatability between two batches (e.g., baseline vs new prompts).

Example SQL:

with per_pair as (
  select
    batch_id,
    doc_id,
    requirement_id,
    model_label,
    count(*) as label_count,
    sum(count(*)) over (
      partition by batch_id, doc_id, requirement_id
    ) as total_runs
  from eval_results
  group by batch_id, doc_id, requirement_id, model_label
),
per_pair_mode as (
  select
    batch_id,
    doc_id,
    requirement_id,
    model_label as mode_label,
    label_count::float / total_runs::float as repeatability
  from (
    select
      *,
      row_number() over (
        partition by batch_id, doc_id, requirement_id
        order by label_count desc
      ) as rn
    from per_pair
  ) t
  where rn = 1
)
select
  a.doc_id,
  a.requirement_id,
  a.repeatability as baseline_repeatability,
  b.repeatability as new_repeatability,
  (b.repeatability - a.repeatability) as delta
from per_pair_mode a
join per_pair_mode b
  on a.doc_id = b.doc_id
 and a.requirement_id = b.requirement_id
where a.batch_id = '2025-11-20_baseline_v1'
  and b.batch_id = '2025-11-25_new_prompts_v2'
order by delta asc;


This output shows:

For each (doc, requirement):

Baseline repeatability.

New config repeatability.

Delta (positive = improved, negative = worse).

You can manually eyeball:

“Are we more stable overall?”

“Which requirements got worse and need attention?”

7. Implementation Checklist

V1 is done when:

Eval config file exists with:

EVAL_DOCS, EVAL_REQUIREMENTS, NUM_RUNS, CONFIG_LABEL.

eval_results table exists in the DB and is writeable from the app.

Batch script:

Runs through all docs × requirements × runs.

Calls existing eval pipeline.

Inserts rows into eval_results.

SQL snippets for:

Per-pair repeatability.

Comparison between two batches.

We’ve successfully:

Run at least one baseline batch and one new config batch.

Generated comparison output and used it to judge if the change helped or hurt repeatability.