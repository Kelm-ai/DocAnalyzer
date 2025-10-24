# ISO 14971 Compliance System — Reliability Review

## Overview
Your current end-to-end pipeline (document intake → file upload to the vision evaluator → Supabase) produces useful results but shows significant volatility in PASS/FAIL/FLAG outcomes across runs of the same document. This review inventories the main reliability risks and lays out pragmatic upgrades that keep whole-document awareness while tightening determinism, monitoring, and auditability.

## Key Reliability Risks
- **Whole-document reasoning without structure:** The vision evaluator hands each requirement a pristine PDF plus a long textual instruction. Without any staging or interim summaries, the model must rediscover all relevant evidence per call, making results sensitive to sampling noise and latent retrieval inside the model (`api/vision_responses_evaluator.py:181`).
- **Free-form acceptance criteria:** Requirements pack all acceptance guidance into strings, so the prompt can’t reason criterion-by-criterion. When evidence is mixed, the model drifts toward FLAGGED rather than showing which sub-criterion failed (`scripts/requirements.json:6`, `schema.sql:5`).
- **Fragile parsing and error handling:** Responses are accepted via `json.loads` on raw output. Any format drift turns into an ERROR record, while rate limits or transient API issues have no retry/backoff, inflating run-to-run variance (`api/vision_responses_evaluator.py:242`, `api/vision_responses_evaluator.py:292`).
- **Scoring ambiguity:** Downstream metrics treat FLAGGED the same as PASS/FAIL, and the schema still expects a `PARTIAL` status. This warps overall compliance scores and makes clause-level regressions hard to detect (`api/vision_responses_evaluator.py:395`, `schema.sql:42`).
- **Limited regression coverage:** Only three clauses are exercised regularly through the test harness, so you lack automated detection when prompt or ingestion tweaks shift pass/fail balance (`test_evaluation/test_evaluator.py:1`).

## Recommended Improvements

### 1. Canonical Document Representation (Preserve Full Context)
- Convert each PDF/DOCX into a canonical markdown or JSON bundle with page anchors, table extraction, and metadata using an on-demand processor (e.g., pdfminer/docx + table parsing, or a hosted OCR service). Persist this artifact alongside the original file so every downstream step can see “the whole document” deterministically without depending on live retrieval.
- Layer a *coverage map* on top of that bundle: break the document into overlapping sections (e.g., 1–2 page windows) and capture headings, page numbers, and other structural cues. Coverage tracking lets you measure which parts were reviewed while still allowing the model to reference the entire document when needed.
- Keep the raw file attachment in the evaluation loop for vision reasoning. Feed the canonical bundle as structured text context, and attach the PDF only when the clause or confidence signals that visual inspection is required. This hybrid keeps whole-document appreciation while avoiding repeated blind searches through a monolithic prompt.

### 2. Structured Acceptance Criteria
- Normalize ISO requirements into two tables: `iso_requirements` (metadata) and `iso_requirement_criteria` (one row per acceptance criterion with criticality, exemplar evidence, and “negative” cues). This enables deterministic aggregation (e.g., FAIL if any critical criterion fails; FLAGGED only when the model is uncertain on non-critical items).
- Version the requirement + criterion definitions so you can audit how wording changes affect model behaviour. Store reviewer overrides with the exact criterion IDs for learning loops.

### 3. Prompting & Model Configuration
- Move to schema-enforced Responses calls: set `temperature=0`, supply an explicit JSON schema, and add refusal clauses if citations are missing. Require the model to emit a verdict per criterion, cite page/section for each PASS, and summarise evidence concisely.
- Add a self-check stage: after generating verdicts, prompt the model (or a second lightweight verifier) to confirm citation relevance and to downgrade PASS to FLAGGED if evidence quality is weak.
- For clauses that rarely change, consider ensembling (two seeds or two complementary prompts). Only accept PASS when both agree; otherwise, downgrade and route for human review.

### 4. Deterministic Execution & Error Handling
- Wrap each Responses API call in retry/backoff with jitter, capturing rate-limit headers so you throttle proactively instead of failing requirement-level evaluations.
- Record prompt hash, model deployment, and canonical evidence IDs with every requirement evaluation. If volatility appears, you can immediately diff runs by input alterations rather than hunting through logs.
- Implement circuit breakers: if more than *N* requirements error in a single document run, halt the batch, mark the evaluation as “degraded,” and alert operators instead of returning misleading partial scores.

### 5. Scoring & Analytics
- Recompute document scores from structured criterion outputs: aggregate failures by clause, weight high-risk sections (e.g., Clause 4) more heavily, and report PASS/FAIL/FLAGGED counts separately. Keep FLAGGED out of the numerator until a human confirms.
- Track coverage metrics (percentage of document sections with cited evidence). Highlight gaps when an evaluation relies on a narrow slice of the document, even if all outcomes are PASS.
- Add drift dashboards fed by Supabase views that trend clause-level pass rates, average confidence, and citation density over time. Flag any requirement where rates shift beyond predefined thresholds.

### 6. Regression & Feedback Loop
- Assemble a labelled “gold set” of documents with human-reviewed verdicts across clauses. Run this suite nightly (even on a subset of criteria) to catch volatility early.
- Expand the test harness to generate synthetic edge cases (missing signatures, conflicting tables, image-only sections). Use these to probe prompt robustness before shipping prompt/model changes.
- Capture operator feedback in dedicated tables (e.g., `requirement_evaluation_feedback`) and rank requirements by “disagreement rate.” Feed these cases back into prompt exemplars or fine-tuning corpora.

### 7. Operational Practices
- Promote configuration-as-code: keep prompt text, system instructions, criterion weighting, and retry settings under version control with change reviews.
- Introduce shadow evaluations during major changes: run the revised prompt/model in parallel on a sample of production documents, compare outputs automatically, and only promote after variance stabilises.
- Surface evaluation telemetry (latency, error rate, token usage) in a monitoring stack so reliability regressions are obvious during deployment windows.

## Next Steps
1. Prototype the structured criterion schema and adjust the evaluator to emit per-criterion results while still attaching the entire document context.
2. Implement the canonical document pipeline using Document Intelligence output + coverage mapping, then rewire the vision evaluator to consume these deterministic artefacts before falling back to raw PDF.
3. Stand up the labelled gold-set regression harness and integrate it into CI to measure volatility before and after each change.

These upgrades preserve whole-document awareness while reducing the randomness inherent in single-shot vision prompts, giving you clearer insights into clause-level reliability and actionable levers to keep the system stable over time.
