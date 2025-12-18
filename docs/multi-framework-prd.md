# Multi-Framework Support PRD

**Document Version:** 1.0
**Date:** December 17, 2024
**Status:** Approved for Implementation

---

## Executive Summary

This PRD outlines the extension of DocAnalyzer from a single-SOP evaluation system (ISO 14971 Risk Management) to a multi-framework platform supporting multiple regulatory standards. Each framework will have its own configurable system prompt and set of requirements, enabling the platform to evaluate documents against various compliance standards such as Design Controls (21 CFR 820.30), Software Validation (IEC 62304), and Quality Management (ISO 13485).

---

## Problem Statement

### Current State
- DocAnalyzer is hardcoded to evaluate documents against ISO 14971:2019 (Risk Management) requirements only
- The system prompt is embedded in `vision_responses_evaluator.py` and cannot be changed without code modifications
- All requirements are stored in a single flat table with no organizational hierarchy
- Users cannot evaluate documents against different regulatory standards

### Desired State
- Support multiple evaluation frameworks, each with its own requirements and system prompt
- Enable administrators to configure new frameworks without code changes
- Allow users to select which framework to use when uploading documents
- Maintain full audit trail of which framework was used for each evaluation

---

## Goals and Non-Goals

### Goals
1. Introduce a "Framework" concept as the top-level organizational unit
2. Enable fully customizable system prompts per framework
3. Provide a UI for managing frameworks and their requirements
4. Allow framework selection during document upload
5. Display framework context throughout the evaluation workflow
6. Migrate existing data to a default "Risk Management" framework

### Non-Goals
- Multi-tenant/organization support (out of scope for this release)
- Framework versioning or change tracking
- Automated requirement import from standard documents
- Cross-framework comparisons or reports

---

## User Stories

### Administrator
1. **As an administrator**, I want to create a new evaluation framework so that I can evaluate documents against different regulatory standards.
2. **As an administrator**, I want to customize the system prompt for each framework so that the AI evaluator has appropriate context for the standard being assessed.
3. **As an administrator**, I want to add, edit, and delete requirements within a framework so that the evaluation criteria match the regulatory standard.
4. **As an administrator**, I want to deactivate a framework without deleting it so that historical evaluations remain valid.

### Evaluator
1. **As an evaluator**, I want to select which framework to use when uploading a document so that it is evaluated against the correct standard.
2. **As an evaluator**, I want to see which framework was used for an evaluation so that I understand the context of the results.
3. **As an evaluator**, I want to browse all available frameworks so that I can understand what evaluation types are supported.

---

## Functional Requirements

### FR1: Framework Management

#### FR1.1: Framework Data Model
A framework consists of:
- **Name** (required): Human-readable name (e.g., "Risk Management")
- **Slug** (required, unique): URL-friendly identifier (e.g., "risk-management")
- **Description** (optional): Detailed description of the framework
- **Standard Reference** (optional): The standard(s) referenced (e.g., "ISO 14971:2019")
- **System Prompt** (required): The AI instruction prompt used during evaluation
- **Is Active** (boolean): Whether the framework is available for new evaluations
- **Display Order** (integer): Controls ordering in UI lists

#### FR1.2: Framework CRUD Operations
- List all frameworks with requirement counts
- Create new framework (admin mode only)
- Update framework details including system prompt (admin mode only)
- Delete framework (admin mode only, only if no evaluations exist)
- Soft-delete via `is_active` flag for frameworks with existing evaluations

#### FR1.3: Framework UI
- **Frameworks Index Page** (`/frameworks`):
  - DataTable showing all frameworks
  - Columns: Name, Standard Reference, Requirements Count, Status (Active/Inactive), Actions
  - Click row to navigate to framework detail
  - "Add Framework" button (visible in admin mode only)

- **Framework Detail Page** (`/frameworks/{id}`):
  - Header section with framework metadata
  - System prompt editor (large textarea, admin mode only)
  - Requirements section with existing DataTable functionality
  - All requirement CRUD operations scoped to this framework

### FR2: Requirements Association

#### FR2.1: Requirements Linked to Framework
- Each requirement must belong to exactly one framework
- Requirements table gains `framework_id` foreign key
- Existing requirements migrated to default "Risk Management" framework

#### FR2.2: Requirements API Changes
- `GET /api/requirements` accepts optional `framework_id` query parameter
- `POST /api/requirements` requires `framework_id` in request body
- Requirements returned with framework context where relevant

### FR3: Document Evaluation Integration

#### FR3.1: Framework Selection on Upload
- Document upload UI includes required framework dropdown
- Dropdown populated from active frameworks only
- Selected `framework_id` sent with upload request

