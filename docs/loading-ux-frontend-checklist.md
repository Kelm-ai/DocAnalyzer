# Loading & Progress UX: Frontend Implementation Reference

## Component Inventory

| Component | File | Purpose | State Machine |
|-----------|------|---------|---------------|
| DocumentUploader | `frontend/src/components/upload/DocumentUploader.tsx` | Single-doc upload + progress | `pending` → `uploading` → `processing` → `success` \| `error` |
| MultiDocumentUploader | `frontend/src/components/upload/MultiDocumentUploader.tsx` | Multi-doc upload + progress | `idle` → `uploading` → `summarizing` → `processing` → `complete` \| `error` |
| DropZone | `frontend/src/components/upload/DropZone.tsx` | File selection UI | `pending` \| `uploading` \| `summarizing` \| `ready` \| `error` |
| EvaluationStatus | `frontend/src/components/evaluation/EvaluationStatus.tsx` | Evaluations list table | Stateless — reads from API on interval |

---

## API Types

### EvaluationStatus (`frontend/src/lib/api.ts`)

```typescript
export interface EvaluationStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
  document_name: string;
  framework_id?: string;
  progress?: number;                    // UNUSED — UI reads metadata.progress_percent instead
  created_at: string;
  completed_at?: string;
  overall_compliance_score?: number;
  requirements_passed?: number;
  requirements_failed?: number;
  requirements_flagged?: number;
  requirements_partial?: number;
  requirements_na?: number;
  error_message?: string;
  total_requirements?: number;
  supporting_docs_count?: number;
  summaries_status?: 'pending' | 'generating' | 'completed' | 'failed' | 'not_required';
  metadata?: {
    phase?: string;                     // 'pending' | 'uploading_to_provider' | 'evaluating'
    progress_percent?: number;          // 0-100, integer
    completed_requirements?: number;
    total_requirements?: number;
    status_message?: string;
    estimated_seconds_remaining?: number;  // null until >= 3 requirements complete
    last_updated?: string;              // ISO 8601
    batch_number?: number;              // TYPED BUT NEVER POPULATED BY BACKEND
    batch_total?: number;               // TYPED BUT NEVER POPULATED BY BACKEND
    batch_size?: number;                // TYPED BUT NEVER POPULATED BY BACKEND
    last_requirement_id?: string;       // TYPED BUT NEVER POPULATED BY BACKEND
  };
}
```

### MultiDocumentUploadResponse (`frontend/src/lib/api.ts`)

```typescript
export interface MultiDocumentUploadResponse {
  evaluation_id: string;
  primary_document: string;
  supporting_documents: string[];
  supporting_docs_count: number;
  status: string;
  summaries_status: string;
  message: string;
}
```

---

## Upload Response Contracts

### `POST /api/upload` (Single Document)

**What the backend actually returns** (`api/app.py`):

```json
{
  "evaluation_id": "uuid",
  "filename": "document.pdf",
  "status": "queued" | "processing",
  "queue_position": 2,
  "message": "Document queued for evaluation. Position: 2"
}
```

`queue_position` is 0 when the document is immediately processing; > 0 when queued.

**What the frontend currently types** (`frontend/src/lib/api.ts`):

```typescript
Promise<{
  evaluation_id: string;
  filename: string;
  status: string;
  message: string;
}>
```

`queue_position` is **omitted** from the frontend type. The backend sends it, but the frontend discards it. To wire queue position into the UI, update this return type and capture the value in DocumentUploader.

### `POST /api/upload-multi` (Multi-Document)

**What the backend returns**: Same shape as `MultiDocumentUploadResponse` above. Does **not** include `queue_position` — multi-doc uploads are not immediately queued because summarization happens first.

**What the frontend types**: `MultiDocumentUploadResponse` — matches the backend response.

---

## Polling Configuration

| Parameter | DocumentUploader | MultiDocumentUploader | EvaluationStatus Table |
|-----------|-----------------|----------------------|----------------------|
| Mechanism | `api.pollEvaluationStatus()` | `api.pollEvaluationStatus()` | `setInterval` + `api.getEvaluations()` |
| Interval | 5000ms | 5000ms | 10000ms |
| Idle timeout | 120 intervals (~10 min) | 120 intervals (~10 min) | None (runs indefinitely) |
| Hard timeout | 30 min | 30 min | None |
| Idle detection | Compares `completed_requirements:progress_percent:last_updated` | Same | N/A |
| Terminates on | `completed`, `failed`, or `error` | Same | Never — keeps refreshing |

