# Citations Feature Roadmap

## Phase 1 — Inline Citations (Complete)

Perplexity-style inline citation pills `[1]` `[2]` in evaluation rationale, with hover popovers and scroll-to-evidence.

### What was built

#### DB migration
- File: `migrations/add_evidence_metadata.sql`
- SQL: `ALTER TABLE requirement_evaluations ADD COLUMN IF NOT EXISTS evidence_metadata JSONB;`
- **Status:** File created, needs to be run manually in Supabase.

#### Backend — `evaluation_schema.py`
- Added `EvidenceItem` Pydantic model with fields: `text`, `page`, `section`, `document_name`, `document_index`
- `RequirementEvaluationSchema.evidence` is now `List[Union[EvidenceItem, str]]`

#### Backend — `api/vision_responses_evaluator.py`
- `_build_prompt()`: LLM now returns structured evidence objects `{text, page, section, document_name, document_index}` and cites inline as `[1]`, `[2]` in rationale
- `_normalize_evidence(raw_evidence, document_names)`: New helper → returns `(snippets: List[str], metadata: List[dict])`
- `_build_gemini_schema()`: Evidence items typed as objects
- All 3 provider methods (openai, claude, gemini): call `_normalize_evidence`, populate `parsed["evidence_metadata"]`

#### Backend — `api/app.py`
- `persist_vision_results()`: inserts `evidence_metadata` JSONB column
- `RequirementResult` model: added `evidence_metadata: Optional[List[Dict[str, Any]]] = None`
- Both `/results` and `/report` endpoints: pass `evidence_metadata` through

#### Frontend — `src/lib/api.ts`
- Added `EvidenceItem` interface: `{ text, page?, section?, document_name?, document_index? }`
- `RequirementResult`: added `evidence_metadata?: EvidenceItem[] | null`

#### Frontend — `src/components/results/CitedRationale.tsx` (new)
- Parses `[N]` markers from rationale text into segments
- Renders inline superscript pills with hover popovers showing document / section / page + text preview
- Click scrolls to `#evidence-item-{N-1}` in the evidence list and briefly highlights it

#### Frontend — `src/pages/Results.tsx`
- Rationale section: replaced plain `<p>` with `<CitedRationale rationale={...} evidenceItems={evidence_metadata} />`
- Evidence section: numbered cards with document/section/page chips when `evidence_metadata` present, falls back to plain list for old evaluations

---

## Phase 2 — PDF Viewer Panel (In Progress)

Click a citation pill → side panel slides in from the right showing the source PDF at the cited page.

### Plan

#### Backend — `api/app.py`

**New endpoint:** `GET /api/evaluations/{evaluation_id}/documents/{document_id}/download`
- Looks up `evaluation_documents` row by `document_id` + `evaluation_id`
- Strips `"documents/"` prefix from `storage_path` to get the bucket key
- Calls `supabase.storage.from_("documents").create_signed_url(bucket_key, expires_in=300)`
- Returns `{ url, expires_in, file_name, document_role }`
- **Status: implemented**

**Single-doc upload fix** (`/api/upload` endpoint):
- Was: wrote PDF to a local temp file only — no Supabase storage, no `evaluation_documents` record
- Fix: after creating the evaluation record, also uploads to Supabase storage and inserts an `evaluation_documents` row (same pattern as multi-doc upload)
- **Status: implemented** — only applies to new uploads; existing evaluations won't have documents records

#### Frontend — `src/lib/api.ts`

**New method:** `getDocumentDownloadUrl(evaluationId, documentId)`
- `GET /api/evaluations/{evaluationId}/documents/{documentId}/download`
- Returns `{ url, expires_in, file_name, document_role }`
- **Status: implemented**

#### Frontend — `src/components/results/CitedRationale.tsx`

**New prop:** `onCitationClick?: (item: EvidenceItem, index: number) => void`
- When provided: clicking a pill calls `onCitationClick` instead of scroll-highlight
- When not provided: existing scroll-highlight fallback unchanged
- Tooltip `<p>` tags replaced with `<span className="block">` to fix nested `<p>` hydration error
- **Status: implemented**

#### Frontend — `src/components/results/PdfViewerPanel.tsx` (new)

Right-side drawer panel:
- Props: `open`, `evaluationId`, `documentId`, `documentName`, `page?`, `citedText?`, `locationLabel?`, `onClose`
- On open: fetches signed URL via `api.getDocumentDownloadUrl()`
- Header: document name + location label (e.g. `§4.2.1 · p.5`)
- Cited text callout: blue quote block showing the exact text the AI cited
- Body: `<iframe src="{signedUrl}#page={N}">` — native browser PDF viewer jumps to the cited page
- Loading / error states handled
- Escape key closes the panel
- **Status: implemented**

#### Frontend — `src/pages/Results.tsx`

- Add state: `evaluationDocuments: EvaluationDocument[]` and `pdfPanel` (open, documentId, documentName, page, citedText, locationLabel)
- `useEffect`: load `evaluationDocuments` via `api.getEvaluationDocuments()` on mount
- `handleCitationClick(item, index)`: looks up doc by `item.document_index`, opens PDF panel; falls back to scroll if doc not found
- Pass `onCitationClick={handleCitationClick}` to `CitedRationale`
- Render `<PdfViewerPanel>` at the bottom of the return
- **Status: pending**

---

## Phase 3 — PDF Annotation (Future)

Options considered:

| Approach | Complexity | Quality |
|---|---|---|
| `#page=N` iframe (current Phase 2) | Low | Page jump only |
| Server-side pymupdf annotation | Medium | Real yellow highlight baked into PDF |
| react-pdf + client overlay | Medium | Custom highlight over text layer |

**Recommended next step:** server-side annotation with `pymupdf`.

Flow:
1. Frontend passes `cited_text` + `page` to a new backend endpoint
2. Backend downloads PDF from Supabase, runs `page.search_for(cited_text)` → `page.add_highlight_annot(quads)`
3. Streams annotated PDF bytes back
4. Frontend creates a blob URL and loads it in the iframe

Requires adding `pymupdf` to `requirements.txt`. Only works when `cited_text` is available (Claude Citations API evaluations); falls back to `#page=N` for OpenAI/Gemini.
