# Loading & Progress UX: Design Spec

## Summary

This document maps the user-facing loading experience during document evaluation. It covers the three contexts where users encounter progress states — single upload, multi-document upload, and the evaluations table — and describes what data is available at each phase, what the current UX does with it, and where the experience falls short.

The audience is designers and product. Code references are minimal. For implementation specifics, see `docs/loading-ux-frontend-checklist.md`.

## User Journeys

### Journey 1: Single Document Upload

The user selects a framework, drops a PDF, and clicks to start evaluation.

```
File Selected ──> Uploading ──> Evaluating ──> Complete
                                    │
                                    └──> Error
```

**Phase: File Selected**
The file appears in a list with a "Pending" badge. No server interaction yet. The user can remove or add files.

**Phase: Uploading**
The progress bar jumps to 30% (a hardcoded value — not real upload progress). The status message reads "Uploading to Azure Storage..." which is stale copy that does not reflect current infrastructure. The upload itself is a single HTTP POST to the backend.

**Phase: Evaluating**
Once the server accepts the file, the UI switches to "Processing." From here, progress is driven entirely by backend metadata delivered through polling (every 5 seconds):

- A progress bar fills proportionally based on completed requirements out of total
- A counter shows "16/38 (42%)"
- A status message like "Evaluating requirements (16 of 38)..." updates as requirements complete
- After at least 3 requirements finish, an ETA appears: "~2m 15s remaining"

The ETA is approximate. It is prefixed with ~ in the UI because it uses simple linear extrapolation and fluctuates as concurrent requirement evaluations complete at varying speeds.

**Phase: Complete**
The badge changes to "Complete" with a checkmark icon. The user can navigate to results.

**Phase: Error**
The badge changes to "Error" with an alert icon. A red error message appears below the file entry. If the error was a polling timeout (no progress for ~10 minutes, or 30 minutes total), the message is generic — it does not explain that a timeout occurred.

**Note on queuing:** If the server's evaluation slots are full, the document enters a queue. The backend knows the queue position, but the frontend does not display it. The user sees "Processing" with no indication of waiting.

---

### Journey 2: Multi-Document Upload (Primary + Supporting)

The user selects a framework, drops a primary PDF and optional supporting documents, and clicks to start.

```
Files Selected ──> Uploading ──> Summarizing ──> Evaluating ──> Complete
                                      │               │
                                      │               └──> Error
                                      └──> (skip if no supporting docs)
```

**Phase: Uploading**
All files are uploaded in a single request. The progress bar is indeterminate (no percentage). The label reads "Uploading documents..."

**Phase: Summarizing**
If supporting documents were included, the UI enters a "summarizing" pre-phase. This is the system generating summaries of each supporting document before evaluating the primary document against the framework.

The progress bar remains indeterminate. The label reads "Generating summaries for supporting documents..." There is no count, no per-document progress, and no ETA. The only signal from the backend is a coarse status field that flips from "pending" to "generating" to "completed."

**Important distinction:** "Summarizing" is a frontend phase name. The backend exposes a field called `summaries_status` with values `pending`, `generating`, `completed`, `failed`, `not_required`. The frontend drives the transition by watching that field. They align in practice, but they are not the same concept — a designer should think of "summarizing" as a UI state that depends on a backend signal, not a 1:1 mapping.

**Phase: Evaluating**
Same as the single-upload evaluating phase. Progress bar, requirement counter, status message, ETA.

**Phase: Complete / Error**
Same as single-upload.

---

### Journey 3: Evaluations Table (History)

The user navigates to the evaluations list to check on past or in-progress evaluations.

The table refreshes automatically every 10 seconds. For each row, the "Progress" column renders differently based on status:

| Status | Progress Column Shows |
|--------|----------------------|
| Pending | "Queued" (text only, no position, no countdown) |
| In Progress | Progress bar + "16/38 requirements" + status message + ETA |
| Completed | "Complete" |
| Failed / Error | Error message text |

Unlike the upload flows, the table does not poll a single evaluation — it reloads the entire evaluation list. This means it never "stops" updating. The upload-flow polling stops when evaluation reaches a terminal state; the table keeps refreshing regardless.

---

## Data Available at Each Phase

| Phase | Progress % | Completed / Total | Status Message | ETA | Queue Position |
|-------|-----------|-------------------|----------------|-----|----------------|
| File selected (local) | No | No | No | No | No |
| Uploading (local) | Synthetic 30% | No | Hardcoded text | No | No |
| Queued (pending) | No | No | No | No | Backend has it; frontend does not display it |
| Summarizing | No | No | Hardcoded text | No | N/A |
| Evaluating (0-2 reqs done) | Yes | Yes | Yes | No (needs 3+) | N/A |
| Evaluating (3+ reqs done) | Yes | Yes | Yes | Yes (approximate) | N/A |
| Complete | 100% | Final counts | Final message | No | N/A |
| Error / Failed | Last known | Last known | Error message | No | N/A |

