-- Migration: Seed Design Control SOP Assessment (Condensed) framework
-- Adds a NEW framework alongside the existing 68-requirement 'design-control' framework.
-- Slug: design-control-condensed | UUID: 00000000-0000-0000-0000-000000000004
-- Source: docs/docs_for_eval/Design Control SOP Assessment Tool II (1).xlsx
--         (extracted into docs/design-control-simplified-requirements.json)
-- Requirement UUIDs use the 30000000-* namespace to avoid collision with the
-- 20000000-* namespace used by the 68-req framework (UUID ...0003).
-- Idempotent-safe: WHERE NOT EXISTS for framework, ON CONFLICT for requirements.

BEGIN;

-- ============================================================================
-- STEP 1: Insert the condensed Design Control framework (if not exists)
-- ============================================================================

INSERT INTO frameworks (id, name, slug, description, standard_reference, system_prompt, is_active, display_order)
SELECT
    '00000000-0000-0000-0000-000000000004'::uuid,
    'Design Control SOP Assessment (Condensed)',
    'design-control-condensed',
    'Evaluate Design Control SOPs against the simplified clause-level ISO 13485:2016 Section 7.3 design and development control requirements (10 clauses), with related 21 CFR 820.30, combination product, risk management, and usability considerations where applicable.',
    'ISO 13485:2016 Section 7.3',
    $master_prompt$You are an expert medical device design and development assessor with deep knowledge of ISO 13485:2016 Section 7.3, 21 CFR 820.30 (QMSR alignment), 21 CFR 4 (Combination Products), ISO 14971:2019, and IEC 62366-1:2015+A1:2020. Review ONE DOCUMENT AT A TIME and judge whether it addresses specific requirements from ISO 13485:2016 Section 7.3 and related standards.

Context and assumptions:
- Treat the document as a Design and Development Procedure or Design Control SOP. It may reference other controlled documents (Design Plans, Design and Development Files, Risk Management Files, Usability Engineering Files); clear cross-references are acceptable evidence that such systems/records exist.
- ISO 13485:2016 Section 7.3 is the PRIMARY framework. 21 CFR 820.30 requirements are mapped as US-specific considerations where they add or differ from ISO 13485.
- Focus on whether the document (a) defines the required process/structure and (b) shows it is practicable/implemented. Do not assess actual design outputs or project-specific records—only the procedural framework.
- For combination products: assess whether the SOP addresses 21 CFR 4 CGMP applicability, drug-device interface considerations, and coordination with drug development.

How to review each clause invocation:
1) Understand what type of document this is and how it fits the Quality Management System.
2) Focus ONLY on the requested clause; search the entire document for relevant evidence.
3) Presence vs adequacy: assess basic alignment with the clause.
4) Cross-references: if the document points to another controlled document (e.g., Risk Management Procedure, Usability Engineering Procedure), consider that evidence.

Decision logic:
- PASS: Requirement is clearly addressed; process/structure is described with sufficient detail for implementation.
- FLAGGED: Evidence exists but is incomplete/ambiguous or needs human confirmation.
- FAIL: Core expectations are missing/contradicted.
- NOT_APPLICABLE: Clause truly does not apply to the document provided.

Regulatory alignment notes:
- ISO 13485:2016 Section 7.3 is harmonized with FDA QMSR (effective Feb 2026)
- 21 CFR 820.30 legacy requirements noted where they provide additional specificity
- EU MDR requires ISO 13485 compliance; technical documentation per Annex II
- For combination products, 21 CFR 4 determines which CGMP requirements apply$master_prompt$,
    true,
    4
WHERE NOT EXISTS (
    SELECT 1 FROM frameworks WHERE slug = 'design-control-condensed'
);

-- ============================================================================
-- STEP 2: Insert the 10 simplified design control clauses
-- ============================================================================

INSERT INTO iso_requirements (id, clause, title, requirement_text, display_order, evaluation_type, framework_id)
VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid,
   'ISO7.3.1',
   'General Requirements',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.1 -- "General Requirements".

Objective:
Determine whether the organization has established and maintains documented procedures for design and development that address all requirements of ISO 13485:2016 Section 7.3.

Objective details:
- Documented procedures for design and development exist
- Procedures address planning, inputs, outputs, review, verification, validation, transfer, changes, and files
- Procedures appropriate to device classification and risk level
- Procedures maintained under document control
- Scope and applicability clearly defined

