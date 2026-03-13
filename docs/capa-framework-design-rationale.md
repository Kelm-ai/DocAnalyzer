# CAPA Framework Design Rationale

Design decisions and thinking behind each of the 13 CAPA Process Assessment requirements.

Source material: `docs/CAPA Process Assessment Requirements.xlsx` (4 sheets)
Evaluation guide: `docs/standards-evaluation-framework.md`

---

## Overall Design Decisions

### Why 13 Process Steps (Not 46+ Clauses)?

The Excel maps CAPA to ~32 clause references across 5 regulatory sources (reduced from 63 after the QMSR transition removed 21 CFR 820.100), which consolidate into ~32 unique clause-by-clause details. We chose to evaluate at the **13 process-step level** instead:

1. **Cost**: The evaluation engine sends one LLM call per requirement with the entire PDF attached. 13 calls is manageable; 46+ nearly triples cost and time with diminishing returns.
2. **Auditor alignment**: Auditors assess CAPA SOPs by process step ("does this SOP cover investigation?"), not by sub-clause ("does this SOP satisfy ISO 13485 8.5.2 b) specifically?"). The 13 steps mirror how a real audit finding would be written.
3. **Clause detail is embedded, not lost**: Each requirement prompt includes the specific regulatory clauses it covers, so the AI evaluator still has clause-level awareness — it's just not a separate scoreable line item.
4. **UX**: The results page is designed for a manageable number of requirements. 46+ rows would overwhelm the UI without a grouping/hierarchy feature that doesn't exist today.

### Why These Specific 13 Steps?

The 13 steps come directly from Sheet 1 of the Excel and map to the CAPA lifecycle as defined across the applicable regulations. They cover the complete CAPA process from data input through management oversight:

```
Data In → Triage → Investigate → Assess Impact → Plan → Verify → Implement → Check Effectiveness → Close → Communicate → Review → (Combo Products) → Prevent
```

Steps 1-11 are the core CAPA lifecycle that every organization needs. Steps 12-13 address specialized areas (combination products and proactive prevention) that round out a comprehensive assessment.

### Standards Referenced in the Master Prompt

The master prompt references 5 regulatory sources (21 CFR 820.100 was removed per the QMSR transition effective Feb 2, 2026). The primary standard is:

- **ISO 13485:2016 (8.5.2, 8.5.3)** — the international device QMS CAPA requirements. Per the QMSR transition (effective Feb 2, 2026), ISO 13485 is now incorporated by reference into 21 CFR Part 820, replacing the former 21 CFR 820.100.

The contextual standards are:

- **21 CFR 211.192** — FDA drug product investigation requirements (batch record review, OOS/OOT). Only relevant for pharma or drug-device manufacturers.
- **EU MDR 2017/745** — European device regulation. Relevant for vigilance reporting (Art. 83) and PMS linkage (Annex I 20.4). Only relevant if selling in EU.
- **21 CFR 4.4** — Combination product CAPA (amended per QMSR to reference ISO 13485 8.4, 8.5.1-8.5.3 instead of former 820.100). Only relevant for drug-device or biologic-device combinations.
- **ICH Q10** — Pharmaceutical quality system guidance. Not a regulation — it's a lifecycle CAPA approach guide. Referenced for pharma context.

The master prompt includes all five so the AI can recognize evidence for any of them, but the individual requirement prompts scope which clauses matter per step.

---

## Requirement-by-Requirement Rationale

### CAPA-01: Data Collection & Analysis

**Five Questions:**

1. **Intent**: Ensure the CAPA system doesn't operate in a vacuum — it must be fed by systematic data review, not just individual complaint reactions. This is the "input valve" of the CAPA system.
2. **Artifacts**: Data source lists, trending procedures, complaint-to-CAPA interface references, analysis reports.
3. **Minimum PASS**: The SOP names at least a few data sources (complaints, NCMRs, audits) and references some kind of trending/analysis. It doesn't need to list every possible source exhaustively.
4. **Genuine uncertainty**: Data sources are mentioned generically ("quality data") without specifics, or trending is referenced without any defined frequency or methodology.
5. **Clear FAIL**: No data collection or analysis process described at all — CAPAs only arise from individual events with no systematic review.

**Key design choice**: We require "at least complaints, nonconformances, and audits" as the minimum data source list. This is deliberately lower than the full ISO 13485 8.5.2 a) list (which also includes "processes, work operations, concessions, quality audit reports, quality records, service records, complaints, returned product, and other sources"). A SOP that covers the big three can PASS; the rest are OFIs.

