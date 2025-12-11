# Standards Evaluation Framework

A comprehensive guide for creating AI-powered document compliance evaluators against regulatory standards (ISO, FDA, IEC, etc.).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Three-Layer Prompt Structure](#three-layer-prompt-structure)
3. [Master Prompt Template](#master-prompt-template)
4. [Requirement Prompt Template](#requirement-prompt-template)
5. [The Five Questions Framework](#the-five-questions-framework)
6. [Writing Requirement Prompts](#writing-requirement-prompts)
7. [Decision Logic & Calibration](#decision-logic--calibration)
8. [Common Pitfalls](#common-pitfalls)
9. [Database Schema](#database-schema)
10. [Response Schema](#response-schema)
11. [Worked Examples](#worked-examples)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVALUATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Document   │───▶│  AI Vision   │───▶│   Results    │      │
│  │    (PDF)     │    │   Provider   │    │    (JSON)    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PROMPT ASSEMBLY                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Layer 1: MASTER PROMPT (Standard Context)         │  │  │
│  │  │  - Domain expertise persona                        │  │  │
│  │  │  - General evaluation philosophy                   │  │  │
│  │  │  - Cross-reference handling rules                  │  │  │
│  │  │  - Vision/document handling instructions           │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                          +                                │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Layer 2: INSTRUCTION BLOCK (Method & Schema)      │  │  │
│  │  │  - Mandatory evaluation method steps               │  │  │
│  │  │  - Decision logic (PASS/FAIL/FLAGGED/N/A)          │  │  │
│  │  │  - Response JSON schema                            │  │  │
│  │  │  - Confidence level guidelines                     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                          +                                │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Layer 3: REQUIREMENT PROMPT (Per-Clause)          │  │  │
│  │  │  - Objective (what the clause requires)            │  │  │
│  │  │  - Core evidence criteria (PASS threshold)         │  │  │
│  │  │  - Strong PASS examples                            │  │  │
│  │  │  - FLAG conditions (uncertainty)                   │  │  │
│  │  │  - FAIL conditions (missing/contradicted)          │  │  │
│  │  │  - Typical OFIs (opportunities for improvement)    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Three-Layer Prompt Structure

### Layer 1: Master Prompt
**Purpose:** Establish the AI's persona, domain expertise, and general evaluation philosophy.

- Static across all requirements within a standard
- Sets the tone and approach for the entire evaluation
- Defines how to handle document types, cross-references, and ambiguity
- Provides vision/multimodal handling instructions

### Layer 2: Instruction Block
**Purpose:** Define the evaluation method, decision logic, and output schema.

- Static across all requirements within a standard
- Specifies the mandatory evaluation steps
- Defines the decision mapping (status → criteria)
- Provides the JSON response schema and confidence guidelines

### Layer 3: Requirement Prompt
**Purpose:** Provide clause-specific evaluation criteria.

- Unique per requirement/clause
- Contains the detailed "what to look for" guidance
- Defines the boundary between PASS, FLAG, and FAIL for this specific clause
- Includes examples and typical patterns

---

## Master Prompt Template

```markdown
You are an expert [DOMAIN] assessor with deep knowledge of [STANDARD_NAME] and related guidance documents [LIST_RELATED_STANDARDS]. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from [STANDARD_NAME] [CLAUSE_RANGE].

Context and assumptions:
- Treat the document as a [DOCUMENT_TYPE_DESCRIPTION]. It may reference other [REFERENCED_DOCUMENT_TYPES]; clear cross-references are acceptable evidence that such systems/records exist.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. [SCOPE_EXCLUSIONS].

How to review each clause invocation:
1) Understand what type of document this is and how it fits the [SYSTEM_CONTEXT].
2) Focus ONLY on the requested clause; search the entire document (headings, lists, tables, appendices, images/OCR) for relevant evidence of the process and expected records.
3) Presence vs adequacy: assess basic alignment with the clause. Minor ambiguity or "could be better" solutions can still PASS; treat those as opportunities for improvement (OFIs).
4) Cross-references: if the document points to another controlled [DOCUMENT_TYPE] or record, consider that evidence that the process/record exists; do not invent details that are not written.

Decision logic (map to our schema):
- PASS: Requirement is clearly addressed; process/structure is described and evidence/records are indicated (directly or via cross-reference). Capture OFIs separately.
- FLAGGED (flag_for_review): Evidence exists but is incomplete/ambiguous or needs human confirmation; or statements conflict. Use for genuine uncertainty.
- FAIL: Core expectations are missing/contradicted; required process/records are not defined and no reasonable indication they exist.
- NOT_APPLICABLE: Use only if the clause truly does not apply to the document provided.
When in doubt between PASS and FLAGGED, prefer PASS and note OFIs; use FLAGGED only when a human needs to review.

Vision handling:
- Use both text and visual content. When graphs appear, read axis titles/units and summarise trends. When tables appear, read cells and preserve structure. If text appears in an image, transcribe it before reasoning. If something is unreadable, write "[unreadable]" and move on.
```

### Template Variables

| Variable | Description | Example (ISO 14971) |
|----------|-------------|---------------------|
| `[DOMAIN]` | Area of expertise | "medical device risk-management" |
| `[STANDARD_NAME]` | Primary standard | "ISO 14971:2019" |
| `[LIST_RELATED_STANDARDS]` | Related guidance | "ISO/TR 24971" |
| `[CLAUSE_RANGE]` | Scope of evaluation | "clauses 4-10" |
| `[DOCUMENT_TYPE_DESCRIPTION]` | Expected document types | "top-level risk-management artifact (procedure, RMP, RMR, etc.)" |
| `[REFERENCED_DOCUMENT_TYPES]` | Cross-referenced docs | "SOPs, work instructions, or records" |
| `[SCOPE_EXCLUSIONS]` | What NOT to evaluate | "Do not score clauses 1-3 or annexes as standalone requirements" |
| `[SYSTEM_CONTEXT]` | Broader system | "risk-management system" |
| `[DOCUMENT_TYPE]` | Generic document term | "SOP" |

---

## Requirement Prompt Template

Each requirement in the database should follow this structure in the `requirement_text` field:

```markdown
You are evaluating [STANDARD_NAME] clause [CLAUSE_NUMBER] – "[CLAUSE_TITLE]".

Objective:
Determine whether the document [OBJECTIVE_DESCRIPTION], including:
- [OBJECTIVE_BULLET_1]
- [OBJECTIVE_BULLET_2]
- [OBJECTIVE_BULLET_3]

Core evidence to look for (minimal subset for PASS):
- [CORE_EVIDENCE_1]
- [CORE_EVIDENCE_2]
- [CORE_EVIDENCE_3]

Examples of strong PASS evidence:
- [STRONG_EXAMPLE_1]
- [STRONG_EXAMPLE_2]
- [STRONG_EXAMPLE_3]

When to FLAG:
- [FLAG_CONDITION_1]
- [FLAG_CONDITION_2]
- [FLAG_CONDITION_3]

When to FAIL:
- [FAIL_CONDITION_1]
- [FAIL_CONDITION_2]
- [FAIL_CONDITION_3]

Typical OFIs (can still PASS):
- [OFI_1]
- [OFI_2]
- [OFI_3]
```

### Section Purpose

| Section | Purpose | Writing Tips |
|---------|---------|--------------|
| **Objective** | What the clause fundamentally requires | Start with "Determine whether..." - be specific |
| **Core evidence** | Minimum threshold for PASS | These are the "must haves" - if ALL are present, it PASSES |
| **Strong PASS examples** | Concrete patterns to recognize | Use specific document artifacts (tables, sections, statements) |
| **When to FLAG** | Uncertainty conditions | Evidence exists but is incomplete, ambiguous, or conflicting |
| **When to FAIL** | Missing/contradicted | Core expectations are absent - no reasonable indication they exist |
| **Typical OFIs** | Improvement opportunities | Things that could be better but don't prevent PASS |

---

## The Five Questions Framework

Before writing any requirement prompt, answer these five questions:

### 1. What is the INTENT?

> "Why does this clause exist? What risk does it mitigate?"

**Example for ISO 14971 Clause 4.1:**
```
Intent: Ensure risk management isn't ad-hoc or isolated but is a
systematic, ongoing process integrated with device development.

Risk mitigated: Devices released without adequate risk consideration.
```

### 2. What ARTIFACTS demonstrate compliance?

> "What would I physically see/read if this requirement is met?"

- **Processes:** Procedures, flowcharts, work instructions
- **Records:** Completed forms, logs, meeting minutes
- **Outputs:** Reports, analyses, decisions documented

### 3. What is the MINIMUM for PASS?

> "What's the lowest bar that a reasonable auditor would accept?"

**The Litmus Test:** Would a competent auditor write a nonconformity if ONLY this evidence existed? If no → it can PASS.

```
PASS = Minimum viable compliance
     = Core evidence present + Practicable + Not contradicted
```

### 4. What makes it GENUINELY UNCERTAIN?

> "When would I honestly say 'I'm not sure, let me check with someone'?"

FLAG is for real uncertainty, not "it could be better."

**Three types of genuine uncertainty:**
1. **Incomplete evidence:** Some parts present, critical parts missing
2. **Ambiguous language:** Could be interpreted multiple ways
3. **Contradictions:** Document says conflicting things

### 5. What is CLEARLY NON-COMPLIANT?

> "What would definitely get a major nonconformity?"

FAIL should be unambiguous. The document clearly doesn't meet the requirement.

---

## Writing Requirement Prompts

### Step 1: Write the Objective (2-3 sentences)

**Template:**
```markdown
Objective:
Determine whether the document [establishes/describes/requires]
[MAIN THING], including:
- [Sub-requirement 1]
- [Sub-requirement 2]
- [Sub-requirement 3]
```

### Step 2: Define Core Evidence (3-5 bullets)

These are the MUST-HAVES for PASS.

**Template:**
```markdown
Core evidence to look for (minimal subset for PASS):
- A [TYPE_OF_ARTIFACT] that [WHAT_IT_SHOWS]
- Reference to [RELATED_ELEMENT] that demonstrates [CAPABILITY]
- Indication that [ACTIVITY] is performed, even if stored outside this document
```

**Tips:**
- Each bullet should be independently verifiable
- Use "or equivalent" for flexibility
- Specify when cross-references are acceptable

### Step 3: Provide Strong Examples (2-3 bullets)

**Template:**
```markdown
Examples of strong PASS evidence:
- A section titled "[SECTION_NAME]" describing [CONTENTS]
- A [ARTIFACT_TYPE] containing fields for [SPECIFIC_FIELDS]
- Statements like "[EXAMPLE_QUOTE]" indicating [WHAT_IT_MEANS]
```

### Step 4: Map the FLAG Zone (2-4 bullets)

**Template:**
```markdown
When to FLAG:
- [ARTIFACT] is mentioned but [CRITICAL_ELEMENT] is unclear
- It appears [PARTIAL_COMPLIANCE] but [MISSING_PIECE] is not explicit
- [CONFLICTING_STATEMENT_1] contradicts [CONFLICTING_STATEMENT_2]
```

### Step 5: Define FAIL Conditions (2-4 bullets)

**Template:**
```markdown
When to FAIL:
- No [REQUIRED_ELEMENT] is described
- The document explicitly [CONTRADICTS_REQUIREMENT]
- [CRITICAL_ACTIVITY] is mentioned only as [INSUFFICIENT_FORM]
```

### Step 6: List Typical OFIs (2-4 bullets)

**Template:**
```markdown
Typical OFIs (can still PASS):
- [ELEMENT] exists but [HOW_IT_COULD_BE_BETTER]
- [PROCESS] is defined but [ENHANCEMENT_OPPORTUNITY]
```

---

## Decision Logic & Calibration

### Status Determination Flowchart

```
                    ┌─────────────────────┐
                    │   Start Evaluation  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Does the clause    │
                    │  apply to this      │───No──▶ NOT_APPLICABLE
                    │  document type?     │
                    └──────────┬──────────┘
                               │ Yes
                    ┌──────────▼──────────┐
                    │  Is core evidence   │
                    │  present (directly  │───No──▶ FAIL
                    │  or by reference)?  │
                    └──────────┬──────────┘
                               │ Yes
                    ┌──────────▼──────────┐
                    │  Is the evidence    │
                    │  clear and          │───No──▶ FLAGGED
                    │  unambiguous?       │         (needs human review)
                    └──────────┬──────────┘
                               │ Yes
                    ┌──────────▼──────────┐
                    │       PASS          │
                    │  (note any OFIs)    │
                    └─────────────────────┘
```

### Conservative Bias Principle

When in doubt:
1. **PASS vs FLAGGED:** Prefer PASS and note OFIs
2. **FLAGGED vs FAIL:** Prefer FLAGGED (let human decide)
3. **Cross-references:** Accept as evidence that referenced process/record exists

### Calibration: The Three-Document Test

Test your prompt against:

1. **A clearly compliant document** → Should PASS with high confidence
2. **A clearly non-compliant document** → Should FAIL with high confidence
3. **A borderline document** → Should FLAG or PASS with medium confidence

If results don't match expectations, adjust your thresholds.

### Confidence Level Guidelines

| Level | When to Use |
|-------|-------------|
| **high** | Evidence is explicit, comprehensive, and directly addresses all criteria |
| **medium** | Evidence is present but incomplete, requires some inference, or has minor gaps |
| **low** | Evidence is sparse, ambiguous, uncertain, or requires significant assumptions |

---

## Common Pitfalls

### Pitfall 1: The Checklist Trap

❌ **Problem:** Treating every bullet in the standard as equally mandatory.

```markdown
# Bad - every element is a FAIL condition
When to FAIL:
- No device identification
- No life-cycle scope
- No responsibilities defined
- No review schedule
- No acceptability criteria
- No verification planning
- No P&PP planning
- No change control
```

✅ **Solution:** Group into "must have" vs "nice to have"

```markdown
# Good - only truly missing items cause FAIL
When to FAIL:
- No risk management plan concept is present
- Key elements (acceptability criteria, verification planning,
  OR P&PP information flow) are completely absent
```

### Pitfall 2: The Perfectionist Trap

❌ **Problem:** Setting the PASS bar at "exemplary" instead of "compliant."

```markdown
# Bad - requires perfection
Core evidence for PASS:
- Comprehensive flowchart showing all lifecycle phases
- Detailed role descriptions with named individuals
- Complete traceability matrix
- Explicit links to ALL related QMS processes
```

✅ **Solution:** Define minimum viable compliance

```markdown
# Good - minimum viable compliance
Core evidence for PASS:
- A defined process (procedure, section, or flowchart)
- Explicit or implicit coverage of lifecycle phases
- At least one clear indication of QMS integration
```

### Pitfall 3: The Vague Threshold Trap

❌ **Problem:** Using unmeasurable terms.

```markdown
# Bad - what does "adequate" mean?
Core evidence for PASS:
- Adequate documentation of the process
- Appropriate links to related systems
- Sufficient detail on responsibilities
```

✅ **Solution:** Use observable, specific criteria

```markdown
# Good - observable criteria
Core evidence for PASS:
- A documented process with named steps/activities
- At least one explicit reference to a related QMS process
- Named role(s) responsible for risk management
```

### Pitfall 4: The Missing FLAG Zone

❌ **Problem:** Binary PASS/FAIL with no room for uncertainty.

✅ **Solution:** Explicitly define the uncertain middle ground

```markdown
When to FLAG:
- Elements are present but relationships unclear
- Some parts detailed, other parts only mentioned
- Language could be interpreted multiple ways
```

---

## Database Schema

### Requirements Table

```sql
CREATE TABLE [standard]_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clause TEXT NOT NULL,           -- e.g., "4.1", "5.2.3"
    title TEXT NOT NULL,            -- Human-readable clause title
    requirement_text TEXT,          -- Full requirement prompt (Layer 3)
    evaluation_type TEXT,           -- Optional: "process", "record", "output"
    search_query TEXT,              -- Optional: keywords for document search
    display_order INTEGER DEFAULT 0,-- UI ordering
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Document Evaluations Table

```sql
CREATE TABLE document_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_name TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'error', 'failed')),
    overall_compliance_score NUMERIC,
    total_requirements INTEGER,
    requirements_passed INTEGER DEFAULT 0,
    requirements_failed INTEGER DEFAULT 0,
    requirements_flagged INTEGER DEFAULT 0,
    requirements_na INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Requirement Evaluations Table

```sql
CREATE TABLE requirement_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_evaluation_id UUID REFERENCES document_evaluations(id),
    requirement_id UUID REFERENCES [standard]_requirements(id),
    status TEXT CHECK (status IN ('PASS', 'FAIL', 'FLAGGED', 'PARTIAL', 'NOT_APPLICABLE', 'ERROR')),
    confidence_score TEXT CHECK (confidence_score IN ('low', 'medium', 'high')),
    evaluation_rationale TEXT,
    evidence_snippets JSONB DEFAULT '[]'::jsonb,
    gaps_identified TEXT[],
    recommendations TEXT[],
    llm_response JSONB,
    tokens_used INTEGER,
    evaluation_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Response Schema

### JSON Output Schema

```json
{
  "status": "PASS|FAIL|FLAGGED|NOT_APPLICABLE",
  "confidence": "low|medium|high",
  "rationale": "Brief 1-2 sentence explanation of the decision with key citations",
  "evidence": ["Page/Section citation with brief quote", "..."],
  "gaps": ["Finding/deficiency identified", "..."],
  "recommendations": ["Actionable suggestion to address gap", "..."]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | Final determination: PASS, FAIL, FLAGGED, or NOT_APPLICABLE |
| `confidence` | enum | Certainty level: low, medium, or high |
| `rationale` | string | Concise explanation (1-2 sentences) with citations |
| `evidence` | array | Page/section citations with brief supporting quotes |
| `gaps` | array | Deficiencies found (critical for FAIL/FLAGGED; OFIs for PASS) |
| `recommendations` | array | Actionable steps to address gaps |

---

## Worked Examples

### Example 1: Adapting for FDA 21 CFR Part 820

#### Master Prompt Customization

```markdown
You are an expert medical device quality management assessor with deep knowledge of FDA 21 CFR Part 820 (Quality System Regulation) and related FDA guidance documents. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from 21 CFR Part 820 Subparts C through O.

Context and assumptions:
- Treat the document as a quality system artifact (procedure, policy, record, etc.). It may reference other SOPs, work instructions, or device history records; clear cross-references are acceptable evidence that such systems/records exist.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. Do not score Subparts A-B (scope/definitions) as standalone requirements.
```

#### Requirement Prompt: 820.30(c) Design Input

```markdown
You are evaluating 21 CFR 820.30(c) – "Design Input".

Objective:
Determine whether the document requires establishing and maintaining procedures to ensure design input requirements are:
- Appropriately documented
- Addressing the intended use of the device
- Reviewed and approved

Core evidence to look for (minimal subset for PASS):
- A defined process for documenting design input requirements
- Requirement that inputs address intended use, user needs, and patient safety
- Evidence of review and approval of design inputs before release

Examples of strong PASS evidence:
- A "Design Input" section in the design control procedure with defined steps
- Design input template or checklist referenced
- Approval workflow or sign-off requirements specified

When to FLAG:
- Design inputs are mentioned but the process for documenting them is vague
- Review/approval is implied but not explicitly required
- Intended use linkage is unclear

When to FAIL:
- No design input process is described
- No requirement for documentation of design requirements
- No approval mechanism for design inputs

Typical OFIs (can still PASS):
- Process exists but traceability to intended use could be stronger
- Approval is required but roles/responsibilities are not clearly defined
```

### Example 2: Creating an IEC 62304 Prompt

#### Requirement Prompt: 5.1 Software Development Planning

**Step 1: Answer the Five Questions**

1. **Intent:** Ensure software development is planned, not ad-hoc
2. **Artifacts:** Software development plan, referenced standards
3. **Minimum for PASS:** A plan exists that covers lifecycle activities
4. **Genuine uncertainty:** Plan exists but doesn't address all required activities
5. **Clear FAIL:** No plan, or plan is just a schedule with no process content

**Step 2: Write the Prompt**

```markdown
You are evaluating IEC 62304:2006+A1:2015 clause 5.1 – "Software Development Planning".

Objective:
Determine whether the document establishes software development planning that:
- Defines or references a software development life cycle model
- Identifies the deliverables for each activity
- Addresses configuration management, problem resolution, and documentation

Core evidence to look for (minimal subset for PASS):
- A software development plan (or equivalent planning section)
- Reference to a software development lifecycle model (V-model, Agile, etc.)
- Identification of key deliverables (even at a high level)
- Reference to supporting processes (configuration management, problem resolution)

Examples of strong PASS evidence:
- A "Software Development Plan" section identifying lifecycle phases and outputs
- Statement like "Development follows a V-model lifecycle with deliverables defined per phase"
- References to separate configuration management and problem resolution procedures

When to FLAG:
- A plan exists but lifecycle model is only implied, not explicitly stated
- Some deliverables are identified but coverage appears incomplete
- Supporting processes (CM, problem resolution) are mentioned but not clearly linked

When to FAIL:
- No software development planning is described
- Document is only a schedule without process/deliverable content
- No lifecycle model is defined or referenced

Typical OFIs (can still PASS):
- Lifecycle model is named but phases aren't mapped to specific deliverables
- Plan exists but tool qualification approach isn't addressed
- Documentation requirements are generic rather than phase-specific
```

---

## Quick Reference

### Prompt Assembly Order
```
Final Prompt = Master Prompt + Instruction Block + Requirement Prompt
```

### Status Decision Tree
```
Clause applies? ─No─▶ NOT_APPLICABLE
       │ Yes
Core evidence? ─No─▶ FAIL
       │ Yes
Clear/unambiguous? ─No─▶ FLAGGED
       │ Yes
       ▼
      PASS (+ OFIs)
```

### Section Formulas

| Section | Formula |
|---------|---------|
| **Objective** | "Determine whether the document [establishes/describes/requires] [MAIN THING], including: [LIST]" |
| **Evidence** | "A [ARTIFACT TYPE] that [DEMONSTRATES WHAT]" |
| **FLAG** | "[THING] is mentioned, but [CRITICAL ASPECT] is unclear/ambiguous" |
| **FAIL** | "No [REQUIRED THING] is described" or "explicitly [CONTRADICTS]" |
| **OFI** | "[THING] exists but [ENHANCEMENT OPPORTUNITY]" |

### Final Checklist

Before deploying a new requirement prompt:

- [ ] Answered all Five Questions
- [ ] Objective is clear and specific
- [ ] Core evidence defines TRUE minimum (not perfection)
- [ ] Examples are concrete and observable
- [ ] FLAG zone covers genuine uncertainty
- [ ] FAIL conditions are unambiguous
- [ ] OFIs are improvements, not requirements
- [ ] Tested against known PASS/FAIL/borderline documents
- [ ] Total length under 600 words
