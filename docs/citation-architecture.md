# Citation Architecture: How Evidence Supports Compliance Decisions

## Problem Statement

Our compliance evaluator produces status decisions (PASS/FAIL/FLAGGED) for regulatory requirements, but the evidence backing those decisions has been unreliable. In a recent evaluation, 7 of 10 PASSes had zero supporting citations. When citations do exist, they're often truncated fragments that don't read as proper references.

For a compliance tool, this is a credibility problem. A reviewer looking at a PASS needs to see *where in the document* the requirement is satisfied -- not just a verdict.

## Goal

Every PASS should have at least one meaningful citation pointing to a specific location in the document. We're not trying to be exhaustive (this isn't a search engine), but we need enough evidence that a reviewer can trust the decision and quickly verify it.

---

## Architecture Overview

There are two LLM pipelines and a normalization layer between them:

```
                        Pipeline 1: Evaluation
                        ~~~~~~~~~~~~~~~~~~~~~~
    PDF (via vision) + Requirement prompt
                    |
                    v
    LLM (OpenAI / Gemini / Claude)
                    |
                    v
    Structured output: { status, rationale, evidence[], gaps[] }
                    |
                    v
                        Normalization
                        ~~~~~~~~~~~~~
    evidence_utils.normalize_evidence_items()
      - Deduplicates by (page, section, quote, supports, doc_name)
      - Truncates quotes to 300 chars, supports to 350 chars
      - Handles legacy text format conversion
                    |
                    v
    Database: requirement_evaluations.evidence_structured (JSONB)
                    |
                    v
                        Pipeline 2: Presentation
                        ~~~~~~~~~~~~~~~~~~~~~~~~
    Presentation generator reads raw evaluation + PDF
                    |
                    v
    LLM (OpenAI) synthesizes reviewer-facing text:
      - inline_finding: 1 short sentence (the verdict)
      - inline_caveat: 1 short sentence (limitation/OFI)
      - modal_summary: 1-2 sentences (expanded explanation)
                    |
    Evidence groups are built deterministically (no LLM):
      - Each evidence item -> EvidenceGroup with CitationPill
      - Each gap -> EvidenceGroup (caveat)
      - Deduplication, sorting, ceiling enforcement
                    |
                    v
    Database: compliance_reports.requirement_presentations (JSONB)
                    |
                    v
    Frontend renders inline pills + modal detail view
```

### Key distinction

- **Pipeline 1** generates the evidence (the LLM decides what to cite)
- **Pipeline 2** reformats the evidence for display (the LLM only rewrites prose; citations pass through untouched)

This means citation quality is *entirely determined by Pipeline 1*. The presentation layer can't invent evidence it wasn't given.

---

## Evidence Data Model

Each evidence item has five fields:

| Field | Type | Purpose |
|-------|------|---------|
| `page_number` | int or null | Where in the PDF |
| `section_title` | string or null | Which section/heading |
| `quote` | string (max 300 chars) | Verbatim excerpt from the document |
| `supports` | string (max 350 chars) | Why this quote matters for the requirement |
| `document_name` | string or null | Which document (multi-doc evaluations) |

These are stored as a JSONB array in `requirement_evaluations.evidence_structured`.

A requirement can have **multiple evidence items** -- the schema, database, and UI all support arrays. The presentation layer groups them and renders up to 40 citations per requirement (configurable).

---

## What We've Fixed (Current Branch)

### 1. Prompt now requires evidence for every status

Previously, the evaluation prompt said nothing about when evidence was required. The model frequently returned `evidence: []` for PASSes.

Now the prompt explicitly states:
- **PASS**: "You MUST provide at least one evidence item showing WHERE in the document the requirement is satisfied."
- **FAIL**: "Cite the section(s) where the gap was expected but not found."
- **FLAGGED**: "Cite the partial or ambiguous evidence that triggered the flag."
- Multiple items encouraged: "Two to four items is typical for a thorough evaluation."

### 2. Quotes are no longer over-truncated

| Field | Before | After |
|-------|--------|-------|
| quote | 160 chars (~1 sentence) | 300 chars (~2-3 sentences) |
| supports | 220 chars | 350 chars |
| excerpt (display) | 220 chars | 300 chars |

### 3. Inline findings/caveats are shorter

The inline text (visible in the table row) is now capped at 160 chars (1 clean sentence). The full explanation lives in `modal_summary` at 420 chars, visible when the reviewer clicks through.

### 4. PASS fallback for existing data

If a PASS has no evidence (legacy evaluations or edge cases), the UI now shows: *"The document appears to address this requirement, but no specific citations were extracted."* Previously it showed nothing.

---

## Remaining Risk: Single-Pass Evidence Collection

### How it works

We upload the PDF to the model provider's file endpoint (OpenAI, Gemini, Claude). The provider handles all document understanding -- text extraction, OCR, table parsing, layout comprehension. We never touch the raw document content ourselves.

The model then:
1. Receives the full PDF via the provider's file reference
2. Reads it in a single pass alongside the requirement prompt
3. Generates evidence quotes from its understanding
4. Returns structured JSON

**This is a deliberate architectural choice.** We avoid the complexity of our own extraction pipeline, vector databases, chunking strategies, and OCR tooling. The model providers are investing heavily in document understanding -- we get those improvements for free.

### Known risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Model skims long documents, misses relevant sections | PASS with thin evidence, or citations concentrated in early pages | Medium-High for 50+ page docs |
| Model paraphrases instead of quoting verbatim | Citations don't match actual document text word-for-word | Medium |
| Model hallucinates quotes | Citation looks real but isn't in the document | Low but non-zero |

### Why this matters for PASSes specifically