**Best practices incorporated**:
- "Preventive actions driven by trend data" → strengthened the trending/statistical analysis evidence criteria
- Batch record review (211.192) is called out as an OFI rather than a hard requirement, since it only applies to pharma

---

### CAPA-02: CAPA Initiation & Triage

**Five Questions:**

1. **Intent**: Not every nonconformity needs a full CAPA. This step exists to ensure there's a rational decision point that determines the right level of response, proportionate to risk.
2. **Artifacts**: Triage decision trees, CAPA initiation forms, risk-based classification matrices, owner assignment records.
3. **Minimum PASS**: There are defined criteria for when to open a CAPA (vs. correction only or no action), someone is assigned as accountable, and there's some indication of timeliness.
4. **Genuine uncertainty**: Triage is mentioned but the decision criteria or risk classification aren't clear. Or the distinction between correction and corrective action is blurred.
5. **Clear FAIL**: No initiation criteria at all — everything or nothing becomes a CAPA with no decision logic.

**Key design choice**: The distinction between "correction" (immediate fix) and "corrective action" (systemic fix to prevent recurrence) is a core evaluation criterion, not an OFI. This is because ISO 13485 explicitly distinguishes the two, and conflating them is a common audit finding.

**Best practices incorporated**:
- "Formal CAPA triage step" → becomes a strong PASS example (decision tree or flowchart)
- "Single accountable CAPA owner" → becomes core evidence
- "Tiered CAPA classification with defined timelines" → becomes a strong PASS example
- "Documented rationale for investigation depth" → adapted as OFI for triage ("documented rationale for no action decisions")

---

### CAPA-03: Investigation & Root Cause Analysis

**Five Questions:**

1. **Intent**: Corrective actions are only as good as the investigation behind them. This step ensures the organization doesn't jump from "problem" to "fix" without understanding why the problem occurred.
2. **Artifacts**: Investigation procedures, RCA tool templates, completed investigation records, root cause conclusions.
3. **Minimum PASS**: There's a defined investigation process, at least one RCA methodology is named, and documentation of findings is required.
4. **Genuine uncertainty**: Investigation exists but RCA methodology is vague ("investigate thoroughly"), or it's unclear what must be documented.
5. **Clear FAIL**: No investigation phase exists — the SOP goes from problem identification directly to action planning.

**Key design choice**: We don't require a specific RCA tool (5-Why vs. fishbone vs. fault tree). The SOP just needs to reference "at least one" methodology. Requiring a specific one would be prescriptive beyond what the standards demand.

**Best practices incorporated**:
- "Prohibit 'human error' as root cause alone" → incorporated as a FLAG condition, not a FAIL. The standards don't explicitly prohibit it, but auditors consistently cite it. It's flagged because it indicates a likely superficial investigation that a human reviewer should assess.
- "Documented rationale for investigation depth" → incorporated as OFI (criteria for RCA method selection based on complexity/risk)

---

### CAPA-04: Impact Assessment & Scope Extension

**Five Questions:**

1. **Intent**: A problem in one batch/product may exist in others. This step prevents tunnel vision — forcing the organization to look beyond the immediate incident.
2. **Artifacts**: Impact assessment checklists, scope extension records, batch review records, vigilance/FSCA procedure cross-references.
3. **Minimum PASS**: There's a defined step to check whether other batches/products/processes are affected, with some criteria for when to extend scope.
4. **Genuine uncertainty**: Impact assessment is mentioned but triggering criteria are not defined. Or batch extension is covered for drugs but not devices.
5. **Clear FAIL**: No impact assessment at all — the CAPA only addresses the immediate incident.

**Key design choice**: This step is particularly important for pharma organizations because 21 CFR 211.192 explicitly requires batch extension ("The investigation shall extend to other batches..."). For pure device companies, impact assessment is still expected but the regulatory language is less explicit. The requirement prompt handles this by making 211.192 batch extension an OFI rather than core evidence.

**Best practices incorporated**:
- "Mandatory risk file impact assessment" → adapted as OFI (risk management file update consideration)
- "Benefit-risk reassessment when applicable" → included as OFI for safety-related CAPAs

---

### CAPA-05: Action Planning

**Five Questions:**

1. **Intent**: Actions should be planned, not ad-hoc. The plan should trace back to the root cause and have clear accountability.
2. **Artifacts**: CAPA plan templates, action descriptions with owners/timelines, approval records.
3. **Minimum PASS**: Documented plan required with actions, owners, and timelines. Actions must address root cause. Plan requires approval.
4. **Genuine uncertainty**: Plan is required but not all three elements (actions, owners, timelines) are specified. Or link to root cause isn't explicit.
5. **Clear FAIL**: No action planning — jumps from investigation to implementation, or actions are generic with no documented plans.

