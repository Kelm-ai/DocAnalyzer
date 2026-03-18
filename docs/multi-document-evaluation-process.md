# Multi-Document Evaluation Process

This note documents how multi-document uploads currently work in the evaluation pipeline. It is intended for developers maintaining or extending the system, and it describes the implementation that exists today rather than an idealized future design.

## Purpose and short answer

Multi-document handling is not just a prompt problem in the current system.

The implemented solution combines:

- backend orchestration for document roles, storage, and queueing
- provider-native file uploads for the primary and supporting PDFs
- pre-evaluation summarization of supporting documents
- prompt-level document hierarchy instructions that tell the model how to use the documents

### Current answers

| Question | Current answer |
| --- | --- |
| Is this just prompt-based? | No. Prompting helps, but the system also uses explicit document roles, background summarization, persisted metadata, and provider file attachments. |
| Do we summarize supplementary documents? | Yes. Every supporting document is summarized before evaluation, and those summaries are injected into prompt context. |
| What are we doing today? | One primary document is evaluated. Up to 10 supporting documents are summarized first, then the evaluator uploads the primary and supporting PDFs to the model provider and instructs the model to focus on the primary unless it is cross-referenced. |

## Current implemented flow

### 1. Upload contract and persistence

The multi-document entrypoint is [`/api/upload-multi`](../api/app.py) in [`api/app.py`](../api/app.py). The handler:

- requires exactly one `primary` document and rejects any request that does not meet that contract
- allows up to 10 `supporting` documents
- accepts `.pdf`, `.docx`, and `.doc`, then normalizes Word uploads to PDF before provider use
- creates a `document_evaluations` row and one `evaluation_documents` row per uploaded file

Relevant implementation:

- [`api/app.py` lines 1102-1148](../api/app.py)
- [`api/app.py` lines 1178-1314](../api/app.py)

Important persisted artifacts:

- `evaluation_documents.document_role` distinguishes `primary` from `supporting`
- `document_evaluations.supporting_docs_count` tracks how many supporting docs were included
- `document_evaluations.summaries_status` tracks whether supporting doc summaries are pending, generating, completed, failed, or not required
- `evaluation_documents.summary_text` stores the generated summary for each supporting doc
- provider reference fields such as `openai_file_id`, `gemini_file_id`, `gemini_file_uri`, and `claude_file_id` are part of the multi-doc schema so provider uploads can be cached and reused

Schema reference:

- [`migrations/add_multi_document_support.sql`](../migrations/add_multi_document_support.sql)

### 2. Supporting-document summarization

If supporting documents are present, evaluation does not start immediately. The upload handler first kicks off `summarize_all_supporting_docs(...)`, and only after that background work completes does it enqueue the main evaluation.

Relevant implementation:

- [`api/app.py` lines 1279-1324](../api/app.py)

The summarizer in [`api/document_summarizer.py`](../api/document_summarizer.py):

- uses an OpenAI mini-tier model by default via `OPENAI_SUMMARY_MODEL`, currently defaulting to `gpt-5-mini`
- generates structured summaries of supporting documents
- stores summary output into `evaluation_documents.summary_text`
- updates `document_evaluations.summaries_status` as work progresses

Relevant implementation:

- [`api/document_summarizer.py` lines 36-67](../api/document_summarizer.py)
- [`api/document_summarizer.py` lines 150-210](../api/document_summarizer.py)
- [`api/document_summarizer.py` lines 217-314](../api/document_summarizer.py)

The design intent here is straightforward: give the evaluator a compact description of what supplementary evidence exists before it looks at the full files.

### 3. Evaluation handoff

Once summarization is done, the evaluation worker creates a framework-configured `VisionResponsesEvaluator` or `DualVisionComparator`, passing in the `evaluation_id` so the evaluator can load supporting-doc context and provider file references.

Relevant implementation:

- [`api/app.py` lines 1415-1470](../api/app.py)

The evaluator then:

- loads supporting-document summaries for prompt context
- uploads supporting PDFs to the active provider if cached provider refs do not already exist
- caches provider refs back onto `evaluation_documents`
- uploads or reuses the primary PDF
- evaluates each requirement with the primary file plus the supporting file refs available

Relevant implementation:

- [`api/vision_responses_evaluator.py` lines 296-325](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 327-442](../api/vision_responses_evaluator.py)

## How we currently manage context pressure

The current strategy is "avoid prompt stuffing," not "never expose the model to extra documents."

That distinction matters.

What we do today to manage context-window pressure:

