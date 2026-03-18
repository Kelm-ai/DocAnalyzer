# Email Draft — Response to Security Inquiry

---

**Subject:** RE: Security & Data Privacy — AI Compliance Agent

Parth,

Great question — happy to address this. I know there's a lot of concern around AI and data privacy right now, so let me walk through what we have in place and how client information is protected.

## AI Training — The Short Answer

**Our client data is NOT used to train any AI models.** This is the most important point.

We use the **API tier** of OpenAI, Anthropic (Claude), and Google Gemini — not the consumer-facing products like ChatGPT or Claude.ai. This distinction matters because:

- All three providers have **explicit, contractual commitments** that data sent through their APIs is not used for model training. These aren't just privacy policies — they're legally binding terms of service.
- **OpenAI's API Data Usage Policy** states: *"OpenAI does not train on your business data (data sent via the API)."*
- **Anthropic's Commercial Terms** explicitly exclude API inputs/outputs from training data.
- **Google's Gemini API Terms** confirm that paid API data is not used to improve their general models.

The common fear that "AI companies train on your data" stems from the **free consumer products**, which may use conversations for improvement. The paid API — which is what we use — operates under completely separate, stricter data handling agreements.

## How Client Data Flows Through the System

Here's what happens when a document is uploaded for evaluation:

1. **Upload & Validation** — The document is uploaded over HTTPS to our backend. We validate file type (PDF/DOCX only), check for empty files, and compute a SHA-256 hash for integrity.

2. **Secure Storage** — The document is stored in our Supabase database (managed PostgreSQL with encryption at rest) and Supabase Storage (encrypted cloud storage).

3. **AI Evaluation** — The document is sent over HTTPS to the AI provider's Files API for compliance evaluation. The provider processes it against our requirements framework and returns structured results (scores, findings, recommendations). The document content is processed transiently — it is not retained for training or shared with other customers.

4. **Results Storage** — Only the evaluation results are stored long-term in our database. Gemini auto-deletes uploaded files after ~47 hours, and our document summarizer explicitly deletes files from OpenAI after processing.

## Security Controls in Place

- **Encryption in Transit** — All communications use HTTPS/TLS, including to/from AI providers, our database, and our storage layer.
- **Encryption at Rest** — Supabase provides platform-level encryption for both the database and file storage.
- **Infrastructure Isolation** — Our application runs on Railway (PaaS) in isolated containers. Frontend and backend are separate services.
- **Access Controls** — CORS restrictions limit API access to our frontend domain only. Input validation is enforced on file types, sizes, and parameters.
- **Row Level Security** — Enabled on all database tables via Supabase PostgreSQL.
- **Rate Limiting** — Implemented to prevent abuse and manage API provider interactions responsibly.
- **Secrets Management** — All API keys and credentials are stored as environment variables in our hosting platform, not in code.

## What We're Actively Improving

We're continuously hardening the system as we scale. Key items on our roadmap:

- **User Authentication & Authorization** — Adding JWT-based authentication via Supabase Auth to provide per-user access control.
- **Multi-tenant Data Isolation** — Implementing organization-level data scoping so each client's data is fully isolated at the database level.
- **Audit Logging** — Building out a detailed audit trail for document access and evaluation activities.
- **Data Retention Policies** — Defining and automating document lifecycle management, including automatic cleanup after a defined retention period.
- **Automated File Cleanup** — Ensuring documents are fully removed from all storage layers (including AI provider file stores) when evaluations are deleted.
- **Security Headers** — Adding Content Security Policy, HSTS, and other standard HTTP security headers.

## Bottom Line

Client documents are encrypted in transit and at rest, processed transiently by AI providers under contractual no-training agreements, and stored in isolated infrastructure. We're building toward enterprise-grade access controls and audit capabilities as the tool matures.

Happy to jump on a call if the team wants to walk through any of this in more detail.

Best,
Matt