**Key design choice**: We separate "action planning" (CAPA-05) from "verification" (CAPA-06) and "implementation" (CAPA-07) because the standards treat them as distinct activities. Some SOPs merge them, which is fine — the AI evaluator will find the evidence wherever it appears. But evaluating them separately ensures none is overlooked.

**Best practices incorporated**:
- "Systemic actions preferred over training-only" → included as OFI. We don't FAIL a SOP for not explicitly stating this preference, but it's a recognized best practice that strengthens the procedure.
- "Separate containment from root cause actions" → included as OFI (interim containment as a distinct step)
- "Effectiveness criteria defined upfront" → included as OFI in action planning (should be defined here, verified in CAPA-08)

---

### CAPA-06: Verification & Validation of Actions

**Five Questions:**

1. **Intent**: Actions must be checked to ensure they work AND don't break something else. The "adverse effect" check is a unique regulatory requirement — especially for devices where a fix could introduce new safety risks.
2. **Artifacts**: V&V records, adverse effect assessments, design V&V protocols (if design changes).
3. **Minimum PASS**: V&V of actions is required, adverse effect assessment is required, and documentation of these activities exists.
4. **Genuine uncertainty**: V&V is mentioned but the distinction between verification and validation is unclear, or adverse effect assessment is implied but not explicit.
5. **Clear FAIL**: No V&V step exists, or no adverse effect assessment.

**Key design choice**: The adverse effect assessment is core evidence, not an OFI. ISO 13485 8.5.2 e) explicitly requires verifying that the action "does not adversely affect the finished device." This is a must-have.

**Best practices incorporated**:
- "Mandatory risk file impact assessment" → included as OFI (risk file update from CAPA actions)

---

### CAPA-07: Implementation

**Five Questions:**

1. **Intent**: Planned actions must actually be executed, documented through change control, and communicated via training. This bridges the gap between "what we planned" and "what we did."
2. **Artifacts**: Change control records, updated SOPs, training records, implementation evidence.
3. **Minimum PASS**: Actions are implemented and recorded, change control is referenced, training is indicated.
4. **Genuine uncertainty**: Change control is vaguely referenced, or training is implied but not required.
5. **Clear FAIL**: No implementation process described, or changes made without change control.

**Key design choice**: This is intentionally the shortest requirement prompt (~350 words). Implementation is straightforward — the complexity is in the planning and verification steps. The prompt focuses on the interface points (change control, document control, training) rather than the actions themselves.

---

### CAPA-08: Effectiveness Verification

**Five Questions:**

