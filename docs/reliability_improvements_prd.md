# ISO 14971 Reliability Revamp — PRD & Implementation Plan

## 1. Background
The ISO 14971 compliance evaluator currently ingests uploaded PDFs/DOCX files, runs a vision-based LLM assessment per requirement, then stores the results in Supabase. While the system covers the full requirement set, repeated runs on the same document produce inconsistent PASS/FAIL/FLAG verdicts, limiting trust in the workflow.

Recent analysis identified four core upgrade areas:
1. Canonical document representation to keep whole-document awareness but reduce run-to-run drift.
2. Structured acceptance criteria to enable deterministic aggregation.
3. Prompting and model configuration improvements for predictable outputs.
4. Deterministic execution with resilient error handling and traceability.

This document captures the product requirements, detailed technical plan (including Azure configuration where applicable), and the engineering ticket breakdown needed to deliver those upgrades.

## 2. Problem Statement
Provide an evaluation flow that remains stable across reruns of the same document, produces transparent criterion-level rationales with reliable citations, and surfaces operational telemetry for auditing and quality control.

## 3. Goals & Non-Goals
**Goals**
- Reduce PASS/FAIL/FLAG variance to <5% swing across back-to-back runs on the same document.
- Produce criterion-level outputs backed by page-level citations.
- Deliver deterministic scoring and easily auditable evaluation provenance.
- Capture structured execution telemetry for reliability monitoring.

**Non-Goals**
- Replacing the OpenAI vision capability (we still attach the full document when needed).
- Delivering a full-fledged UI redesign.
- Modifying downstream consumers beyond what is required to ingest the new schema.

## 4. User Stories
1. *Compliance Analyst:* “When I re-run an evaluation on the same submission, I see identical PASS/FAIL outcomes unless the document or requirements changed.”
2. *QA Lead:* “I can view which acceptance criteria failed, with the exact page references cited by the model.”
3. *Ops Engineer:* “If several requirements error out, the run halts gracefully, alerts me, and records all configuration details needed to reproduce the issue.”
4. *Prompt Maintainer:* “When I adjust a prompt or model, regression tests on the gold-set documents highlight any clause-level drift before release.”

## 5. Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Canonical document artifact captured per upload (text + metadata + coverage map) | Must |
| FR2 | Acceptance criteria represented as discrete elements with severity and versioning | Must |
| FR3 | Evaluator returns structured per-criterion JSON with citations | Must |
| FR4 | Execution includes retries, circuit breakers, and detailed provenance logging | Must |
| FR5 | Supabase schema and dashboards reflect new scoring logic (FLAGGED separated) | Should |
| FR6 | Gold-set regression harness available in CI | Should |

## 6. Technical Implementation Plan

### 6.1 Canonical Document Representation
**Pipeline**
1. Upload triggers a document processing job.
2. Convert source file to markdown + JSON via an extraction service:
   - Preferred: Azure AI Document Intelligence (`prebuilt-layout`) for combined text+layout extraction.
   - Alternative fallback: open-source OCR/markdown converters if Azure is unavailable.
3. Enrich the artifact:
   - Capture page numbers, headings, tables, figures, and any image alt text.
   - Build overlapping coverage windows (e.g., 1500–2000 word segments) with structural labels.
4. Persist artifacts:
   - Store markdown/JSON in Supabase `processed_documents` with `canonical_artifact` (full structure) and `coverage_manifest` (window summaries).
   - Retain original file in storage (Azure Blob or S3 equivalent).

**Azure Configuration**
- **Services:**  
  - Azure Document Intelligence resource (Region close to primary users).  
  - Azure Storage account (`Standard_GRS`) with container `sc-documents` (input) and `sc-canonical` (processed outputs).  