Core evidence to look for (minimum subset for PASS):
- Design and development procedure(s) documented, approved and revision controlled
- Scope defines applicable products, projects, and exclusions (e.g., accessory-only, software-only)
- All 7.3 subclauses addressed (directly or by reference to other procedures)
- Procedure identifies regulatory basis (ISO 13485:2016, EU MDR as applicable)

Examples of strong PASS evidence:
- Comprehensive procedure with clear structure covering all 7.3 elements
- Process flowchart providing visual overview
- Defined product types, project types, and exclusions outlined
- Cross-references to related procedures (Risk Management, Human Factors)
-Applicable regulatory standards referenced

When to FLAG:
- Procedures exist but incomplete coverage of 7.3 subclauses
- Some elements in separate documents without clear linkage
- Scope unclear or overly broad/narrow
- Document control status uncertain

When to FAIL:
- No documented design and development procedures
- Major gaps in 7.3 coverage (e.g., no validation, no design review)
- Procedures not controlled documents
- Procedures clearly inappropriate for device risk

Typical OFIs (can still PASS):
- Linkage to other QMS processes (CAPA, Supplier, Management)
- Examples or worked scenarios
- Electronic workflow integration$req$,
   1, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000002'::uuid,
   'ISO7.3.2',
   'Design and Development Planning',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.2 -- "Design and Development Planning".

Objective:
Determine whether the organization plans and controls design and development including stages, activities, responsibilities, interfaces, traceability, resources, and plan updates.

Objective details:
- Design and development planning required
- Planning includes design control activities
- Planning appropriate to nature of device
- Planning documented and maintained

Core evidence to look for (minimum subset for PASS):
- Design plan required for each design project with defined content requirements
- Roles, responsibilities, and authorities defined (who approves what)
- Planning scaled to device complexity/risk
- Plan content requirements specified (stages, V&V activities, interfaces, traceability methods, resources)
- Plan update requirements defined (triggers, approval, version control)
- Interface management between functions/groups required

Examples of strong PASS evidence:
- Design plan template with comprehensive content requirements
- Named stages (Concept, Development, Verification, Validation, Transfer) with phase gates
- Phase gate checklists with entry/exit criteria
- V&V activity matrix mapped to design stages
- RACI matrix template with defined roles and approval authorities
- Interface matrix including drug development for combination products
- Traceability matrix requirements with tool specification
- Competence requirements linked to training procedures
- Risk management plan (ISO 14971) and usability engineering plan (IEC 62366-1) integration explicitly defined
- Plan update triggers explicitly listed (scope change, schedule slip, major finding)

When to FLAG:
- Planning required but content/format not specified
- Stages mentioned without clear definitions or entry/exit criteria
- V&V activities mentioned but not mapped to specific stages
- Responsibilities assigned but approval authorities not defined
- Interfaces mentioned without management process
- Traceability required but method/tool not specified
- Resources assumed without planning process
- Plan updates required but triggers and approval not defined
- Risk management and usability engineering referenced but integration unclear
- Drug development interface not addressed for combination products

When to FAIL:
- No design planning requirements
- Design plan not required for each project
- No defined design stages or phase gates
- V&V treated as end-of-project only, not planned per stage
- No responsibility or authority assignment requirements
- No interface management
- No traceability requirements
- No resource planning
- Plans static with no update mechanism
- No linkage to risk management planning

Typical OFIs (can still PASS):
- Agile/iterative planning options
- Risk-based planning intensity by device class
- Planning templates for common device types
- Plan metrics and KPIs
- Automated plan update reminders at phase gates
- Lessons learned integration from previous projects
- Resource loading/leveling across concurrent projects
- Supplier/contract manufacturer interface in planning
- Combination product planning checklist (21 CFR 4, CMC coordination)
- QMSR/820.30 alignment for US market$req$,
   2, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000003'::uuid,
   'ISO7.3.3',
   'Design and Development Inputs',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.3 -- "Design and Development Inputs".

Objective:
Determine whether design inputs are determined, documented, reviewed, and approved, including functional/performance/safety requirements, regulatory requirements, risk outputs, previous design information, and other essential requirements.

Objective details:
- Design input determination process established
- Functional and performance requirements included
- Safety requirements derived from risk management
- Applicable regulatory requirements identified
- Risk management outputs incorporated as inputs
- Information from previous similar designs considered
- Other essential requirements (manufacturing, packaging, service) addressed
- Inputs reviewed for adequacy and approved
- Incomplete/ambiguous/conflicting requirements resolved
- [Combo] Drug product interface requirements as device inputs
- [UE] User interface and use-related requirements included

