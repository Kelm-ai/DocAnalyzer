# Internal Security Overview — AI Compliance Agent

**Date:** February 2026
**Classification:** Internal Use Only
**Purpose:** Full-transparency security posture assessment for the team

---

## 1. AI Provider Data Privacy (The Training Question)

### What We Tell Clients (And It's True)

We use the **API tier** of all three providers. API data is contractually excluded from model training:

| Provider | Model(s) Used | Training Policy | Reference |
|----------|--------------|-----------------|-----------|
| OpenAI | gpt-5.1, gpt-5-nano | API data NOT used for training | [Enterprise Privacy](https://openai.com/enterprise-privacy/) |
| Anthropic | claude-opus-4-5 | API inputs/outputs excluded from training | [Commercial Terms](https://www.anthropic.com/policies) |
| Google Gemini | gemini-3-pro-preview | Paid API data not used for model improvement | [Gemini API Terms](https://ai.google.dev/terms) |

### What We Should Be Aware Of

- Providers **may retain API data temporarily** (typically 0–30 days) for abuse monitoring and safety purposes. This is standard across all three.
- When `VISION_PROVIDER=dual`, the same document gets sent to **two providers** simultaneously. This doubles the data exposure surface.
- Supporting documents are summarized via OpenAI (gpt-5-nano) before the primary evaluation — that's an additional data transmission beyond the main evaluation call.
- The document summarizer **does explicitly delete files** from OpenAI after processing (`client.files.delete()`). The main evaluator does **not** delete files from OpenAI or Claude after evaluation.

---

## 2. Current Security Architecture

### What's In Place

#### Transport Layer
- All external communications use HTTPS/TLS
- Frontend: `https://frontend-docanalyzer-production.up.railway.app`
- Backend: Railway-managed HTTPS
- All AI provider API calls: HTTPS
- Supabase connections: HTTPS

#### Infrastructure
- **Railway PaaS** — isolated container hosting
- Frontend and backend are **separate Railway services**
- No shared compute with other tenants at the application layer
- Health check endpoint at `/api/health`

#### Database (Supabase PostgreSQL)
- Platform-level encryption at rest (Supabase default)
- Row Level Security (RLS) **enabled** on all 7 tables
- Access requires authenticated Supabase keys

#### API Layer
- CORS configured — production allows only `https://frontend-docanalyzer-production.up.railway.app`
- File type validation: `.pdf`, `.docx`, `.doc` only
- Empty file rejection
- Max 10 supporting documents per evaluation
- Framework ID and document role validation

#### Rate Limiting
- Custom token-based rate limiter for Anthropic/Claude (rate_limiter.py)
- Sliding window algorithm with configurable limits
- 85% safety margin to avoid hitting hard limits
- Handles 429 responses with backoff

#### Secrets
- `.env` is in `.gitignore`
- Railway uses environment variables (not files) in production
- `.env.example` has placeholder values only

---

### What's NOT In Place (Full Honesty)

#### No User Authentication
- **There is no login system.** No JWT, no OAuth, no sessions.
- Anyone with the URL can access all functionality.
- All API endpoints are unauthenticated.
- This was acceptable for single-user/internal use but is NOT acceptable for multi-user or client-facing deployment.

**Risk:** Any network access = full access to all evaluations, documents, and results.

#### RLS Policies Are Permissive
- RLS is *enabled* on all tables, but every policy uses `USING (true)` — meaning all rows are accessible to all requests.
- No `user_id` or `organization_id` columns exist in any table.
- **In practice, RLS provides zero access control.**

```sql
-- Current state (schema.sql:170-176):
CREATE POLICY "Allow full access to document_evaluations"
  ON document_evaluations FOR ALL USING (true);
-- This applies to ALL tables
```

**Risk:** If we ever add multiple users, every user can see every other user's data unless this is fixed.

#### No HTTP Security Headers
None of the following are configured:
- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options`
- `X-Content-Type-Options`
- `X-XSS-Protection`
- `Referrer-Policy`

**Risk:** Standard browser-level protections are missing. Low risk for API-only backend, but frontend should have these.

#### No File Cleanup on Evaluation Deletion
- When a user deletes an evaluation, database records are deleted (CASCADE).
- **But files remain in Supabase Storage.** No `storage.remove()` call is made.
- **Files remain on OpenAI and Claude servers.** No `files.delete()` call is made.
- Only Gemini files auto-expire (~47 hours).

**Risk:** Storage leak accumulates over time. Client documents persist in cloud storage even after "deletion."

#### No Audit Trail
- No `created_by` or `updated_by` fields on any table
- No access logging beyond basic application logs
- Cannot answer "who accessed what, when"

**Risk:** No forensic capability if a data access question arises.

#### Temp File Handling
- `tempfile.NamedTemporaryFile(delete=False)` is used during processing
- Cleanup is in try/except blocks with `pass` on failure
- If the process crashes, temp files persist in `/tmp/`
- No secure deletion (file content not overwritten before removal)

**Risk:** Document content could persist on the server filesystem in crash scenarios.

#### Admin Mode
- `ADMIN_MODE=true` in production environment
- Enables creation, modification, and deletion of compliance frameworks and requirements
- No authentication required

**Risk:** Anyone with API access can modify evaluation frameworks.

#### No Prompt Injection Protection
- User-uploaded documents are sent directly to AI providers with system prompts
- No sanitization or boundary enforcement between document content and instruction content

**Risk:** A specially crafted document could potentially influence AI evaluation behavior. Low practical risk given the controlled use case, but worth noting.

---

## 3. Data Flow Diagram (Detailed)

```
                              EXTERNAL SERVICES
                    ┌─────────────────────────────────────────┐
                    │                                         │
User Browser        │   ┌──────────┐  ┌──────────┐  ┌──────┐│
    │               │   │  OpenAI  │  │  Gemini  │  │Claude││
    │ HTTPS         │   │ Files API│  │ Files API│  │Files ││
    │               │   │ Chat API │  │ GenAI API│  │Msgs  ││
    ▼               │   └────▲─────┘  └────▲─────┘  └──▲───┘│
┌────────┐          │        │             │            │    │
│Frontend│──HTTPS──►│  ┌─────┴─────────────┴────────────┘    │
│(React) │          │  │                                     │
└────────┘          │  │  ┌──────────────────────────┐       │
                    │  │  │   FastAPI Backend         │       │
                    │  │  │   (Railway Container)     │       │
                    │  │  │                           │       │
                    │  │  │  - Upload validation      │       │
                    │  │  │  - DOCX→PDF conversion    │       │
                    │  │  │  - SHA-256 hashing        │       │
                    │  │  │  - Evaluation queue        │       │
                    │  │  │  - Rate limiting (Claude)  │       │
                    │  │  └──────────┬────────────────┘       │
                    │  │             │                        │
                    │  │   ┌────────▼────────┐               │
                    │  │   │    Supabase     │               │
                    │  │   │  ┌────────────┐ │               │
                    │  │   │  │ PostgreSQL │ │               │
                    │  │   │  │ (RLS on)   │ │               │
                    │  │   │  └────────────┘ │               │
                    │  │   │  ┌────────────┐ │               │
                    │  │   │  │  Storage   │ │               │
                    │  │   │  │ (documents)│ │               │
                    │  │   │  └────────────┘ │               │
                    │  │   └─────────────────┘               │
                    └──┼─────────────────────────────────────┘
                       │
            Data sent to providers:
            - Full PDF documents (via Files API)
            - Requirement text + system prompts
            - Supporting document summaries
```

---

## 4. Prioritized Security Hardening Roadmap

### P0 — Do Before Expanding Access

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | **Add Supabase Auth** (JWT-based login) | Medium | Blocks unauthorized access |
| 2 | **Add `user_id`/`org_id` to all tables** | Medium | Enables data isolation |
| 3 | **Rewrite RLS policies** with `auth.uid()` checks | Low | Enforces per-user data boundaries |
| 4 | **Gate admin endpoints** behind authentication | Low | Prevents unauthorized framework modification |

### P1 — Do Soon

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 5 | **Add HTTP security headers** (CSP, HSTS, etc.) | Low | Standard browser protections |
| 6 | **Implement file cleanup on deletion** (Supabase Storage + provider APIs) | Medium | Prevents storage leak, honors deletion intent |
| 7 | **Add audit logging** (who did what, when) | Medium | Forensic capability, compliance readiness |
| 8 | **Fix temp file handling** (context managers, guaranteed cleanup) | Low | Prevents document content leak in crash scenarios |

### P2 — Do As We Scale

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 9 | **Define data retention policy** + implement auto-cleanup | Medium | Limits data exposure window |
| 10 | **Extend rate limiting** to OpenAI and Gemini | Low | Prevents runaway costs and abuse |
| 11 | **Add prompt injection boundaries** | Low | Hardens AI evaluation against adversarial documents |
| 12 | **Sanitize error messages** in production responses | Low | Reduces information leakage |
| 13 | **Add request/response logging middleware** | Medium | Enables security monitoring |

---

## 5. Key Files Reference

| File | What It Contains |
|------|-----------------|
| `api/app.py` | Main backend — CORS config, upload endpoints, deletion logic, all API routes |
| `schema.sql` | Database schema — all table definitions, RLS policies (lines 160-176) |
| `api/vision_responses_evaluator.py` | AI provider integration — file uploads, evaluation calls, fallback logic |
| `api/document_summarizer.py` | Supporting doc summarization — includes explicit OpenAI file deletion |
| `api/rate_limiter.py` | Token-based rate limiting for Anthropic/Claude |
| `api/document_converter.py` | DOCX-to-PDF conversion via LibreOffice |
| `api/evaluation_queue.py` | In-memory evaluation queue with concurrency control |
| `.env` | All secrets (gitignored, env vars in prod) |
| `nixpacks.toml` | Build config — LibreOffice installation |
| `railway.json` | Deployment config — health check, start command |

---

## 6. Summary

**What we can confidently say to clients:**
- AI providers do not train on data sent via their APIs (contractual)
- All data is encrypted in transit (HTTPS) and at rest (Supabase platform encryption)
- Documents are processed transiently by AI providers
- Infrastructure is isolated on Railway PaaS

**What we should fix before saying "enterprise-ready":**
- User authentication (none exists)
- Per-user/org data isolation (RLS is cosmetic right now)
- File cleanup lifecycle (deletion doesn't actually remove files from storage)
- Audit logging (can't trace who did what)

The tool is solid for its current use case (internal, controlled access). The path to multi-user/client-facing deployment requires the P0 items above.