- **Access:**  
  - Generate service principal with `DocumentIntelligence Contributor` and `Storage Blob Data Contributor` roles.  
  - Store credentials in Key Vault (optional) or `.env` (`AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `AZURE_STORAGE_CONNECTION_STRING`).  
- **Networking:**  
  - Enable private endpoints or IP allowlist for API servers.  
  - Set CORS to permit backend hostnames only.

**API Changes**
- Extend `/api/document-intelligence/markdown` to emit coverage manifest.
- Modify `VisionResponsesEvaluator` to load canonical bundle first, attach PDF only when clause flags or low confidence.

### 6.2 Structured Acceptance Criteria
**Database**
- New table `iso_requirement_criteria`:  
  ```
  id UUID PK  
  requirement_id TEXT FK -> iso_requirements(id)  
  criterion_order INT  
  description TEXT  
  severity TEXT CHECK (severity IN ('critical','major','minor'))  
  exemplar_evidence TEXT[]  
  counter_indicators TEXT[]  
  version INT  
  created_at TIMESTAMPTZ default now()  
  updated_at TIMESTAMPTZ default now()
  ```
- Add `current_version` column to `iso_requirements`.
- New table `requirement_criterion_evaluations` to store per-criterion verdicts.

**Data Migration**
- Script to explode existing acceptance_criteria strings into numbered criteria (manual curation likely required).
- Maintain change log (e.g., `iso_requirement_versions` table).

### 6.3 Prompting & Model Configuration
**Structured Responses**
- Configure `VisionResponsesEvaluator` to call `client.responses.parse()` with JSON schema:
  ```
  {
    "type": "object",
    "properties": {
      "requirement_id": {"type": "string"},
      "criteria": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "criterion_id": {"type": "string"},
            "status": {"enum": ["PASS","FAIL","FLAGGED","NOT_APPLICABLE"]},
            "confidence": {"type": "number"},
            "rationale": {"type": "string"},
            "citations": {"type": "array","items":{"type":"string"}}
          },
          "required": ["criterion_id","status","confidence","rationale"]
        }
      },
      "overall_summary": {"type": "string"}
    },
    "required": ["requirement_id","criteria"]
  }
  ```
- Add deterministic rubric:
  - System message: ISO 14971 auditor instructions.
  - User prompt: canonical text excerpt + clause metadata + criterion list.
  - Temperature = 0, top_p = 1.

**Self-Check Stage**
- After main response, run lightweight verifier prompt that inspects citations; downgrade any PASS lacking citations or containing page mismatches.

**Ensembling (Optional)**
- Run dual prompts (e.g., “structured” and “narrative”) for critical clauses. Reconcile: PASS only when both outputs agree.

### 6.4 Deterministic Execution & Error Handling
**Retry & Backoff**
- Wrap Responses calls with exponential backoff (e.g., 1s, 2s, 4s, max 3 retries). Honor `Retry-After` headers.
- Treat parse failures as retryable (switch to `parse` API first; if still failing, log raw response).

**Circuit Breaker**
- During evaluation, track consecutive errors. If errors ≥ threshold (configurable, e.g., 5), abort remaining requirements, mark evaluation `degraded`, and notify (Slack/email/Webhook).

**Provenance Logging**
- Persist with each criterion evaluation: prompt hash, schema version, model name, canonical excerpt IDs, PDF attachment pointer, retry count.
- Add `evaluation_runs` table summarizing configuration per run.

### 6.5 Scoring & Analytics
- Recompute document score:  
  - PASS fraction = passed critical criteria / total critical criteria.  
  - FLAGGED reported separately; not part of PASS numerator.  
- Update Supabase views and frontend to display criterion counts and explicit FLAGGED sections.
- Generate coverage dashboard: highlight sections without citations.

### 6.6 Regression Harness
- Curate gold-set documents with human-labeled clause outcomes.  
- Extend `test_evaluation` scripts to run N clauses (deterministic seeds) and compare outputs with stored ground truth.  
- Integrate into CI (e.g., GitHub Actions) to block prompt/model changes that exceed variance thresholds.

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Criterion decomposition requires domain expertise | Allocate SME time; start with critical clauses first |
| Increased token usage due to richer prompts | Monitor usage, trim context windows, use coverage windows instead of entire document when possible |
| Azure dependency adds latency | Cache canonical artifacts, parallelise extraction, or use fallback converters |
| Structured schema change affects current consumers | Provide migration scripts and dual-write during rollout |

## 8. Rollout Plan
1. **Phase 0 – Prep:** Stand up Azure Document Intelligence + storage, create schema migrations, prepare gold-set documents.  
2. **Phase 1 – Backend Foundations:** Implement canonical artifact pipeline and structured criteria storage; keep legacy evaluator running in parallel.  
3. **Phase 2 – Evaluator Upgrade:** Deploy structured Responses prompts, retries, and circuit breakers. Shadow-run evaluations, compare against legacy outputs.  
4. **Phase 3 – Cutover:** Switch API to new evaluator output, update frontend dashboards, deprecate legacy path.  
5. **Phase 4 – Observability:** Enable coverage and drift dashboards, tune thresholds, document playbooks.

## 9. Success Metrics
- Run-to-run PASS/FAIL variance on gold-set docs ≤ 5%.
- ≥ 95% of PASS verdicts include human-verified citations.
- Error-induced evaluation aborts reduced by ≥ 80%.
- Coverage dashboard shows ≥ 90% document coverage by citations for compliant submissions.

---

## 10. Ticket Breakdown
1. **TKT-001:** Provision Azure Document Intelligence + Storage, set up credentials and network rules.  
2. **TKT-002:** Implement document processing service to create canonical markdown/coverage manifests; store results in Supabase.  
3. **TKT-003:** Schema migration — add `iso_requirement_criteria`, `requirement_criterion_evaluations`, and related indexes/views.  
4. **TKT-004:** Data curation — decompose acceptance_criteria into criterion records with severity metadata.  
5. **TKT-005:** Update evaluator to load canonical artifacts, build coverage windows, and attach vision file only when needed.  
6. **TKT-006:** Implement structured Responses prompt with JSON schema and integrate `client.responses.parse`.  
7. **TKT-007:** Add self-check verifier, citation validation, and deterministic aggregation rules.  
8. **TKT-008:** Introduce retry/backoff, circuit breaker logic, and provenance logging across evaluation runs.  
9. **TKT-009:** Adjust Supabase reports/frontend to display criterion-level results, revised scoring, and FLAGGED separation.  
10. **TKT-010:** Build regression harness with gold-set documents, integrate into CI, and document release checklist.