Core evidence to look for (minimum subset for PASS):
- Input determination process defined with multiple sources
- Functional, performance, and safety requirements explicitly required
- Regulatory requirements and standards applicability assessed
- Risk-derived requirements required as inputs
- Input review for adequacy, completeness, and conflict resolution required; approval before use
- Inputs documented and records maintained

Examples of strong PASS evidence:
- Input sources checklist (user needs, regulatory, standards, risk, predicate)
- Requirement categorization (functional, performance, safety, regulatory)
- Regulatory input checklist by market (US, EU, etc.)
- Preliminary hazard analysis feeds design inputs
- Predicate comparison template
- Input review checklist with adequacy criteria
- Conflict resolution process with documented rationale and authority
- Input traceability matrix initiated at input stage
- Input freeze/baseline milestone with change control after baseline
- Cross-functional input review requirement (R&D, QA, RA, Clinical)
- Drug-device interface specification for combination products
- Task analysis and use scenario documentation for usability

When to FLAG:
- Inputs required but sources not comprehensive
- Requirement categories (functional, performance, safety) not distinguished
- Regulatory requirements informal or not specific to market
- Standards applicability mentioned without matrix or checklist
- Risk-derived requirements mentioned but timing of hazard analysis unclear
- Previous design/predicate analysis mentioned but not required
- User needs captured but not formally documented as inputs
- Review process without adequacy criteria
- Conflict resolution mentioned but authority not defined
- Input completeness criteria vague or not defined
- Drug product requirements for combination products not formalized

When to FAIL:
- No input determination process
- Inputs not documented or records not maintained
- Functional/performance/safety requirements not distinguished
- Regulatory requirements assumed, not documented
- Standards not identified as input sources
- No risk-derived requirements
- Previous designs not considered
- No mechanism for incomplete/ambiguous/conflicting requirements
- No user needs or intended use in design inputs
- No input review or approval

Typical OFIs (can still PASS):
- Lessons learned database from previous projects
- Stakeholder needs analysis for input sources
- Voice of customer (VOC) methodology
- Competitive device analysis
- MAUDE/vigilance database review for similar devices
- Medical/clinical advisory input process
- Patient/caregiver input for home-use devices
- Post-market feedback integration
- Emerging regulation monitoring process
- Formal input baseline review milestone
- Drug CMC coordination for combination products
- Use error analysis from predicates
- Input metrics (completeness, change rate)$req$,
   3, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000004'::uuid,
   'ISO7.3.4',
   'Design and Development Outputs',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.4 -- "Design and Development Outputs".

Objective:
Determine whether organization has established and maintained procedures which govern mandate the creation and control of design output records in verifiable form, approved before release, and include acceptance criteria, essential characteristics.

Objective details:
- Documented procedures for Design and Development Outputs exist
- Procedure addresses the need for design outputs to meet the input requirements
- Procedure establishes that Design Outputs shall be approved prior to release and that records shall be maintained
- Procedure establishes that the outputs shall be in a form suitable for verification against inputs
- Procedure establishes that Design Outputs shall contain appropriate information for purchasing, production and service provision
- Procedure notes that Design Outputs shall contain or make reference to acceptance criteria
- Procedure requires that Design Outputs specify the characteristics of the product that are essential for its safe and proper use.
- Procedures maintained under document control
- Scope and applicability clearly defined


Core evidence to look for (minimum subset for PASS):
- Outputs in form suitable for verification against inputs
- Outputs approved prior to release
- Acceptance criteria included or referenced in outputs
- Essential characteristics for safe and proper use specified
- Purchasing, production, and service information as outputs
- Traceability to inputs required

Examples of strong PASS evidence:
- Comprehensive procedure with clear structure covering all 7.3.4 elements
- Process flowchart providing visual overview
- Defined terms and role definitions
- Training requirements identified
- Output categorization (essential vs. non-essential characteristics)
- Acceptance criteria format requirements (quantitative, statistical basis)
- DMR/MDF content checklist showing required output documents
- Risk control measures explicitly identified as design outputs
- User interface specification and labeling/IFU as controlled outputs
- Guidance on outputs referenced vs. fully included (vendor, partner, CMO)
- Scope defined between device and drug product outputs for combination products
- Process for managing changes to design outputs (linkage to 7.3.9)