#### FR3.2: Evaluation Uses Framework Config
- Evaluation process loads system prompt from selected framework
- Evaluation process loads requirements filtered by framework_id
- `document_evaluations` table stores `framework_id` for audit trail

#### FR3.3: Framework Display in Results
- Evaluations list shows framework name column
- Results page displays framework name and description
- Reports include framework context

### FR4: Data Migration

#### FR4.1: Migration Strategy
1. Create `frameworks` table
2. Insert default "Risk Management" framework with existing system prompt
3. Add nullable `framework_id` to `iso_requirements`
4. Backfill all existing requirements with Risk Management framework_id
5. Make `framework_id` NOT NULL
6. Add nullable `framework_id` to `document_evaluations`
7. Backfill existing evaluations with Risk Management framework_id

---

## Technical Specification

### Database Schema

#### New Table: `frameworks`
```sql
CREATE TABLE frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  standard_reference TEXT,
  system_prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_frameworks_slug ON frameworks(slug);
CREATE INDEX idx_frameworks_is_active ON frameworks(is_active);
```

#### Modified Table: `iso_requirements`
```sql
ALTER TABLE iso_requirements
ADD COLUMN framework_id UUID REFERENCES frameworks(id);

CREATE INDEX idx_requirements_framework_id ON iso_requirements(framework_id);
```

#### Modified Table: `document_evaluations`
```sql
ALTER TABLE document_evaluations
ADD COLUMN framework_id UUID REFERENCES frameworks(id);

CREATE INDEX idx_evaluations_framework_id ON document_evaluations(framework_id);
```

### API Endpoints

#### Framework Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/frameworks` | List all frameworks | Public |
| POST | `/api/frameworks` | Create framework | Admin |
| GET | `/api/frameworks/{id}` | Get framework details | Public |
| PUT | `/api/frameworks/{id}` | Update framework | Admin |
| DELETE | `/api/frameworks/{id}` | Delete framework | Admin |

#### Modified Endpoints
| Endpoint | Change |
|----------|--------|
| `POST /api/upload` | Add required `framework_id` form field |
| `GET /api/requirements` | Add optional `framework_id` query param |
| `POST /api/requirements` | Add required `framework_id` in body |

### Evaluator Changes
The `VisionResponsesEvaluator` class will be modified to:
1. Accept `system_prompt` parameter in constructor (instead of hardcoded `BASE_INSTRUCTION`)
2. Load requirements filtered by `framework_id`
3. Include framework context in evaluation metadata

### Frontend Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/frameworks` | `FrameworksList.tsx` | Index of all frameworks |
| `/frameworks/:id` | `FrameworkDetail.tsx` | Framework config + requirements |
| `/requirements` | Redirect | Redirects to `/frameworks` |

---

## Default Framework Configuration

### Risk Management Framework
The initial migration will create a "Risk Management" framework with the following configuration:

**Name:** Risk Management
**Slug:** risk-management
**Standard Reference:** ISO 14971:2019
**System Prompt:**
```
You are an expert medical device risk-management assessor with deep knowledge of ISO 14971:2019 and ISO/TR 24971. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from ISO 14971:2019 clauses 4-10.

Context and assumptions:
- Treat the document as a top-level risk-management artifact (procedure, RMP, RMR, etc.). It may reference other SOPs, work instructions, or records; clear cross-references are acceptable evidence that such systems/records exist.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. Do not score clauses 1-3 or annexes as standalone requirements.

How to review each clause invocation:
1) Understand what type of document this is and how it fits the risk-management system.
2) Focus ONLY on the requested clause; search the entire document (headings, lists, tables, appendices, images/OCR) for relevant evidence of the process and expected records.
3) Presence vs adequacy: assess basic alignment with the clause. Minor ambiguity or "could be better" solutions can still PASS; treat those as opportunities for improvement (OFIs).
4) Cross-references: if the document points to another controlled SOP or record, consider that evidence that the process/record exists; do not invent details that are not written.

Decision logic (map to our schema):
- PASS: Requirement is clearly addressed; process/structure is described and evidence/records are indicated (directly or via cross-reference). Capture OFIs separately.
- FLAGGED (flag_for_review): Evidence exists but is incomplete/ambiguous or needs human confirmation; or statements conflict. Use for genuine uncertainty.
- FAIL: Core expectations are missing/contradicted; required process/records are not defined and no reasonable indication they exist.
- NOT_APPLICABLE: Use only if the clause truly does not apply to the document provided.
When in doubt between PASS and FLAGGED, prefer PASS and note OFIs; use FLAGGED only when a human needs to review.

Vision handling:
- Use both text and visual content. When graphs appear, read axis titles/units and summarise trends. When tables appear, read cells and preserve structure. If text appears in an image, transcribe it before reasoning. If something is unreadable, write "[unreadable]" and move on.
```