A FAIL is conservative -- missing evidence defaults to caution. But a PASS with fabricated or weak evidence is actively misleading. The reviewer trusts the tool and skips manual review of a requirement that may not actually be met.

---

## Strategies to Improve Evidence Quality (Without Breaking the Architecture)

All of these keep the model provider as the document understanding layer. No custom extraction, no vector DBs, no chunking.

### Strategy 1: Prompt Engineering (Done)

What we've already shipped. The evaluation prompt now:
- Requires evidence for every PASS, FAIL, and FLAGGED
- Encourages 2-4 evidence items per requirement
- Asks for 1-3 sentence quotes instead of fragments
- Instructs the model to "search the entire document (headings, lists, tables, appendices)"

This is the 80/20. Most of the improvement comes from simply telling the model to cite its work.

### Strategy 2: Two-Pass Evaluation

Use two LLM calls per requirement, both using the same uploaded file reference:

```
Pass 1 (Search):
  "List every section in this document relevant to [requirement].
   For each, return: page_number, section_title, and a verbatim quote.
   Search the ENTIRE document including appendices and tables.
   Return at least 3 relevant sections if they exist."
      |
      v
  Result: candidate_passages[]

Pass 2 (Judge):
  "Given the following passages found in the document:
   [candidate_passages]

   Evaluate whether [requirement] is satisfied.
   Your evidence array MUST cite from the passages above.
   You may add additional evidence you find, but the passages
   above should be your primary source."
      |
      v
  Result: { status, rationale, evidence[], gaps[] }
```

**What this buys us:**
- Pass 1 is a focused search task -- models are better at exhaustive search when that's all they're doing
- Pass 2 has concrete passages to cite from, reducing the chance of missed or fabricated evidence
- Both passes use the same file reference -- no extraction pipeline needed

**Trade-offs:**
- Doubles LLM cost per requirement (~$0.06 more per requirement)
- Adds latency (~3-5s per requirement for the search pass)
- Still relies on the model's ability to read the document, but the search-only framing encourages more thorough scanning

### Strategy 3: Require-Then-Verify Gate

After evaluation, add a lightweight verification step:

```
  Evaluation result (with evidence[])
      |
      v
  Verification check:
    - Does every PASS have at least 1 evidence item? If not → re-evaluate with stricter prompt
    - Are page_numbers present? If not → flag for review
    - Is confidence "high" but evidence count < 2? → downgrade confidence to "medium"
      |
      v
  Either: accept result, retry with enhanced prompt, or flag for human review
```

**What this buys us:**
- Catches the "empty evidence PASS" problem programmatically
- Can trigger a retry with a more explicit prompt ("You returned a PASS but provided no evidence. Re-evaluate and cite specific sections.")
- No new infrastructure -- just post-processing logic

**Trade-offs:**
- Retries cost extra LLM calls (but only for the bad cases)
- Doesn't improve the model's initial search ability, just catches failures

### Strategy 4: Cross-Requirement Evidence Sharing

Currently each requirement is evaluated independently. But many requirements reference related concepts -- evidence found for one requirement often supports another.

```
  Evaluate all requirements (current approach)
      |
      v
  Build an evidence index: { page_number + section → [requirement_ids] }
      |
      v
  For any PASS with thin evidence:
    "The following evidence was found in other requirement evaluations
     from the same document sections. Does any of it also apply here?
     [evidence from related requirements]"
```

**What this buys us:**
- Leverages evidence already found across the evaluation
- Particularly useful when one section of the document satisfies multiple requirements
- Cheap -- just reshuffles existing data

**Trade-offs:**
- Extra LLM call only for thin-evidence cases
- Risk of force-fitting unrelated evidence

---

## Approaches We're NOT Pursuing

### Custom text extraction + RAG pipeline
Building our own document processing (chunking, embedding, vector search) would duplicate what the model providers already do better. It adds OCR dependencies, embedding model choices, chunk size tuning, and a vector store to maintain. The providers handle all of this when we upload to their file endpoints.

### Chunk-level deterministic scoring
Scoring every chunk against every requirement without LLM judgment. Removes the "understanding" that makes compliance assessment work -- keyword overlap doesn't capture whether a document *addresses* a requirement vs. merely *mentions* it.

---

## Recommendation

**Short-term (done):** Prompt changes + truncation fixes + PASS fallback. Ship it, test with real evaluations, measure how many PASSes still have empty or thin evidence.

**Next step (if needed):** Strategy 3 (Require-Then-Verify Gate). This is the cheapest improvement -- pure post-processing logic, no extra LLM calls in the happy path, catches the worst failures. Implement this first because it tells us *how often* the model fails to provide evidence, which informs whether we need Strategy 2.

**If evidence quality is still insufficient:** Strategy 2 (Two-Pass Evaluation). This is the most impactful change but doubles cost. The data from Strategy 3 will tell us whether it's worth it.

**Probably not needed but worth knowing about:** Strategy 4 (Cross-Requirement Evidence Sharing). Only relevant if we see a pattern of thin evidence on requirements that share document sections with well-evidenced requirements.

---

## Open Questions

1. **What's the re-evaluation budget?** Strategy 3 retries cost extra LLM calls. Should we cap retries at 1 per requirement, or allow more for critical requirements?
2. **Should we enforce a hard gate?** e.g., reject any PASS where `evidence` is empty and force a re-evaluation. Or is the fallback message sufficient for now?
3. **How do we measure improvement?** After shipping the prompt changes, we need a way to compare evidence quality before/after. Could sample 20 evaluations and manually score citation quality.
4. **Is there a document length threshold?** The single-pass approach may work fine for 10-page SOPs but degrade for 100-page quality manuals. If so, Strategy 2 could be triggered only for long documents.