When to FLAG:
- Procedures exist but incomplete coverage of 7.3.4 subclauses
- Some elements in separate documents without clear linkage
- Scope unclear or overly broad/narrow
- Document control status uncertain
- Outputs required but verifiable/measurable form not specified
- Acceptance criteria mentioned but timing (before verification) not enforced
- Essential characteristics mentioned without identification criteria
- Approval required but workflow/authority not defined
- Manufacturing/purchasing/service information implied but not listed
- Risk controls not explicitly identified as design outputs
- Labeling/IFU not addressed as controlled design outputs
- Device outputs rely on drug CMC processes without device-specific requirements
- Design outputs held by CMOs/vendors/partners not addressed

When to FAIL:
- No documented design and development output procedure
- Outputs not in form suitable for verification against inputs
- No approval requirement before output release
- No acceptance criteria included or referenced in outputs
- Essential characteristics for safe and proper use not identified
- No purchasing, production, or service information as outputs
- No traceability to design inputs
- Risk control measures not documented as outputs
- Major gaps in 7.3.4 coverage
- Procedures not controlled documents
- Procedures clearly inappropriate for device risk

Typical OFIs (can still PASS):
- Clear identification of output types (drawings, specifications, software requirements, manufacturing instructions, labeling, packaging specs, risk control specifications)
- Process for translating risk control measures (ISO 14971) into measurable, testable, traceable outputs
- Defined process for converting design outputs into supplier specifications and quality agreements
- Clear guidance on revision control, baseline creation, and change impact assessment
- Linkage to formal DFM/DFA review to confirm manufacturability before release
- Critical-to-quality (CTQ) characteristic identification methodology
- Output metrics (completeness, defect rate, change frequency)
- Electronic output management system with approval workflows
- Output review checklist for regulatory submission readiness
- Supplier specification template derived from design outputs
- Software documentation outputs per IEC 62304 (if applicable)$req$,
   4, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000005'::uuid,
   'ISO7.3.5',
   'Design and Development Review',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.5 -- "Design and Development Review".

Objective:
Determine whether organization has established procedures to ensure systematic design reviews are conducted at suitable stages with appropriate participants to evaluate design results, identify problems, and document actions.

Objective details:
- Documented procedures for Design and Development Reviews exist
- Procedures maintained under document control
- Scope and applicability clearly defined
- Procedure establish suitable stages for review
- Procedure establishes the need to both evaluate the ability of the results of the design and development effort to meet requirements as well as identify and propose necessary actions. 
- Procedure shall define minimum attendance/representation by function
- Procedure shall establish that records of the review along with any actions shall be maintained along with details on the design under review, participants involved and the date of the review. 


Core evidence to look for (minimum subset for PASS):
- Systematic reviews at defined design stages
- Evaluation of design results against requirements
- Cross-functional participation required
- Problem identification and action proposal process
- Records of results, attendees, and actions maintained

Examples of strong PASS evidence:
- Review types defined (technical, management, phase gate)
- Stage-specific review criteria and checklists
- Attendee matrix by review type with quorum requirements
- Independence criteria defined (who qualifies as independent reviewer)
- Pre-review package requirements (materials distributed in advance)
- Problem categorization (critical, major, minor) with escalation criteria
- Review minutes template with action tracking
- Action item closure criteria and timeline requirements
- Risk management status as mandatory review agenda item
- Design decision documentation requirements
- Drug development team participation for combination products
- Training requirements identified

When to FLAG:
- Reviews required but stages unclear
- Reviews required but evaluation criteria not defined
- Participation required but functions not specified
- Quorum requirements mentioned but not specified
- Independent reviewer expectations unclear
- Problems addressed informally without categorization
- Action items captured but closure process not defined
- Record requirements vague (what must be documented)
- Risk status review mentioned but not mandatory
- Procedures exist but incomplete coverage of 7.3.5 subclauses
- Some elements in separate documents without clear linkage
- Scope unclear or overly broad/narrow
- Document control status uncertain
- Drug development interface review not addressed for combination products

When to FAIL:
- No documented design and development review procedure
- No systematic reviews at defined design stages
- No evaluation of design results against requirements
- No cross-functional participation requirement
- No independent reviewer requirement (820.30)
- No problem identification or action proposal process
- No review records required
- Major gaps in 7.3.5 coverage (no action tracking, no participation requirements)
- Reviews treated as optional or informal
- Procedures not controlled documents
- Procedures clearly inappropriate for device risk