---

## UI Wireframes

### Frameworks Index Page
```
+----------------------------------------------------------+
|  Frameworks                                               |
|  Configure evaluation frameworks and their requirements   |
|                                                          |
|  [+ Add Framework]  (admin mode only)                    |
|                                                          |
|  +------------------------------------------------------+|
|  | Name              | Standard    | Reqs | Status |    ||
|  +------------------------------------------------------+|
|  | Risk Management   | ISO 14971   | 38   | Active | >  ||
|  | Design Controls   | 21 CFR 820  | 24   | Active | >  ||
|  | Software Valid.   | IEC 62304   | 42   | Draft  | >  ||
|  +------------------------------------------------------+|
+----------------------------------------------------------+
```

### Framework Detail Page
```
+----------------------------------------------------------+
|  < Back to Frameworks                                     |
|                                                          |
|  Risk Management                                          |
|  ISO 14971:2019                                          |
|  [Edit] [Delete]  (admin mode only)                      |
|                                                          |
|  +------------------------------------------------------+|
|  | System Prompt                              [Collapse] ||
|  +------------------------------------------------------+|
|  | +--------------------------------------------------+ ||
|  | | You are an expert medical device risk-management| ||
|  | | assessor with deep knowledge of ISO 14971:2019  | ||
|  | | and ISO/TR 24971...                             | ||
|  | +--------------------------------------------------+ ||
|  |                                            [Save]    ||
|  +------------------------------------------------------+|
|                                                          |
|  Requirements (38)                    [+ Add Requirement] |
|  +------------------------------------------------------+|
|  | Title                    | Clause | Order | Actions  ||
|  +------------------------------------------------------+|
|  | Risk management process  | 4.1    | 1     | ...      ||
|  | Top management commit... | 4.2    | 2     | ...      ||
|  +------------------------------------------------------+|
+----------------------------------------------------------+
```

### Upload Page with Framework Selector
```
+----------------------------------------------------------+
|  Upload Document                                          |
|                                                          |
|  Select Framework: [Risk Management        v]             |
|                                                          |
|  +------------------------------------------------------+|
|  |                                                      ||
|  |         Drag and drop your document here             ||
|  |              or click to browse                      ||
|  |                                                      ||
|  +------------------------------------------------------+|
|                                                          |
|  [Start Upload & Evaluation]                             |
+----------------------------------------------------------+
```

---

## Success Metrics

1. **Framework Creation**: Administrators can create a new framework in < 5 minutes
2. **Evaluation Accuracy**: Framework-specific prompts maintain or improve evaluation quality
3. **User Experience**: Users can select a framework and complete an evaluation without confusion
4. **Data Integrity**: All existing evaluations remain valid and associated with the correct framework

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration fails mid-way | Data corruption | Use transactional migrations, test on staging first |
| Users upload without selecting framework | Evaluation fails | Make framework selection required, validate on frontend and backend |
| Long system prompts affect performance | Slow evaluations | No expected impact; prompts are small relative to documents |
| Deleted framework breaks reports | Missing context | Use soft-delete (is_active flag) instead of hard delete |

---

## Implementation Plan

### Phase 0: Setup (0.5 day)
- Create feature branch
- Write and review PRD

### Phase 1: Database (1 day)
- Create frameworks table migration
- Modify requirements table
- Modify evaluations table
- Write and test data migration

### Phase 2: Backend API (1-2 days)
- Add Framework Pydantic models
- Implement Framework CRUD endpoints
- Modify requirements endpoints
- Modify upload endpoint
- Update evaluator for dynamic prompts

### Phase 3: Frontend - Frameworks (1-2 days)
- Create Frameworks index page
- Create Framework detail page
- Add system prompt editor
- Update routing and navigation

### Phase 4: Frontend - Integration (1 day)
- Add framework selector to upload
- Update evaluations list
- Update results page
- Update API client

### Phase 5: Testing (0.5 day)
- End-to-end testing
- Migration verification
- Admin mode testing

**Total Estimated Effort:** 5-7 days

---

## Appendix

### Future Enhancements (Out of Scope)
- Framework templates for common standards
- Import requirements from CSV/JSON
- Framework versioning with change history
- Cross-framework requirement mapping
- Framework-specific report templates
- API for bulk framework management
