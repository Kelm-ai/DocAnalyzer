# Results V2 Presentation Layer Handoff

## Summary

We introduced a separate presentation layer for `results-v2` because the raw requirement evaluation output is not suitable to render directly in the UI.

The raw evaluator is good at compliance judgment:

- `PASS` / `FAIL` / `FLAGGED`
- rationale
- evidence
- gaps

But it is not good at reviewer-facing communication. When rendered directly, it produces:

- quote-heavy evidence dumps
- weak inline summaries
- poor scanability
- awkward detail layouts

The presentation layer is intended to transform the raw evaluator output into:

- short claim-based inline content for rapid review
- fuller claim-based modal content for detailed review
- structured citation objects that can power citation pills

The intended split is:

1. Raw evaluation call: audit-safe analytical record
2. Presentation call: UI-ready claim synthesis
3. Citation payload: structured support for claims

## Product Thinking

### Why a presentation call exists

The inline row and the modal do different jobs.

The inline row should answer, very quickly:

- what is present
- what is missing
- why this is a fail / flag / pass

That means inline needs very compressed, claim-first language.

Example target behavior:

- `The procedure establishes an ongoing risk management process.`
- `It does not define a repeatable methodology for risk assessment.`
- `This still needs human verification.`

The modal should answer:

- what the requirement means in this document
- what the system found
- why the status was assigned

So the modal can be fuller, but it should still remain claim-first. It should not become a raw evidence dump.

### How we are thinking about citations

We are not treating citations as a big visible evidence block.

We are treating them as structured support attached to claims.

That means the UI should render:

- claim sentence first
- citation pill(s) attached to that claim

The citation is a structured object, not just a string. Current neutral contract:

```ts
type Citation = {
  label: string
  location: string
  excerpt: string
  provider?: string | null
  file_id?: string | null
  page_number?: number | null
  section_title?: string | null
}
```

This lets the UI stay clean:

- inline shows the claim
- hover on the pill reveals the supporting excerpt

## What Has Been Implemented

### Frontend

- Parallel route exists at `/results-v2/:evaluationId`
- V2 can read report-scoped `requirement_presentations`
- V2 falls back safely to raw evaluator-derived content if presentation data is missing
- Inline rows now render claim blocks instead of the old dedicated evidence/gap blocks
- Modal renders claim summary plus full-analysis blocks
- Citation pill UI exists and can render hover content when citations are present

Relevant files:

- `frontend/src/pages/ResultsV2.tsx`
- `frontend/src/lib/results-v2.ts`
- `frontend/src/lib/api.ts`

### Backend

- `compliance_reports` now supports `requirement_presentations`
- report API returns `requirement_presentations`
- raw evaluator remains intact
- small evaluator prompt improvement added to encourage more atomic evidence items
- new presentation generator added as a second pass

Relevant files:

- `api/app.py`
- `api/requirement_presentation_generator.py`
- `api/vision_responses_evaluator.py`
- `migrations/add_requirement_presentations_to_reports.sql`

### Database

The following columns were added to `compliance_reports`:

- `executive_summary JSONB`
- `requirement_presentations JSONB`

## What We Tried

### First direction: Anthropic native citations

We originally explored Anthropic-native citations because they are strong for document grounding.

We moved away from that path because the native citations path conflicts with the strict structured output approach we need for stable UI payloads.

That made Anthropic a poor fit for the presentation layer, even though Claude remains a good fit for the raw evaluation layer.

### Current direction: OpenAI direct PDF input + structured output

We then shifted to:

- keep Claude as raw evaluator
- use OpenAI as the presentation synthesizer
- send the PDF as direct file input
- request strict structured JSON for:
  - `inline_claims`
  - `modal_claims`
  - `full_analysis`
  - citations attached to claims

This is still the correct overall direction.

## What Happened on the Live Eval

We tested and backfilled evaluation:

- `2b979eae-75a8-4671-958c-a177a71cdc76`

What worked:

- `requirement_presentations` was successfully written for all 10 requirements
- `results-v2` now reads that payload
- the page is no longer relying only on the old raw evidence blocks

What did not work:

- the OpenAI structured presentation response truncated on several requirements
- this caused invalid JSON parse failures
- per-requirement fallback logic kicked in
- as a result, most content came from fallback presentation logic rather than successful structured claim generation
- citation pills remain empty for this eval

Observed current state for that eval after backfill:

- `requirement_presentations = 10`
- `inline_citations = 0`

This means:

- the architecture works
- the storage works
- the route works
- the rendering works
- the generation quality is not yet stable enough

## Current Diagnosis

The main problem is not:

- the route
- Supabase
- the report contract
- the frontend renderer

The main problem is:

- the presentation generator is trying to do too much in one structured call
- dense requirements produce oversized output
- structured JSON gets truncated
- fallback content is used instead

In short:

The system is rendering the right shape, but the generated content is still too unreliable for production.

## What Has Already Been Improved

Even before the next redesign, we tightened fallback behavior so it is less bad when generation fails:

- fallback inline claims are now assessment-first
- raw source prefixes are stripped
- long quotes are truncated
- the inline view is cleaner than the original raw evidence rendering

This means fallback now degrades more gracefully, but it is still not the intended final experience.

## Recommended Next Step

The next implementation should split the presentation work into smaller calls.

### Recommended backend redesign

Do **not** try to generate everything in one structured response.

Instead split into:

1. `generate_inline_claims`
   - 1-2 short claims
   - no full analysis
   - minimal citation burden

2. `generate_modal_analysis`
   - modal claims
   - full analysis blocks
   - separate schema

3. `generate_claim_citations`
   - small citation-only structured output
   - run per claim or per requirement in a compact schema

4. `merge_requirement_presentation`
   - build final `RequirementPresentationSummary`

### Why this is the right change

- smaller outputs are less likely to truncate
- claims and citations become independently debuggable
- citation failure no longer destroys the entire requirement payload
- fallback can happen at one layer without collapsing everything

## Suggested Acceptance Criteria

For the next iteration, success should mean:

- inline rows never lead with raw quoted evidence
- inline rows communicate the gist in 1-2 short claims
- modal explains why the requirement got its status
- at least some real citation pills appear on the tested eval
- citation failures do not revert the entire requirement to raw evidence strings

## Immediate Next Work for Developer

1. Refactor `api/requirement_presentation_generator.py` into smaller generation steps
2. Keep the stored report contract unchanged if possible
3. Re-backfill eval `2b979eae-75a8-4671-958c-a177a71cdc76`
4. Verify that the updated `requirement_presentations` payload contains non-zero citations
5. Refresh `results-v2` and compare the inline view before/after

## Bottom Line

We have proven the right architecture:

- separate presentation layer
- claim-based inline UI
- fuller modal explanation
- citations as structured support objects

What remains is making the generation step reliable enough to produce the content quality that the UI is designed for.