Typical OFIs (can still PASS):
- Independent reviewer pool/registry maintained
- Clear articulation of what each phase review must confirm (feasibility, risk control adequacy, verification readiness, transfer readiness)
- Predefined entry/exit criteria for each review type
- Explicit requirement to review risk file status, design plan, and DHF/DDF index
- Minimum lead time for pre-read distribution (e.g., 3 business days)
- Electronic action item tracking with automated reminders
- CAPA linkage process for systemic issues
- Design decision log capturing rationale for key technical choices
- Review effectiveness metrics (action closure rate, review duration, rework rate)
- Escalation path for unresolved critical issues
- Lessons learned capture at project close-out review
- Remote/virtual review guidance
- FDA/Notified Body audit readiness checklist for review records$req$,
   5, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000006'::uuid,
   'ISO7.3.6',
   'Design and Development Verification',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.6 -- "Design and Development Verification".

Objective:
Determine whether design verification is performed per planned arrangements to ensure outputs meet inputs, with appropriate records, risk control verification, and formative usability evaluation.

Objective details:
- Verification per planned arrangements
- Output conformance to inputs demonstrated
- Verification methods appropriate
- Records of results and actions maintained
- [Combo] Verification with drug product or surrogate

Core evidence to look for (minimum subset for PASS):
- Verification per planning requirements
- Output-input conformance required with traceability
- Method selection (test, analysis, inspection, demonstration) defined
- Protocol and report requirements including acceptance criteria
- Drug product or surrogate use in verification for combination products
- Linkage to risk management for test sample selection and rationale
- Sample selection criteria defined (production equivalent, worst-case, drug product vs surrogate rationale)
- Records of verification results and actions maintained

Examples of strong PASS evidence:
- Verification matrix showing methods per output
- Pass/fail criteria defined before test execution
- Protocol template with statistical rationale requirements
- Verification method validation requirements (test method qualification)
- 100% input coverage requirement with gap analysis
- Traceability from verification results back to design inputs
- Verification report template with deviation handling
- Environmental/stress condition requirements (worst-case testing)
- Surrogate/bridging rationale for drug product testing
- Re-verification criteria after design changes

When to FLAG:
- Verification required but planning link unclear
- Conformance mentioned without method specification
- Acceptance criteria mentioned but timing (before vs. after testing) unclear
- Sample size mentioned but statistical rationale not required
- Protocol format undefined
- Test method validation mentioned but not required
- Input coverage requirement unclear or not enforced
- Deviation handling mentioned but process not defined
- Record requirements mentioned but content not specified
- Worst-case/boundary testing mentioned but conditions not specified
- Drug product/surrogate use mentioned but selection criteria not defined
- Verification approval authority not defined

When to FAIL:
- No verification procedure documented
- No verification per planned arrangements
- No requirement for output conformance to inputs
- No traceability between verification and design inputs
- Methods ad hoc with no selection criteria
- No acceptance criteria requirements
- No protocol/report requirements
- No verification records required
- Device verified without drug product or appropriate surrogate
- Verification treated as optional or informal

Typical OFIs (can still PASS):
- Verification vs validation distinction guidance
- Sample size determination methodology (statistical basis)
- Worst-case condition selection guidance
- Accelerated testing guidance (aging, stress)
- Negative/boundary testing requirements
- Design of experiments (DOE) guidance for complex verifications
- Risk-based verification intensity (critical vs. non-critical)
- Test method validation/qualification procedure
- Verification lab qualification requirements
- Verification metrics (first-pass yield, deviation rate, cycle time)
- Supplier verification requirements and oversight
- Software verification per IEC 62304 (if applicable)
- Biocompatibility verification per ISO 10993
- Combination product bridging study guidance$req$,
   6, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000007'::uuid,
   'ISO7.3.7',
   'Design and Development Validation',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.7 -- "Design and Development Validation".

Objective:
Determine whether design validation is performed per planned arrangements to demonstrate conformance to user needs and intended uses, completed prior to release, with summative usability validation and overall residual risk evaluation.

Objective details:
- Validation per planned arrangements
- Conformance to user needs and intended uses demonstrated
- Actual or simulated use conditions
- Production units or equivalents used
- Completed prior to product release
- Records of results and actions maintained
- Summative usability validation performed
- [Combo] Validation with commercial-equivalent drug product or surrogate

Core evidence to look for (minimum subset for PASS):
- Validation per planning requirements
- User needs traceability demonstrated
- Use conditions defined (actual or simulated with justification)
- Production equivalence criteria specified
- Validation completed prior to product release
- Records of validation results and actions maintained
- Summative usability validation requirements defined (IEC 62366-1)
- Commercial-equivalent drug product requirements for combination products