---

## Illustrative Timing Expectations

These are rough mental models inferred from the system design, not telemetry-backed measurements. They are not SLAs.

| Phase | Expected Range | Notes |
|-------|---------------|-------|
| Upload | ~1-10s | Depends on file size and network speed |
| Queue wait | 0s to minutes | Only occurs when all evaluation slots are occupied (default: 2 concurrent) |
| Summarization | ~10-60s | Depends on number and size of supporting documents (default: 3 concurrent) |
| Evaluation | ~2-8 min | Varies by framework requirement count, provider speed, and concurrency settings |

---

## Current UX Behavior

What works well:

- **Determinate progress during evaluation.** Once evaluation begins, the user sees a real progress bar backed by actual requirement completion counts.
- **Requirement counter.** The "16/38" display gives concrete progress context beyond just a bar.
- **ETA display.** After enough data points, the ~ ETA sets a rough expectation, even if it fluctuates.
- **Status messages.** The auto-generated "Evaluating requirements (X of Y)..." keeps the user informed.
- **Terminal state clarity.** Complete and error states are clearly distinguished with icons and color.

---

## Data the UI Does Not Currently Have

These are systemic data gaps — information that either does not exist on the backend or exists but is not wired into the frontend.

1. **No push channel.** All progress updates are delivered by polling. The frontend asks the server every 5 seconds (upload flows) or 10 seconds (evaluations table). There is no WebSocket or Server-Sent Events channel. This means updates are always 5-10 seconds stale.

2. **Queue position is not surfaced.** The backend returns a queue position number when a document is uploaded, but the frontend does not store or display it. Users in a queue see "Processing" or "Queued" with no indication of where they are in line.

3. **No per-supporting-document summary progress.** During the summarizing phase, the backend tracks individual document summaries internally, but only exposes a single coarse status (pending / generating / completed / failed). There is no count like "2 of 5 documents summarized."

4. **Phantom metadata fields.** The frontend type system includes `batch_number`, `batch_total`, `batch_size`, and `last_requirement_id` in the progress metadata — but the backend never populates these fields. UI code that checks for them will always find undefined. Any redesign should not rely on these fields without backend changes.

---

## Known UX Gaps

### 1. Queue position is invisible
When evaluation slots are full, documents are queued. The user sees either "Processing" (upload flow) or "Queued" (evaluations table) with no position number and no estimated wait time. There is no way to set expectations about queue wait duration.

### 2. ETA fluctuates
The ETA uses simple math: time elapsed divided by requirements completed, multiplied by requirements remaining. Because requirements are evaluated concurrently (multiple in parallel), individual completion times vary. The ETA can jump noticeably, especially in the first few minutes. It is presented with a ~ prefix to signal approximation, but the jumps can still be confusing.

### 3. Summarizing phase is opaque
Multi-document uploads show an indeterminate progress bar during summarization. The user cannot tell how many supporting documents have been processed, how many remain, or how long summarization will take. This can be a meaningful wait (10-60 seconds) with zero feedback.

### 4. No immediate feedback on pending-to-processing transition
The transition from "queued" to "actively evaluating" happens server-side. The frontend discovers it on the next poll cycle (up to 5 seconds later). There is no immediate signal — the user may wonder why nothing is happening.

### 5. Upload progress is synthetic
The progress bar during the upload phase jumps to 30% immediately. It does not track actual upload progress. For large files on slow connections, this could be misleading.

### 6. Upload status message is stale
The single-upload flow displays "Uploading to Azure Storage..." during the upload phase. This is a hardcoded string that does not reflect current infrastructure. It is a wording bug — the copy is misleading regardless of what storage backend is in use.

### 7. Phantom metadata fields suggest features that do not exist
The frontend types include batch progress fields (batch_number, batch_total) and renders UI for them conditionally. Since the backend never populates these fields, the conditional rendering is dead code. This could mislead a developer into thinking batch progress is available.

### 8. Timeout UX is silent
If 10 minutes pass with no progress change, or 30 minutes pass total, polling stops and the UI shows a generic error. The error message does not distinguish a timeout from an evaluation failure. The user has no way to know whether the evaluation stalled, timed out, or genuinely failed.

---

## Design System Reference

See `docs/suttons-creek-design-system.md` for:

- Progress bar component (`<Progress>`, h-2 height)
- Status pill / badge patterns (dot + label)
- Status colors: pass, fail, flagged, not-applicable
- Loading spinner: `Loader2` icon with `animate-spin`, SC Green
- Error display: red-tinted banner pattern