1. **Intent**: Did the fix actually work? This is distinct from CAPA-06 (which checks that the action doesn't cause harm). Effectiveness verification checks whether the original problem has been prevented from recurring.
2. **Artifacts**: Effectiveness criteria, verification methods, closure/re-opening decisions.
3. **Minimum PASS**: Effectiveness verification is a defined step, methods are referenced, success criteria exist, and there's a path for ineffective CAPAs.
4. **Genuine uncertainty**: Effectiveness is required but criteria aren't defined, or timing isn't addressed (could be done immediately, which is too early).
5. **Clear FAIL**: No effectiveness check — CAPAs close after implementation without verifying the fix worked.

**Key design choice**: This step has the most best practice integration because it's where SOPs most commonly fall short. The timing issue (delayed vs. immediate checks) is the biggest gap auditors find.

**Best practices incorporated**:
- "Effectiveness criteria defined upfront" → included as OFI. The criteria should be set during action planning (CAPA-05) and verified here. If they're only defined at verification time, it's too late — but it can still PASS.
- "Delayed effectiveness checks" → included as a strong PASS example AND an OFI. A SOP that allows immediate closure after implementation is weaker but can still PASS if effectiveness verification is otherwise described.
- "Independent Quality closure approval" → included as OFI for effectiveness sign-off.

---

### CAPA-09: Closure & Documentation

**Five Questions:**

1. **Intent**: CAPAs must have a defined endpoint with required records. ISO 13485 8.5.2/8.5.3 (records) and 211.192 both require written records of investigations, conclusions, and follow-up.
2. **Artifacts**: Closure checklists, CAPA records, retention schedules, traceability back to source event.
3. **Minimum PASS**: Closure criteria are defined, CAPA records must contain investigation/actions/results, retention is referenced.
4. **Genuine uncertainty**: Closure criteria exist but are incomplete, or record content requirements aren't specified.
5. **Clear FAIL**: No closure criteria — CAPAs close at owner's discretion, or no record-keeping requirements.

**Key design choice**: We treat "traceability to source nonconformity" as an OFI rather than core evidence. While important, many SOPs handle this implicitly through their CAPA numbering/tracking system rather than explicitly stating it in the procedure text.

**Best practices incorporated**:
- "Defined CAPA closure criteria" → becomes core evidence (closure checklist)
- "Independent Quality closure approval" → included as strong PASS example

---

### CAPA-10: Communication & Dissemination

**Five Questions:**

1. **Intent**: CAPA findings must be shared with people who can act on them. ISO 13485 5.5.3 requires appropriate communication processes within the organization, including communication regarding QMS effectiveness. For EU, vigilance reporting links CAPA to regulatory notification.
2. **Artifacts**: Communication procedures, recipient lists, vigilance/FSCA cross-references.
3. **Minimum PASS**: Dissemination requirement exists, communication channels are defined. For EU market: vigilance linkage.
4. **Genuine uncertainty**: Communication is mentioned but recipients/channels aren't defined. Or vigilance linkage is vague.
5. **Clear FAIL**: No communication process — CAPA outcomes stay siloed.

**Key design choice**: Vigilance reporting (EU MDR Art. 83) is included as core evidence "for companies selling in the EU" rather than a universal requirement. The prompt guides the AI to assess this contextually based on what the document reveals about the organization's market scope.

---

### CAPA-11: Management Review & Trending

**Five Questions:**

1. **Intent**: Management must have visibility into the CAPA system's health and the quality issues it's addressing. This ensures executive accountability and resource allocation.
2. **Artifacts**: Management review inputs, CAPA metrics dashboards, escalation procedures, trending reports.
3. **Minimum PASS**: CAPA information goes to management review, some metrics or trending are referenced.
4. **Genuine uncertainty**: Management review input is required but specific metrics aren't defined. Or escalation isn't addressed.
5. **Clear FAIL**: No management review connection at all.

**Key design choice**: We set a low bar for PASS here — just requiring that CAPA information is submitted to management review. The specific metrics (aging, recurrence, effectiveness rates) are OFIs. This is because ISO 13485 5.6.2 only requires that the information is submitted, not that specific KPIs are tracked.

**Best practices incorporated**:
- "Escalation for overdue CAPAs" → included as strong PASS example and OFI
- "CAPA health metrics" → included as OFI
- "Root cause trending" → included as OFI

---

### CAPA-12: Combination Product Considerations

**Five Questions:**

1. **Intent**: Combination products (drug-device, biologic-device) face a unique CAPA challenge: which regulatory framework applies? 21 CFR 4.4 requires a documented election and gap analysis.
2. **Artifacts**: CAPA approach election documentation, gap analysis, cross-reference matrices, decision trees.
3. **Minimum PASS**: Combination product CAPA approach is defined, OR the organization documents that it doesn't make combination products (→ NOT_APPLICABLE).
4. **Genuine uncertainty**: Combination products are mentioned but the approach election isn't clear, or the gap analysis is referenced but not provided.
5. **Clear FAIL**: Organization makes combination products but the CAPA SOP is silent on how they're handled.

**Key design choice**: This is the only requirement with an explicit NOT_APPLICABLE instruction in the prompt. Most organizations don't make combination products, so this step should return NOT_APPLICABLE cleanly rather than generating a false FAIL. The prompt explicitly states: "If the organization does not manufacture combination products, this requirement is NOT_APPLICABLE."

---

### CAPA-13: Preventive Action - Proactive Elements

**Five Questions:**

1. **Intent**: Preventive action is the proactive counterpart to corrective action. It addresses potential nonconformities before they occur. ISO 13485 treats them as separate processes (8.5.2 vs. 8.5.3), and many SOPs underserve the preventive side.
2. **Artifacts**: Preventive action procedures, data source definitions, proactive analysis methods, PMS/PMCF linkage.
3. **Minimum PASS**: Preventive action is defined as distinct from corrective action, data sources for potential issues are identified, risk-based evaluation is described.
4. **Genuine uncertainty**: Preventive action exists but data sources are vague, or the distinction from corrective action is unclear.
5. **Clear FAIL**: No preventive action process — only corrective action is covered.

**Key design choice**: The distinction between preventive and corrective action is core evidence, not an OFI. Many SOPs treat "CAPA" as a single process without differentiating. While this may work operationally, the standards explicitly separate them, and auditors consistently check for this distinction.

**Best practices incorporated**:
- "Preventive actions driven by trend data" → strengthened as core evidence (data sources must include trend data, not just reactive events)
- PMS/PMCF integration as a preventive action input is included as an OFI for EU MDR alignment