**Important behavioral difference:** `pollEvaluationStatus()` (used by both upload flows) terminates when evaluation reaches a terminal status — the upload UI stops updating. The evaluations table uses a plain `setInterval` that refreshes every 10 seconds regardless of individual evaluation status and never stops. If someone reports "this screen stopped updating," check which component they are looking at: upload flow polls terminate, the table does not.

### Polling Implementation Detail (`frontend/src/lib/api.ts`)

The polling loop builds a `progressKey` from `completed_requirements`, `progress_percent`, and `last_updated`. If the key is unchanged across consecutive polls, `idleIntervals` increments. When `idleIntervals >= maxIdleIntervals`, the poller throws `APIError('Evaluation polling timeout - no progress detected')`. When `maxTotalMs` is exceeded, it throws `APIError('Evaluation polling timeout - time limit exceeded')`.

---

## Backend Progress Writes

Source: `api/progress_tracker.py`

### Metadata Payload

Written to `document_evaluations.metadata`:

```json
{
  "phase": "evaluating",
  "progress_percent": 42,
  "completed_requirements": 16,
  "total_requirements": 38,
  "status_message": "Evaluating requirements (16 of 38)...",
  "estimated_seconds_remaining": 145.3,
  "last_updated": "2026-03-17T10:30:00+00:00"
}
```

This is the **complete** payload. The backend does not write `batch_number`, `batch_total`, `batch_size`, or `last_requirement_id`.

### Write Debouncing

- `set_phase()` and `set_total_requirements()` write immediately
- `on_requirement_complete()` debounces at **2-second intervals** (configurable via `debounce_seconds`)
- If a write is due but debounce hasn't elapsed, a delayed write task is scheduled
- `close(flush=True)` forces a final write at evaluation end
- All internal state is protected by `asyncio.Lock()`

### ETA Calculation

```
Returns null if completed < 3 or total <= completed
Otherwise: (elapsed / completed) * remaining, rounded to 1 decimal
```

`elapsed` = `time.monotonic() - eval_start_time` (set when phase switches to "evaluating").

This is linear extrapolation, not smoothed or windowed. It will fluctuate.

### Concurrency (env-driven defaults)

| Setting | Env Var | Default | Notes |
|---------|---------|---------|-------|
| Max concurrent evaluations | `MAX_CONCURRENT_EVALUATIONS` | 2 | From `api/evaluation_queue.py` |
| Max queue size | `MAX_QUEUE_SIZE` | 100 | From `api/evaluation_queue.py` |
| Requirement evaluation concurrency | `VISION_EVALUATOR_CONCURRENCY` | 8 | From `api/vision_responses_evaluator.py` |
| Claude provider cap | N/A (hardcoded in `PROVIDER_CONCURRENCY`) | 4 | Overrides general concurrency for Claude provider |

All of these are env-driven except the Claude cap, which is set in `PROVIDER_CONCURRENCY` dict in `vision_responses_evaluator.py`.

---

## Queue System

Source: `api/evaluation_queue.py`, `api/app.py`

- `MAX_CONCURRENT_EVALUATIONS` (env, default 2): how many evaluations run simultaneously
- `MAX_QUEUE_SIZE` (env, default 100): max pending items before rejecting uploads
- `processing_timeout_seconds`: 1800 (30 min) — stale processing items are cleaned up
- Queue position: 1-based for pending items, 0 for actively processing, null for not found

### Unused endpoint

`GET /api/queue/position/{evaluation_id}` exists in `api/app.py` and returns `evaluation_id`, `status`, `queue_position`, and `message`. No frontend code calls it.

---

## Abstraction Note: `summarizing` vs `summaries_status`

These are related but not the same thing.

- **`summarizing`** is a frontend phase, defined as a value of `UploadPhase` in `MultiDocumentUploader.tsx`. It is set by the component when the upload response comes back with `summaries_status === "pending"`.
- **`summaries_status`** is a backend field on the evaluation record, with values: `pending`, `generating`, `completed`, `failed`, `not_required`.

The frontend drives the phase transition by polling `summaries_status`. When it reads `"completed"` or `"not_required"`, it switches to the `"processing"` phase. They align in practice — the frontend "summarizing" phase corresponds to the backend `summaries_status` being `"pending"` or `"generating"` — but they are not the same abstraction. The frontend phase is a UI concern; the backend field is a data lifecycle concern.

This matters when debugging phase transitions or when adding more granular summarization progress. The backend status does not trigger a frontend event — the frontend discovers it on the next poll.

---