- We do not inline full document bodies from the primary and supporting PDFs into the evaluation prompt.
- We rely on provider-side file upload and file-reference mechanisms instead of pasting raw document text into the prompt body.
- We summarize supporting docs into compact prompt context so the model knows what supplementary material exists.
- We instruct the model to prioritize the primary document and only use supporting docs when the primary explicitly references them.

This is the main reason multi-document evaluation is not "just a prompt tweak." The reduction in prompt pressure comes from architectural choices in the upload, persistence, and provider-integration layers, not only from wording.

At the same time, this is not a hard isolation boundary. Today the full supporting PDFs are still attached to the provider request, which means the model has access to them during evaluation even though the prompt tells it to treat them as secondary.

## What the model actually receives today

For each requirement evaluation, the model receives:

- the framework/system prompt
- requirement-specific instructions
- supporting-document summaries injected into prompt context when available
- the primary uploaded PDF
- the supporting uploaded PDFs as additional file attachments

Provider-specific implementations all attach the supporting files up front:

- OpenAI appends `input_file` items for supporting docs in the same request content array
- Claude appends supporting `document` items before the prompt text
- Gemini appends supporting file parts into the same `contents` array

Relevant implementation:

- [`api/vision_responses_evaluator.py` lines 1148-1160](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 1230-1247](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 1335-1353](../api/vision_responses_evaluator.py)

This means we reduce prompt-token pressure, but we do not prevent supplementary documents from reaching the model runtime.

## Progressive disclosure: intended behavior vs current behavior

### Intended behavior

The intended behavior is:

- evaluate the primary document as the source of truth
- use supporting docs only when the primary explicitly cross-references them
- treat supporting docs as supplementary verification material rather than co-equal evaluation inputs

That intention is visible in the evaluator prompt:

- "The FIRST document is the PRIMARY document being evaluated."
- "Supporting documents are ONLY to be consulted when the primary document explicitly references them."
- "If the primary document references a supporting document by name, you may consult that supporting document to verify the cross-reference."

Relevant implementation:

- [`api/vision_responses_evaluator.py` lines 1437-1459](../api/vision_responses_evaluator.py)

### Current enforcement mechanism

Today that behavior is enforced only by:

- prompt instructions
- document-role semantics
- evidence-format expectations that encourage document-specific citations

It is not enforced by a real retrieval boundary.

### Concrete implementation gap

The supporting-document summary formatter tells the model:

> If you need specific details from any supporting document that are not in the summary, you can request the full content using the `request_document_content` function.

That string exists in the prompt context builder, but there is no actual `request_document_content` tool or runtime function exposed to the evaluator path.

Relevant implementation:

- [`api/document_summarizer.py` lines 350-382](../api/document_summarizer.py)

At the same time, the evaluator uploads the supporting files directly and includes them in the provider request anyway:

- [`api/vision_responses_evaluator.py` lines 327-442](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 1148-1160](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 1230-1247](../api/vision_responses_evaluator.py)
- [`api/vision_responses_evaluator.py` lines 1335-1353](../api/vision_responses_evaluator.py)

The practical consequence is that our current progressive-disclosure model is soft guidance, not hard-gated access.

The correct description is:

- we have a partial progressive-disclosure pattern
- we do not have a true fetch-on-demand architecture

## Recommended framing for developers

The current design is a pragmatic middle ground:

- better than dumping all text from every document into the prompt
- simpler than building retrieval, indexing, or explicit document-fetch tooling for supplementary materials
- less controlled than a true staged-access design

### When this design works well

This approach works best when:

- the primary SOP or procedure carries most of the evaluative burden
- supporting docs mainly confirm named cross-references
- the team wants to stay close to the model providers' native file-upload workflows
- the goal is prompt-size reduction rather than strict document-access control

### Current limitations

Developers should keep these limitations in mind:

- supporting docs are still uploaded in full to the provider during evaluation
- there is no true demand-driven retrieval path for supporting docs
- summaries may omit details the evaluator later needs
- prompt obedience is doing meaningful control work
- the phrase about `request_document_content` overstates what the runtime actually supports today

## Bottom line

If the question is "Have we solved multi-doc purely by prompt design?", the answer is no.

We currently solve it with a combination of:

- upload-time document role handling
- PDF normalization and persistence
- pre-evaluation summarization of supporting docs
- provider-native file uploads and cached provider refs
- prompt instructions that try to preserve primary-document-first behavior

If the question is "Do we currently have true progressive disclosure?", the answer is also no.

We have reduced prompt bloat and created a primary-versus-supporting hierarchy, but we have not yet implemented a hard retrieval boundary where the model can only fetch supporting document content on demand.