Examples of strong PASS evidence:
- Validation matrix showing user needs coverage
- Intended use acceptance criteria
- Use environment specification (actual or simulated with justification)
- Simulated use justification documentation requirements
- Production equivalence checklist
- Validation as release gate criterion
- Validation report template with statistical analysis
- User population stratification requirements (patient vs. HCP, naive vs. trained)
- Critical task identification methodology with pass/fail criteria
- Summative protocol with 15+ users per group, critical task criteria
- Use-related risk analysis informing validation protocol
- Labeling/IFU validation as part of summative study
- Device-drug compatibility validation for combination products
- Clinical protocol integration for combination products
- Post-validation change impact assessment process

When to FLAG:
- Validation required but planning link vague
- User needs link informal
- Use conditions unclear (actual vs. simulated)
- Simulated use allowed but justification requirements unclear
- Production equivalence not defined
- Validation before release required but not enforced as gate
- Record requirements mentioned but content not specified
- User population requirements vague (number, stratification)
- Critical task identification mentioned but methodology not defined
- Summative study required but acceptance criteria undefined
- Labeling/IFU validation not explicitly addressed
- Drug product use required but commercial equivalence criteria not defined
- Clinical validation for combination products mentioned but not integrated

When to FAIL:
- No validation procedure documented
- No validation per planned arrangements
- User needs not validated
- No intended use or user needs traceability
- Inappropriate use conditions
- Prototype acceptable for validation (no production equivalence)
- Validation after release acceptable
- No acceptance criteria for validation
- No validation records required
- No summative usability study requirements
- Device-only validation for combination product
- Validation treated as optional or informal

Typical OFIs (can still PASS):
- Clinical study integration
- Real-world evidence planning
- Patient vs HCP validation distinction
- Home vs clinical use validation
- Pediatric/geriatric user population considerations
- Accessibility validation (users with disabilities)
- Caregiver validation for patient-administered products
- Training effectiveness validation
- Multi-site validation study guidance
- Validation metrics (task success rate, use error rate, time-on-task)
- Validation data supporting regulatory submission (510(k), BLA)
- Competitive device benchmarking in validation
- Post-market validation updates
- Post-market surveillance linkage to validation
- Long-term use validation
- Drug stability data integration for combination products$req$,
   7, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000008'::uuid,
   'ISO7.3.8',
   'Design and Development Transfer',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.8 -- "Design and Development Transfer".

Objective:
Determine whether procedures ensure design outputs are correctly translated to production specifications with verified manufacturing suitability and capability.

Objective details:
- Transfer procedures documented
- Design outputs translated to production specifications
- Manufacturing suitability verified
- Production capability meets product requirements
- Process validation linkage
- Labeling and training materials finalized and released

Core evidence to look for (minimum subset for PASS):
- Transfer procedure requirements defined
- Design outputs translated to production specifications
- Design outputs verified as suitable for manufacturing
- Production capability to meet product requirements demonstrated
- Process validation linkage
- Labeling/training release at transfer
- Transfer deliverables defined (specifications, drawings, labeling, training, work instructions)

Examples of strong PASS evidence:
- Transfer checklist with acceptance criteria
- Transfer milestone/gate defined in design plan
- DMR/MDF completeness verification
- Capability study requirements (Cpk/Ppk criteria)
- Production lot verification requirements (pilot to production)
- Equipment qualification and operator training
- Work instruction approval and release process
- Inspection method and equipment transfer
- Process validation protocol linkage
- Packaging validation linkage
- First article inspection requirements
- Labeling approval process with multi-language requirements
- Supplier/CMO transfer requirements and oversight
- Drug product manufacturing coordination for combination products
- Transfer records and sign-off requirements

When to FLAG:
- Transfer mentioned without procedure details
- Translation process vague
- Transfer checklist mentioned but content not specified
- DMR/MDF completeness criteria not defined
- Manufacturing suitability verification informal or not documented
- Capability criteria undefined (no Cpk/Ppk requirements)
- First article inspection mentioned but requirements not specified
- Operator training mentioned but qualification criteria not defined
- Equipment qualification mentioned but not required
- Work instruction release not addressed
- Process validation mentioned but linkage to transfer unclear
- Packaging validation not addressed
- Labeling/IFU release timing relative to transfer unclear
- Supplier/CMO transfer not addressed
- Drug manufacturing coordination not addressed for combination products
- Transfer records/sign-off not required