## Field-by-Field Data Availability Matrix

| Field | Pending | Uploading (frontend-only) | Summarizing | In Progress (< 3 done) | In Progress (>= 3 done) | Completed | Error / Failed |
|-------|---------|--------------------------|-------------|------------------------|------------------------|-----------|---------------|
| `status` | `"pending"` | N/A (frontend state) | `"pending"` or `"in_progress"` | `"in_progress"` | `"in_progress"` | `"completed"` | `"error"` / `"failed"` |
| `metadata.phase` | null | N/A | null | `"evaluating"` | `"evaluating"` | last value | last value |
| `metadata.progress_percent` | null | N/A | null | 0 to ~7% | 8-99% | last value | last value |
| `metadata.completed_requirements` | null | N/A | null | 0-2 | 3+ | final count | last known |
| `metadata.total_requirements` | null | N/A | null | set once evaluator loads framework | same | same | set or null |
| `metadata.status_message` | null | N/A | null | `"Evaluating requirements (X of Y)..."` | same | last value | last value |
| `metadata.estimated_seconds_remaining` | null | N/A | null | **null** | number (fluctuates) | null or last | null or last |
| `summaries_status` | `"not_required"` (single) | N/A | `"pending"` → `"generating"` | `"completed"` | `"completed"` | `"completed"` | varies |
| `overall_compliance_score` | null | N/A | null | null | null | number | null |
| `error_message` | null | N/A | null | null | null | null | string |

### `queue_position` availability

**This is an implementation trap.** `queue_position` is available in exactly one place:

- **Upload response** (`POST /api/upload`): returned once, at upload time. The frontend type omits it.
- **Polled evaluation status** (`GET /api/evaluations/{id}`): **not included** in the response.
- **Dedicated endpoint** (`GET /api/queue/position/{evaluation_id}`): exists but not called by frontend.

If you want to display queue position, you must either capture it from the upload response (one-time, goes stale) or poll the dedicated queue position endpoint (not currently wired). The standard evaluation status polling will never include it.

---

## State Machine Diagrams

### DocumentUploader (Single Document)

```
                     ┌──────────────┐
                     │   pending    │  File added, not yet uploaded
                     └──────┬───────┘
                            │ user clicks upload
                     ┌──────▼───────┐
                     │  uploading   │  progress = 30 (synthetic)
                     └──────┬───────┘  message = "Uploading to Azure Storage..."
                            │          (stale copy — see Known Gaps)
                            │ api.uploadDocument() resolves
                     ┌──────▼───────┐
                     │  processing  │  Polls every 5s via pollEvaluationStatus()
                     └──────┬───────┘  Renders: progress bar, completed/total,
                            │          status_message, ETA (when available),
                            │          batch info (dead code — never populated)
                    ┌───────┴────────┐
             ┌──────▼──────┐  ┌──────▼──────┐
             │   success   │  │    error    │
             └─────────────┘  └─────────────┘
```

**Data flow during `processing`:**

The polling callback maps `EvaluationStatus` metadata to a local `evaluationProgress` object:

```
metadata.progress_percent     → evaluationProgress.percent
metadata.completed_requirements → evaluationProgress.completed
metadata.total_requirements   → evaluationProgress.total  (fallback: 38)
metadata.status_message       → evaluationProgress.message
metadata.estimated_seconds_remaining → evaluationProgress.etaSeconds
metadata.batch_number         → evaluationProgress.batchNumber  (always undefined)
metadata.batch_total          → evaluationProgress.batchTotal   (always undefined)
metadata.batch_size           → evaluationProgress.batchSize    (always undefined)
```

The `total` fallback of 38 is hardcoded for the original ISO 14971 framework. This will be wrong for other frameworks.

### MultiDocumentUploader

```
                     ┌──────────────┐
                     │     idle     │
                     └──────┬───────┘
                            │ user clicks "Start Upload & Evaluation"
                     ┌──────▼───────┐
                     │  uploading   │  Indeterminate <Progress value={undefined} />
                     └──────┬───────┘  Label: "Uploading documents..."
                            │
                            │ api.uploadDocumentsMulti() resolves
              ┌─────────────┴──────────────┐
              │ result.summaries_status     │
              │ === "pending" ?             │
        ┌─────▼──────┐              ┌──────▼───────┐
        │ summarizing │              │  processing  │  (no supporting docs)
        └─────┬──────┘              └──────────────┘
              │ Indeterminate progress
              │ Label: "Generating summaries for supporting documents..."
              │
              │ polled summaries_status === "completed" or "not_required"
        ┌─────▼──────┐
        │ processing  │  Determinate progress bar, counts, ETA
        └─────┬──────┘
        ┌─────┴──────┐
 ┌──────▼──────┐ ┌───▼────┐
 │  complete   │ │ error  │
 └─────────────┘ └────────┘
```