When to FAIL:
- No transfer procedures documented
- No requirement to translate design outputs to production specifications
- Design outputs released directly to production without manufacturing review
- No suitability verification
- Capability not demonstrated
- No DMR/MDF completeness requirement
- No operator training or qualification requirements
- No equipment qualification requirements
- No first article inspection or production verification
- No process validation link
- Labeling/training uncontrolled
- No transfer records required
- Transfer treated as optional or informal

Typical OFIs (can still PASS):
- Supplier transfer requirements
- Supplier quality agreement updates at transfer
- Training documentation transfer
- Technology transfer documentation package template
- Scale-up considerations (pilot to commercial)
- Multi-site transfer guidance
- Risk-based transfer intensity (complexity, novelty)
- Design-for-manufacturing (DFM) review before transfer
- Continuous verification requirements (post-transfer monitoring)
- Transfer metrics (time to transfer, first-run yield, deviation rate)
- Lessons learned from transfer issues
- Post-transfer CAPA trending
- Label printing qualification
- Sterilization validation linkage (if applicable)
- Shelf-life/stability study initiation at transfer
- Drug product supply chain coordination for combination products$req$,
   8, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000009'::uuid,
   'ISO7.3.9',
   'Design and Development Changes',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.9 -- "Design and Development Changes".

Objective:
Determine whether design changes are identified, reviewed, verified/validated as appropriate, approved before implementation, and assessed for impact on constituent parts, delivered product, risk, and human factors.

Objective details:
- Changes identified and records maintained
- Changes reviewed, verified, validated as appropriate
- Changes approved before implementation
- Impact on constituent parts evaluated
- Impact on delivered product assessed
- Risk file update assessed
- HF impact assessed
- [Combo] Drug-device interface change impact assessed

Core evidence to look for (minimum subset for PASS):
- Changes identified, documented, and records maintained
- Changes reviewed, verified, and validated as appropriate
- Changes approved before implementation
- Impact on constituent parts evaluated
- Impact on delivered product evaluated (field action determination)
- Risk management file update assessed for changes
- Human factors impact assessed; revalidation triggers defined
- Drug product impact for combination products
- Records of change review results and actions maintained

Examples of strong PASS evidence:
- Change request form/template
- Change classification criteria (minor, major, critical)
- Change review board/committee with defined membership
- V&V matrix for change types (when re-verification/revalidation required)
- Approval authority matrix by change classification
- Impact assessment template including regulatory filing impact
- Traceability update requirements (inputs, outputs, V&V)
- Batch/lot impact assessment and disposition guidance
- Field action/recall determination criteria
- Supplier change notification process
- Risk change impact matrix with new hazard identification
- HF revalidation decision tree
- Drug-device change matrix with supplement determination
- Change implementation verification requirements
- Change closure criteria and sign-off
- Expedited change process for safety-critical issues

When to FLAG:
- Changes addressed but process incomplete
- Change classification mentioned but criteria not defined
- V&V determination unclear (when re-V&V required)
- Approval required but authority/workflow not defined
- Impact assessment vague
- Constituent part impact mentioned but not formalized
- Impact on delivered product/field action not addressed
- Regulatory filing impact not addressed
- Batch/lot impact not addressed
- Supplier change notification not addressed
- Risk assessment mentioned without process
- HF impact mentioned but revalidation triggers not defined
- Drug-device interface impact mentioned but criteria not defined
- Traceability update requirements not defined
- Change records required but content not specified
- Change implementation verification not required

When to FAIL:
- No change control procedure documented
- No change control requirements
- Changes not identified or documented
- Changes implemented without approval
- No V&V determination for changes
- No impact assessment
- No constituent part impact evaluation
- No assessment of impact on delivered product
- No requirement to update risk file for changes
- No HF impact assessment for changes
- Drug-device impact not assessed for combination products
- No change records maintained
- No distinction between change types (all treated same)
- Changes treated as informal or optional