---

## Data the UI Does Not Currently Have

### 1. No push channel
All progress is poll-based. Upload flows poll every 5s, the evaluations table every 10s. There is no WebSocket or SSE. Updates are always 5-10 seconds stale.

### 2. `queue_position` not wired
The backend returns `queue_position` in the single-upload response (`api/app.py`), but the frontend return type in `api.ts` omits it. The value is discarded. The dedicated `GET /api/queue/position/{evaluation_id}` endpoint exists but is never called. To surface queue position, both the type and the polling logic need to be updated.

### 3. No per-supporting-document summary progress
During summarization, the backend generates summaries individually per document and tracks success/failure internally. But it only exposes the coarse `summaries_status` enum (`pending` → `generating` → `completed`/`failed`). There is no count like "2 of 5 documents summarized" available via the API.

### 4. Phantom batch metadata fields
The `metadata` type in `api.ts` includes `batch_number`, `batch_total`, `batch_size`, and `last_requirement_id`. The backend `ProgressTracker` (`api/progress_tracker.py`) never writes these fields. They are always `undefined` at runtime. DocumentUploader and MultiDocumentUploader both have conditional render logic for batch fields — this code is dead.

---

## Known Gaps (Developer Impact)

### 1. `progress` vs `metadata.progress_percent`
The top-level `progress` field on `EvaluationStatus` is typed but **unused** by all three UI consumers. All progress bar rendering reads `metadata.progress_percent`. Do not use the top-level `progress` field.

### 2. `uploadDocument()` omits `queue_position`
The backend sends `queue_position` in the upload response. The frontend TypeScript return type in `api.ts` does not include it. The value is silently discarded by the destructured response. To wire it: update the return type, capture the value in `DocumentUploader`, and render it during the `processing` phase when `queue_position > 0`.

### 3. Dead batch rendering code
Both `DocumentUploader.tsx` and `MultiDocumentUploader.tsx` conditionally render batch progress (e.g., "Batch 2/4"). Since the backend never writes `batch_number` or `batch_total`, these conditions are never true. This is dead code.

### 4. Hardcoded total fallback
`DocumentUploader.tsx` defaults `total` to 38 when `metadata.total_requirements` is null. This is the ISO 14971 requirement count. Other frameworks will have different counts. This should either use 0 (show indeterminate) or wait for the backend to populate the field.

### 5. No WebSocket/SSE
All three consumers rely on HTTP polling. There is no server push infrastructure. Changing this requires backend work (adding a push channel) and frontend work (subscribing instead of polling).

### 6. Queue position endpoint unused
`GET /api/queue/position/{evaluation_id}` is implemented in `api/app.py` but no frontend code calls it. The evaluations table shows "Queued" for pending items with no position context.

### 7. Summarization progress gap
The summarizing phase renders an indeterminate progress bar because `summaries_status` only provides coarse state transitions. Granular per-document progress would require backend changes to expose a count or per-document status array.

### 8. "Uploading to Azure Storage..." is stale copy
`DocumentUploader.tsx` hardcodes the string `"Uploading to Azure Storage..."` for the uploading phase status message. This does not reflect current infrastructure and is a wording bug. The fix is a one-line string change.

---

## Files Reference

| File | Role |
|------|------|
| `frontend/src/components/upload/DocumentUploader.tsx` | Single-doc upload, progress display, polling |
| `frontend/src/components/upload/MultiDocumentUploader.tsx` | Multi-doc upload, summarize phase, polling |
| `frontend/src/components/upload/DropZone.tsx` | File drag/drop, per-file status badges |
| `frontend/src/components/evaluation/EvaluationStatus.tsx` | Evaluations table with batch refresh |
| `frontend/src/lib/api.ts` | API client, TypeScript types, polling logic |
| `api/progress_tracker.py` | Backend progress writes, debouncing, ETA calculation |
| `api/evaluation_queue.py` | Queue management, concurrency limits, position tracking |
| `api/vision_responses_evaluator.py` | Requirement evaluation, concurrency config, progress callbacks |
| `api/document_summarizer.py` | Supporting document summarization lifecycle |
| `api/app.py` | Upload endpoints, evaluation lifecycle, status endpoints, queue endpoints |