Typical OFIs (can still PASS):
- Expedited change process for safety-critical issues
- Risk-based change classification
- Change metrics and trending (volume, cycle time, rework rate)
- Change effectiveness review (did change achieve intended result)
- CAPA linkage for change-related issues
- Change freeze periods (during critical V&V, regulatory submission)
- Electronic change management system with audit trail
- Batch/lot traceability and retrospective impact analysis
- Supplier change notification agreement in quality agreements
- Change communication process (internal and external)
- Customer/user notification for significant changes
- Design change vs. manufacturing change distinction
- Comparability protocol for significant changes
- Lessons learned from change implementation
- Post-market surveillance linkage
- FDA/EMA coordination for combination products$req$,
   9, 'process', '00000000-0000-0000-0000-000000000004'::uuid),
  ('30000000-0000-0000-0000-000000000010'::uuid,
   'ISO7.3.10',
   'Design and Development Files',
   $req$You are evaluating ISO 13485:2016 clause ISO7.3.10 -- "Design and Development Files".

Objective:
Determine whether the procedure defines the requirement for maintenance of a design and development file for each device type/family containing conformity records and change records for the product under development.

Objective details:
- Documented procedures for the creation and maintenance of the Design and Development File (aka Design History File) exist
- Procedures establish the need to both create and maintain for each medical device type, combination product type or product family
- Procedure establishes that the file shall include or make reference to applicable records generated during development
- Procedure estalishes the need for the records associated with design and development changes

Core evidence to look for (minimum subset for PASS):
- Design and development file required for each device type or family
- File includes records demonstrating conformity to design requirements
- File includes records of design changes
- File structure/index and completeness criteria defined
- Risk management file integrated or referenced
- Usability engineering file integrated or referenced

Examples of strong PASS evidence:
- Comprehensive procedure with clear structure covering all 7.3.10 elements
- DHF index template with completeness checklist
- File structure mapped to ISO 13485 §7.3
- Device type/family criteria defined with examples
- Conformity evidence checklist with traceability
- Change log/history maintenance requirements
- Risk management file content per ISO 14971 §4.5
- Usability engineering file content per IEC 62366-1 §4.1.1
- Defined terms and role definitions
- Cross-references to related procedures (Risk Management, Human Factors)
- Procedure for referencing records held outside of company (suppliers, CMOs)
- Electronic file system requirements (access control, audit trail)
- File review/audit checklist
- Combination product file requirements (CMC cross-reference, CGMP rationale)
- File archival and retention requirements
- Training requirements identified

When to FLAG:
- Procedure exists but incomplete coverage of 7.3.10 subclauses
- Some elements in separate documents without clear linkage
- Scope unclear or overly broad/narrow
- Document control status uncertain
- File required but structure or templates unclear
- Type/family criteria vague
- DHF/DDF vs. DMR/MDF distinction unclear
- Conformity records required but content/evidence not specified
- Change records in file mentioned but not required
- File completeness criteria not defined
- Risk management file mentioned but content not specified
- Usability engineering file mentioned but content not specified
- No guidance on how to reference records external to company
- No expectations for when file is updated and reviewed
- File retention period not specified
- File ownership/responsibility not defined
- Electronic vs. paper file management not addressed
- Combination product file requirements not addressed

When to FAIL:
- No documented requirement for creation/maintenance of development file
- No file requirement per device type or family
- No file structure or index requirement
- No conformity records required in file
- No change records required in file
- No risk management file requirement
- No usability engineering file requirement
- No DHF/DDF requirement for US market
- Combination product documentation requirements missing
- Major gaps in 7.3.10 coverage
- Procedure confuses document control system with Development File
- Procedures clearly inappropriate for device risk
- Files treated as optional or informal

Typical OFIs (can still PASS):
- Templates provided (if not electronically established)
- Electronic DHF/DDF system with search and audit trail
- File migration guidance (paper to electronic, system changes)
- Master file cross-reference guidance (DMF, supplier files)
- Process for post-approval/launch maintenance of file
- File health metrics (completeness score, update frequency)
- Linkages to Change Management procedure and corporate policies
- Expectations for what doesn't belong in Development File (drug CMC documents, etc)
- Legacy device file guidance (pre-existing products)
- File audit readiness checklist (FDA, Notified Body)
- File access control and security requirements
- File backup and disaster recovery
- Regulatory submission file organization (eCTD, 510(k))
- QMSR transition guidance (820 modernization)
- Drug lot traceability in file for combination products$req$,
   10, 'process', '00000000-0000-0000-0000-000000000004'::uuid)
ON CONFLICT (id) DO UPDATE SET
    clause = EXCLUDED.clause,
    title = EXCLUDED.title,
    requirement_text = EXCLUDED.requirement_text,
    display_order = EXCLUDED.display_order,
    evaluation_type = EXCLUDED.evaluation_type,
    framework_id = EXCLUDED.framework_id,
    updated_at = NOW();

COMMIT;
