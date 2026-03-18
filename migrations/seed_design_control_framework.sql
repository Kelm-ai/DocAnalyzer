-- Migration: Seed Design Control SOP Assessment Framework
-- Creates the Design Control framework and 68 design control requirements.
-- Covers ISO 13485:2016 Section 7.3, 21 CFR 820.30, 21 CFR 4, ISO 14971, IEC 62366-1.
-- Idempotent-safe: uses WHERE NOT EXISTS for framework, ON CONFLICT for requirements.

BEGIN;

-- ============================================================================
-- STEP 1: Insert Design Control SOP Assessment framework (if not exists)
-- ============================================================================

INSERT INTO frameworks (id, name, slug, description, standard_reference, system_prompt, is_active, display_order)
SELECT
    '00000000-0000-0000-0000-000000000003'::uuid,
    'Design Control SOP Assessment',
    'design-control',
    'Evaluate Design Control SOPs and procedures against ISO 13485:2016 Section 7.3 and 21 CFR 820.30 requirements for design and development controls, including combination product (21 CFR 4), risk management (ISO 14971), and usability engineering (IEC 62366-1) integration.',
    'ISO 13485:2016, 21 CFR 820.30',
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
    3
WHERE NOT EXISTS (
    SELECT 1 FROM frameworks WHERE slug = 'design-control'
);

-- ============================================================================
-- STEP 2: Insert 68 design control requirements
-- ============================================================================

INSERT INTO iso_requirements (id, clause, title, requirement_text, display_order, evaluation_type, framework_id)
VALUES

-- DC-01: ISO7.3.1-01: General Requirements - Design and Development Procedures
('20000000-0000-0000-0000-000000000001'::uuid,
 'ISO7.3.1-01',
 'General Requirements - Design and Development Procedures',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.1-01 -- "General Requirements - Design and Development Procedures".

Objective:
Determine whether the organization has established documented procedures for design and development, including:
- Documented procedures for design and development established
- Procedures address all aspects of Section 7.3
- Procedures maintained and controlled

Core evidence to look for (minimal subset for PASS):
- Design and development procedure(s) exist and are documented
- Procedures cover planning through transfer
- Document control applied to procedures
- Scope addresses medical device design activities

Examples of strong PASS evidence:
- Comprehensive procedure covering all 7.3 subclauses
- Clear scope and applicability statements
- Defined terms and abbreviations
- Revision history and approval signatures

When to FLAG:
- Procedures exist but incomplete coverage of 7.3
- Some elements addressed in separate unlinked documents
- Scope unclear or overly broad
- Document control status uncertain

When to FAIL:
- No documented design and development procedures
- Procedures exist but not controlled documents
- Major gaps in 7.3 coverage
- Procedures not appropriate for device risk

Typical OFIs (can still PASS):
- Process flowchart for visual overview
- Linkage to other QMS procedures
- Training requirements for procedure users
- Procedure effectiveness metrics$req$,
 1, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-02: ISO7.3.2-01: Design Planning - Design and Development Planning Requirements
('20000000-0000-0000-0000-000000000002'::uuid,
 'ISO7.3.2-01',
 'Design Planning - Design and Development Planning Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-01 -- "Design Planning - Design and Development Planning Requirements".

Objective:
Determine whether the organization plans and controls design and development of the medical device, including:
- Design and development planning required
- Planning includes control of design activities
- Planning appropriate to nature of device
- Planning documented and maintained

Core evidence to look for (minimal subset for PASS):
- Design planning requirements established
- Roles and responsibilities for design control activities defined
- Planning scaled to device complexity/risk
- Plan documentation requirements specified

Examples of strong PASS evidence:
- Design plan template provided
- Scalable planning approach for different device classes
- Planning triggers and timing defined
- Plan as living document with update requirements

When to FLAG:
- Planning required but format/content unclear
- Roles and responsibilities vague
- Planning not appropriate for device complexity/risk
- Plan documentation location not specified

When to FAIL:
- No design planning requirements
- Planning informal or ad hoc
- No control over design activities
- Plans not documented

Typical OFIs (can still PASS):
- Agile/iterative planning options
- Planning templates for common device types
- Planning metrics and KPIs$req$,
 2, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-03: ISO7.3.2-02: Design Planning - Design and Development Stages
('20000000-0000-0000-0000-000000000003'::uuid,
 'ISO7.3.2-02',
 'Design Planning - Design and Development Stages',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-02 -- "Design Planning - Design and Development Stages".

Objective:
Determine whether design planning includes defined design and development stages, including:
- Design stages/phases defined
- Stage boundaries clear
- Stage-appropriate activities identified
- Progression criteria between stages

Core evidence to look for (minimal subset for PASS):
- Design stages explicitly defined in procedure
- Clear description of each stage purpose
- Activities mapped to stages
- Stage transition criteria (phase gates, design reviews)

Examples of strong PASS evidence:
- Named stages (e.g., Concept, Development, Verification, Validation, Transfer)
- Entry/exit criteria for each stage
- Deliverables defined per stage
- Decision authority for stage progression

When to FLAG:
- Stages mentioned without clear definition
- Activities not mapped to stages
- Transition criteria vague
- Stage flexibility/tailoring not addressed

When to FAIL:
- No design stages defined
- Linear process without checkpoints
- No stage-based control
- Activities not sequenced

Typical OFIs (can still PASS):
- Stage gate review checklists
- Concurrent engineering considerations
- Fast-track options for low-risk changes
- Stage duration guidelines$req$,
 3, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-04: ISO7.3.2-03: Design Planning - Review, Verification, and Validation Planning
('20000000-0000-0000-0000-000000000004'::uuid,
 'ISO7.3.2-03',
 'Design Planning - Review, Verification, and Validation Planning',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-03 -- "Design Planning - Review, Verification, and Validation Planning".

Objective:
Determine whether planning includes review, verification, and validation appropriate at each stage, including:
- Reviews planned at appropriate stages
- Verification activities planned per stage
- Validation activities planned per stage
- V&V distinct and appropriately timed

Core evidence to look for (minimal subset for PASS):
- Review timing linked to stages
- Verification activities mapped to design phases
- Validation timing defined (late stage, production units)
- Clear distinction between V&V

Examples of strong PASS evidence:
- V&V matrix by design stage
- Review types defined (technical, management, phase gate)
- Resource planning for V&V activities
- V&V deliverables per stage

When to FLAG:
- V&V mentioned but not mapped to stages
- Review timing unclear
- V&V distinction not clear
- Resource needs not addressed

When to FAIL:
- No V&V planning requirements
- V&V treated as end-of-project only
- No review planning
- V&V conflated

Typical OFIs (can still PASS):
- Risk-based V&V planning and traceability
- Sample size planning guidance
- V&V protocol templates
- Supplier V&V coordination$req$,
 4, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-05: ISO7.3.2-04: Design Planning - Responsibilities and Authorities
('20000000-0000-0000-0000-000000000005'::uuid,
 'ISO7.3.2-04',
 'Design Planning - Responsibilities and Authorities',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-04 -- "Design Planning - Responsibilities and Authorities".

Objective:
Determine whether planning includes responsibilities and authorities for design and development, including:
- Design responsibilities defined
- Authorities for decisions assigned
- Roles documented in plans
- Competency requirements addressed

Core evidence to look for (minimal subset for PASS):
- Responsibility assignment required in plans
- Decision authority defined
- Role documentation requirements
- Competency linkage to training

Examples of strong PASS evidence:
- RACI matrix or equivalent required
- Authority levels for design decisions
- Cross-functional role definitions
- Competency matrix for design roles

When to FLAG:
- Responsibilities mentioned without method
- Authority levels unclear
- Role definitions vague
- Competency not linked

When to FAIL:
- No responsibility requirements
- Authorities undefined
- Roles not documented
- Competency not addressed

Typical OFIs (can still PASS):
- Delegation of authority process
- External resource responsibilities
- Responsibility transfer at phase gates$req$,
 5, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-06: ISO7.3.2-05: Design Planning - Internal and External Interfaces
('20000000-0000-0000-0000-000000000006'::uuid,
 'ISO7.3.2-05',
 'Design Planning - Internal and External Interfaces',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-05 -- "Design Planning - Internal and External Interfaces".

Objective:
Determine whether planning addresses management of interfaces between different groups involved in design, including:
- Internal interfaces identified
- External interfaces identified
- Interface management defined
- Communication across interfaces ensured

Core evidence to look for (minimal subset for PASS):
- Interface identification required
- Internal groups (R&D, QA, RA, Mfg) addressed
- External parties (suppliers, consultants) addressed
- Communication mechanisms defined

Examples of strong PASS evidence:
- Interface matrix required in plans
- Meeting/coordination requirements
- Information exchange protocols
- Escalation paths for interface issues

When to FLAG:
- Interfaces mentioned without specifics
- Internal only or external only addressed
- Communication informal
- Escalation not defined

When to FAIL:
- No interface management
- Design treated as isolated activity
- No communication requirements
- Coordination not addressed

Typical OFIs (can still PASS):
- Drug development team interface for combination products
- Notified body/FDA interface
- Clinical site interface
- Contract manufacturer interface$req$,
 6, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-07: ISO7.3.2-06: Design Planning - Traceability Methods
('20000000-0000-0000-0000-000000000007'::uuid,
 'ISO7.3.2-06',
 'Design Planning - Traceability Methods',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-06 -- "Design Planning - Traceability Methods".

Objective:
Determine whether planning includes methods to ensure traceability of design outputs to inputs, including:
- Traceability methodology required
- Output-to-input linkage ensured
- Traceability tools/methods defined
- Traceability maintained throughout design

Core evidence to look for (minimal subset for PASS):
- Traceability requirement explicit
- Method for maintaining traceability defined
- Bidirectional traceability addressed
- Traceability review/verification

Examples of strong PASS evidence:
- Traceability matrix required
- Tool requirements (spreadsheet, software)
- Traceability verification at reviews
- Gap analysis requirements

When to FLAG:
- Traceability mentioned without method
- Tools not specified
- Verification not required
- Bidirectional not addressed

When to FAIL:
- No traceability requirements
- Inputs/outputs disconnected
- No method defined
- No verification

Typical OFIs (can still PASS):
- Electronic traceability tools
- Traceability to risk controls
- Traceability to test cases
- Traceability audit guidance$req$,
 7, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-08: ISO7.3.2-07: Design Planning - Resource Planning
('20000000-0000-0000-0000-000000000008'::uuid,
 'ISO7.3.2-07',
 'Design Planning - Resource Planning',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-07 -- "Design Planning - Resource Planning".

Objective:
Determine whether planning includes resources needed, including necessary competence of personnel, including:
- Resource planning required
- Personnel competence addressed
- Equipment/tools considered
- Resource availability assessed

Core evidence to look for (minimal subset for PASS):
- Resource requirements in plans
- Competence requirements defined
- Resource allocation process
- Competence verification

Examples of strong PASS evidence:
- Resource plan template
- Competence matrix reference
- Gap analysis and mitigation
- External resource qualification

When to FLAG:
- Resources mentioned without process
- Competence vague
- Allocation informal
- Gaps not addressed

When to FAIL:
- No resource planning
- Competence not addressed
- Resources assumed available
- No allocation process

Typical OFIs (can still PASS):
- Resource loading/leveling
- Training plan integration
- Contingency planning
- Budget linkage$req$,
 8, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-09: ISO7.3.2-08: Design Planning - Plan Updates
('20000000-0000-0000-0000-000000000009'::uuid,
 'ISO7.3.2-08',
 'Design Planning - Plan Updates',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-08 -- "Design Planning - Plan Updates".

Objective:
Determine whether the procedure requires design plans to be updated as design progresses, including:
- Plan update requirements defined
- Update triggers identified
- Approval for updates required
- Plan history maintained

Core evidence to look for (minimal subset for PASS):
- Plan updates required as design evolves
- Triggers for updates defined
- Update approval process
- Version control required

Examples of strong PASS evidence:
- Specific update triggers (scope change, schedule, findings)
- Update review and approval workflow
- Change documentation requirements
- Plan baseline management

When to FLAG:
- Updates mentioned without triggers
- Approval process unclear
- Version control vague
- Baseline not addressed

When to FAIL:
- No plan update requirements
- Plans treated as static
- No approval for changes
- No version control

Typical OFIs (can still PASS):
- Plan update metrics
- Automated update reminders
- Stakeholder notification
- Lessons learned integration$req$,
 9, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-10: ISO7.3.2-US01: Design Planning - US: Design History File Planning (820.30)
('20000000-0000-0000-0000-000000000010'::uuid,
 'ISO7.3.2-US01',
 'Design Planning - US: Design History File Planning (820.30)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-US01 -- "Design Planning - US: Design History File Planning (820.30)".

Objective:
Determine whether planning addresses Design History File requirements per 21 CFR 820.30, including:
- DHF requirements addressed in planning
- DHF structure/index planned
- DHF ownership assigned
- DHF completeness criteria defined

Core evidence to look for (minimal subset for PASS):
- DHF referenced in planning requirements
- DHF content planning addressed
- DHF responsibility assigned
- Relationship to design plan defined

Examples of strong PASS evidence:
- DHF index template
- DHF building throughout project
- DHF review at phase gates
- DHF completeness checklist

When to FLAG:
- DHF mentioned but planning unclear
- Content not specified
- Timing of DHF activities vague
- Ownership unclear

When to FAIL:
- No DHF planning
- DHF treated as afterthought
- No ownership
- No content requirements

Typical OFIs (can still PASS):
- Electronic DHF system
- DHF audit readiness
- DHF for device families
- Legacy DHF guidance$req$,
 10, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-11: ISO7.3.2-CP01: Design Planning - Combination Product: CGMP Determination (21 CFR 4)
('20000000-0000-0000-0000-000000000011'::uuid,
 'ISO7.3.2-CP01',
 'Design Planning - Combination Product: CGMP Determination (21 CFR 4)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-CP01 -- "Design Planning - Combination Product: CGMP Determination (21 CFR 4)".

Objective:
Determine whether planning addresses 21 CFR 4 CGMP applicability for combination products, including:
- 21 CFR 4 applicability assessed
- Subpart A vs B determination documented
- Constituent parts identified
- CGMP responsibilities assigned

Core evidence to look for (minimal subset for PASS):
- CGMP determination required for combination products
- Constituent part identification process
- Rationale documentation required
- Cross-functional input for determination

Examples of strong PASS evidence:
- Decision tree for CGMP determination
- Rationale template
- Regulatory strategy linkage
- Periodic reassessment triggers

When to FLAG:
- Combination products acknowledged but 21 CFR 4 vague
- Determination process unclear
- Documentation requirements missing
- Coordination informal

When to FAIL:
- No combination product consideration
- 21 CFR 4 not referenced
- No constituent identification
- CGMP assumed without assessment

Typical OFIs (can still PASS):
- FDA pre-submission strategy
- Examples of Subpart A/B scenarios
- Drug development coordination SOP
- CGMP election change management$req$,
 11, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-12: ISO7.3.2-RM01: Design Planning - Risk Management Planning Integration (ISO 14971)
('20000000-0000-0000-0000-000000000012'::uuid,
 'ISO7.3.2-RM01',
 'Design Planning - Risk Management Planning Integration (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-RM01 -- "Design Planning - Risk Management Planning Integration (ISO 14971)".

Objective:
Determine whether design planning integrates risk management planning per ISO 14971, including:
- Risk management plan required
- Risk activities mapped to design stages
- Risk acceptability criteria referenced
- Risk file requirements established

Core evidence to look for (minimal subset for PASS):
- RMP required for design projects
- Risk activities linked to design phases
- Acceptability criteria defined or referenced
- Risk file maintenance requirements

Examples of strong PASS evidence:
- RMP template or content requirements
- Timing of risk activities vs design milestones
- ALARP methodology referenced
- Risk review at design reviews

When to FLAG:
- Risk mentioned but planning integration unclear
- Activities not mapped to stages
- Acceptability criteria not specified
- Risk file location undefined

When to FAIL:
- No risk management planning
- Risk analysis disconnected from design
- No integration with design phases
- Risk file not required

Typical OFIs (can still PASS):
- Use-related risk analysis integration
- Production risk analysis timing
- Post-production monitoring linkage
- Supplier risk coordination$req$,
 12, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-13: ISO7.3.2-UE01: Design Planning - Usability Engineering Planning (IEC 62366-1)
('20000000-0000-0000-0000-000000000013'::uuid,
 'ISO7.3.2-UE01',
 'Design Planning - Usability Engineering Planning (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.2-UE01 -- "Design Planning - Usability Engineering Planning (IEC 62366-1)".

Objective:
Determine whether design planning integrates usability engineering per IEC 62366-1, including:
- Use specification requirements
- UE process integrated with design
- Formative/summative study milestones
- User population documentation

Core evidence to look for (minimal subset for PASS):
- Use specification required
- UE activities mapped to design phases
- Formative evaluation in early phases
- Summative validation in late phases

Examples of strong PASS evidence:
- Use specification template
- HF study milestones in design plan
- User population characterization
- Critical task identification process

When to FLAG:
- UE mentioned but planning unclear
- Formative/summative not distinguished
- Use specification content undefined
- User population vague

When to FAIL:
- No UE planning requirements
- Usability ad hoc
- No use specification
- User needs not in planning

Typical OFIs (can still PASS):
- Known use problems analysis
- Training effectiveness planning
- Labeling development integration
- HF specialist resource planning$req$,
 13, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-14: ISO7.3.3-01: Design Input - Design Input Determination
('20000000-0000-0000-0000-000000000014'::uuid,
 'ISO7.3.3-01',
 'Design Input - Design Input Determination',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-01 -- "Design Input - Design Input Determination".

Objective:
Determine whether inputs relating to product requirements are determined and records maintained, including:
- Product requirement inputs determined
- Input sources identified
- Input determination process defined
- Records of inputs maintained

Core evidence to look for (minimal subset for PASS):
- Input determination process established
- Multiple input sources addressed
- Documentation requirements defined
- Record retention specified

Examples of strong PASS evidence:
- Input sources checklist (user, regulatory, standards, risk)
- Input gathering methodology
- Input documentation template
- Traceability initiation at input stage

When to FLAG:
- Inputs required but sources vague
- Determination process unclear
- Documentation informal
- Record requirements incomplete

When to FAIL:
- No input determination process
- Sources not identified
- Inputs undocumented
- No records maintained

Typical OFIs (can still PASS):
- Stakeholder analysis for inputs
- Competitive analysis as input
- Clinical advisory input
- Post-market feedback integration$req$,
 14, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-15: ISO7.3.3-02: Design Input - Functional and Performance Requirements
('20000000-0000-0000-0000-000000000015'::uuid,
 'ISO7.3.3-02',
 'Design Input - Functional and Performance Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-02 -- "Design Input - Functional and Performance Requirements".

Objective:
Determine whether design inputs include functional and performance requirements, including:
- Functional requirements as inputs
- Performance requirements as inputs
- Requirements measurable/verifiable
- Requirements complete for intended use

Core evidence to look for (minimal subset for PASS):
- Functional requirements explicitly required
- Performance specifications required
- Measurability criteria addressed
- Completeness review required

Examples of strong PASS evidence:
- Functional requirement format guidance
- Performance specification template
- Quantitative vs qualitative guidance
- Acceptance criteria at input stage

When to FLAG:
- Requirements mentioned without categorization
- Measurability not addressed
- Completeness criteria vague
- Format not specified

When to FAIL:
- No functional requirements
- No performance specifications
- Requirements not verifiable
- Input completeness not assessed

Typical OFIs (can still PASS):
- Essential performance per IEC 60601
- Worst-case performance conditions
- Degradation requirements
- Environmental performance$req$,
 15, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-16: ISO7.3.3-03: Design Input - Safety Requirements
('20000000-0000-0000-0000-000000000016'::uuid,
 'ISO7.3.3-03',
 'Design Input - Safety Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-03 -- "Design Input - Safety Requirements".

Objective:
Determine whether design inputs include safety requirements, including:
- Safety requirements as inputs
- Safety derived from risk management
- Safety standards addressed
- Patient and user safety covered

Core evidence to look for (minimal subset for PASS):
- Safety requirements explicitly required
- Risk-derived safety requirements
- Applicable safety standards identified
- User and patient safety distinguished

Examples of strong PASS evidence:
- Safety requirement derivation process
- Linkage to preliminary hazard analysis
- Safety standard checklist
- Safety requirement format

When to FLAG:
- Safety mentioned without process
- Risk linkage unclear
- Standards not specified
- Patient/user not distinguished

When to FAIL:
- No safety requirements
- Safety disconnected from risk
- Standards not addressed
- Safety assumed

Typical OFIs (can still PASS):
- Use-related safety requirements
- Cybersecurity requirements
- Biocompatibility requirements
- EMC/electrical safety$req$,
 16, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-17: ISO7.3.3-04: Design Input - Applicable Regulatory Requirements
('20000000-0000-0000-0000-000000000017'::uuid,
 'ISO7.3.3-04',
 'Design Input - Applicable Regulatory Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-04 -- "Design Input - Applicable Regulatory Requirements".

Objective:
Determine whether design inputs include applicable regulatory requirements, including:
- Regulatory requirements as inputs
- Multiple markets addressed
- Standards applicability assessed
- Regulatory pathway impact

Core evidence to look for (minimal subset for PASS):
- Regulatory requirements required as inputs
- Market-specific requirements identified
- Standards matrix required
- Regulatory traceability

Examples of strong PASS evidence:
- Regulatory input checklist by market
- Standards applicability matrix
- Classification-specific requirements
- Predicate/essential equivalence

When to FLAG:
- Regulatory inputs mentioned without specifics
- Single market focus only
- Standards informal
- Traceability unclear

When to FAIL:
- No regulatory input requirements
- Regulations assumed, not documented
- Standards not identified
- No regulatory traceability

Typical OFIs (can still PASS):
- Emerging regulation monitoring
- Guidance document review
- Special controls identification
- International harmonization$req$,
 17, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-18: ISO7.3.3-05: Design Input - Risk Management Outputs as Inputs
('20000000-0000-0000-0000-000000000018'::uuid,
 'ISO7.3.3-05',
 'Design Input - Risk Management Outputs as Inputs',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-05 -- "Design Input - Risk Management Outputs as Inputs".

Objective:
Determine whether design inputs include applicable outputs of risk management, including:
- Risk outputs as design inputs
- Hazard mitigation requirements
- Risk control specifications
- Risk-input traceability

Core evidence to look for (minimal subset for PASS):
- Risk management outputs required as inputs
- Hazard analysis feeds design requirements
- Risk controls specified as inputs
- Traceability to risk analysis

Examples of strong PASS evidence:
- Preliminary hazard analysis timing
- Risk-derived requirement format
- Safety requirement derivation
- Bidirectional traceability

When to FLAG:
- Risk inputs mentioned without process
- Timing unclear
- Format not specified
- Traceability vague

When to FAIL:
- No risk-derived inputs
- Risk analysis disconnected
- Safety requirements ad hoc
- No traceability

Typical OFIs (can still PASS):
- Use-related risk inputs
- Production risk inputs
- Post-market feedback integration
- Supplier risk inputs$req$,
 18, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-19: ISO7.3.3-06: Design Input - Information from Previous Designs
('20000000-0000-0000-0000-000000000019'::uuid,
 'ISO7.3.3-06',
 'Design Input - Information from Previous Designs',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-06 -- "Design Input - Information from Previous Designs".

Objective:
Determine whether design inputs include information derived from previous similar designs, as appropriate, including:
- Previous design information considered
- Predicate/similar device analysis
- Lessons learned incorporated
- Known issues addressed

Core evidence to look for (minimal subset for PASS):
- Previous design review required
- Predicate analysis for regulated devices
- Lessons learned process
- Known problem resolution

Examples of strong PASS evidence:
- Predicate comparison template
- Lessons learned database
- Known use error analysis
- Field performance data review

When to FLAG:
- Previous designs mentioned without process
- Predicate analysis informal
- Lessons learned ad hoc
- Known issues not tracked

When to FAIL:
- No previous design consideration
- Predicate not analyzed
- Lessons not incorporated
- Known issues ignored

Typical OFIs (can still PASS):
- Competitor device analysis
- Literature review process
- MAUDE/vigilance database review
- Patent landscape review$req$,
 19, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-20: ISO7.3.3-07: Design Input - Essential Requirements for Design
('20000000-0000-0000-0000-000000000020'::uuid,
 'ISO7.3.3-07',
 'Design Input - Essential Requirements for Design',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-07 -- "Design Input - Essential Requirements for Design".

Objective:
Determine whether design inputs include other requirements essential for design and development, including:
- Essential requirements identified
- Manufacturing requirements as inputs
- Packaging/labeling requirements
- Service/maintenance requirements

Core evidence to look for (minimal subset for PASS):
- Comprehensive input categories
- Manufacturing constraints addressed
- Packaging/labeling inputs
- Lifecycle considerations

Examples of strong PASS evidence:
- Input category checklist
- DFM/DFA requirements
- Sterilization requirements
- Shelf-life requirements

When to FLAG:
- Essential requirements vague
- Manufacturing informal
- Packaging/labeling late
- Service not addressed

When to FAIL:
- Essential requirements missing
- Manufacturing disconnected
- No packaging/labeling inputs
- Lifecycle ignored

Typical OFIs (can still PASS):
- Environmental requirements
- Cost targets as inputs
- Supply chain requirements
- Sustainability requirements$req$,
 20, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-21: ISO7.3.3-08: Design Input - Input Review and Adequacy
('20000000-0000-0000-0000-000000000021'::uuid,
 'ISO7.3.3-08',
 'Design Input - Input Review and Adequacy',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-08 -- "Design Input - Input Review and Adequacy".

Objective:
Determine whether design inputs are reviewed for adequacy and approved, including:
- Input review required
- Adequacy assessment criteria
- Incomplete/ambiguous resolution
- Approval before use

Core evidence to look for (minimal subset for PASS):
- Input review process defined
- Adequacy criteria established
- Resolution process for deficiencies
- Approval workflow defined

Examples of strong PASS evidence:
- Input review checklist
- Completeness criteria
- Conflict resolution process
- Cross-functional review requirement

When to FLAG:
- Review required but criteria vague
- Adequacy assessment informal
- Resolution process unclear
- Approval authority undefined

When to FAIL:
- No input review
- Adequacy not assessed
- Deficiencies not resolved
- No approval required

Typical OFIs (can still PASS):
- Input freeze/baseline process
- Change management for inputs
- Stakeholder sign-off
- Input metrics$req$,
 21, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-22: ISO7.3.3-CP01: Design Input - Combination Product: Drug Product Requirements as Inputs
('20000000-0000-0000-0000-000000000022'::uuid,
 'ISO7.3.3-CP01',
 'Design Input - Combination Product: Drug Product Requirements as Inputs',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-CP01 -- "Design Input - Combination Product: Drug Product Requirements as Inputs".

Objective:
Determine whether design inputs include drug product specifications for combination products, including:
- Drug formulation requirements
- Container closure requirements
- Stability/compatibility requirements
- Dose delivery specifications

Core evidence to look for (minimal subset for PASS):
- Drug product specs as device inputs
- Container closure addressed
- Compatibility/stability required
- Dose accuracy from drug specs

Examples of strong PASS evidence:
- Drug-device interface spec template
- CMC coordination process
- Extractables/leachables consideration
- Drug labeling requirements

When to FLAG:
- Drug requirements mentioned without detail
- Container closure vague
- Compatibility informal
- CMC coordination unclear

When to FAIL:
- No drug product inputs
- Device designed without drug
- Container closure missing
- Interface not specified

Typical OFIs (can still PASS):
- Shelf-life harmonization
- Temperature/storage alignment
- Reconstitution requirements
- Multi-formulation compatibility$req$,
 22, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-23: ISO7.3.3-UE01: Design Input - User Interface Requirements as Inputs (IEC 62366-1)
('20000000-0000-0000-0000-000000000023'::uuid,
 'ISO7.3.3-UE01',
 'Design Input - User Interface Requirements as Inputs (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.3-UE01 -- "Design Input - User Interface Requirements as Inputs (IEC 62366-1)".

Objective:
Determine whether design inputs include user interface and use-related requirements, including:
- User interface characteristics
- Use-related hazards identified
- Use scenarios documented
- Critical task requirements

Core evidence to look for (minimal subset for PASS):
- UI requirements as inputs
- Use-related hazard identification
- Use scenario documentation
- Critical task identification

Examples of strong PASS evidence:
- Task analysis methodology
- Use error analysis from predicates
- User population-specific requirements
- Use environment requirements

When to FLAG:
- UI mentioned without process
- Use scenarios vague
- Critical tasks undefined
- Hazard identification informal

When to FAIL:
- No UI input requirements
- Use scenarios missing
- Task analysis absent
- Use-related hazards ignored

Typical OFIs (can still PASS):
- Competitive usability benchmarking
- User feedback integration
- Simulated use environment specs
- Training requirement inputs$req$,
 23, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-24: ISO7.3.4-01: Design Output - Output Form for Verification
('20000000-0000-0000-0000-000000000024'::uuid,
 'ISO7.3.4-01',
 'Design Output - Output Form for Verification',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-01 -- "Design Output - Output Form for Verification".

Objective:
Determine whether design outputs are in a form suitable for verification against inputs, including:
- Outputs in verifiable form
- Outputs traceable to inputs
- Measurable/testable outputs
- Clear acceptance criteria

Core evidence to look for (minimal subset for PASS):
- Output format requirements defined
- Verifiability required
- Traceability to inputs required
- Acceptance criteria before verification

Examples of strong PASS evidence:
- Output specification template
- Measurability criteria
- Traceability matrix requirements
- Acceptance criteria format

When to FLAG:
- Outputs required but format unclear
- Verifiability not explicit
- Traceability mentioned without method
- Acceptance criteria timing vague

When to FAIL:
- No output format requirements
- Outputs not verifiable
- No input linkage
- No acceptance criteria

Typical OFIs (can still PASS):
- Statistical acceptance criteria
- Pass/fail vs variable data
- Worst-case condition specification
- Output categorization$req$,
 24, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-25: ISO7.3.4-02: Design Output - Output Approval Before Release
('20000000-0000-0000-0000-000000000025'::uuid,
 'ISO7.3.4-02',
 'Design Output - Output Approval Before Release',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-02 -- "Design Output - Output Approval Before Release".

Objective:
Determine whether design outputs are approved prior to release, including:
- Output approval required
- Approval before release/use
- Approval authority defined
- Approval documented

Core evidence to look for (minimal subset for PASS):
- Approval requirement explicit
- Timing before release defined
- Authority designated
- Documentation required

Examples of strong PASS evidence:
- Approval workflow defined
- Multi-level approval as needed
- Electronic signature compliance
- Release criteria checklist

When to FLAG:
- Approval mentioned without process
- Timing unclear
- Authority vague
- Documentation informal

When to FAIL:
- No approval requirements
- Outputs released without control
- Authority undefined
- No documentation

Typical OFIs (can still PASS):
- Conditional release process
- Partial approval criteria
- Approval delegation
- Approval metrics$req$,
 25, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-26: ISO7.3.4-03: Design Output - Purchasing, Production, and Service Information
('20000000-0000-0000-0000-000000000026'::uuid,
 'ISO7.3.4-03',
 'Design Output - Purchasing, Production, and Service Information',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-03 -- "Design Output - Purchasing, Production, and Service Information".

Objective:
Determine whether design outputs provide appropriate information for purchasing, production, and service provision, including:
- Purchasing information as outputs
- Production specifications
- Service/maintenance information
- DMR content addressed

Core evidence to look for (minimal subset for PASS):
- Manufacturing specifications required
- Purchasing specifications required
- Service information as outputs
- DMR linkage defined

Examples of strong PASS evidence:
- DMR content checklist
- Drawing/specification requirements
- Process specification format
- Supplier specification requirements

When to FLAG:
- Manufacturing outputs vague
- Purchasing specs not explicit
- Service information missing
- DMR relationship unclear

When to FAIL:
- No manufacturing outputs
- Design-production disconnect
- No purchasing specifications
- No service information

Typical OFIs (can still PASS):
- Process validation linkage
- Supplier qualification coordination
- Assembly/test instructions
- Packaging specifications$req$,
 26, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-27: ISO7.3.4-04: Design Output - Product Acceptance Criteria
('20000000-0000-0000-0000-000000000027'::uuid,
 'ISO7.3.4-04',
 'Design Output - Product Acceptance Criteria',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-04 -- "Design Output - Product Acceptance Criteria".

Objective:
Determine whether design outputs contain or reference product acceptance criteria, including:
- Acceptance criteria in outputs
- Criteria for product release
- Inspection/test criteria
- Criteria traceable to inputs

Core evidence to look for (minimal subset for PASS):
- Acceptance criteria required in outputs
- Product release criteria defined
- Inspection/test specifications
- Input traceability

Examples of strong PASS evidence:
- Acceptance criteria format
- Statistical basis where appropriate
- In-process and final criteria
- Sampling plan references

When to FLAG:
- Criteria mentioned without format
- Release criteria vague
- Test specs informal
- Traceability unclear

When to FAIL:
- No acceptance criteria
- Release criteria undefined
- No test specifications
- Criteria disconnected

Typical OFIs (can still PASS):
- AQL/sampling guidance
- Attribute vs variable criteria
- Supplier acceptance criteria
- Stability acceptance criteria$req$,
 27, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-28: ISO7.3.4-05: Design Output - Essential Characteristics for Safe and Proper Use
('20000000-0000-0000-0000-000000000028'::uuid,
 'ISO7.3.4-05',
 'Design Output - Essential Characteristics for Safe and Proper Use',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-05 -- "Design Output - Essential Characteristics for Safe and Proper Use".

Objective:
Determine whether design outputs specify characteristics essential for safe and proper use, including:
- Essential characteristics identified
- Safety-critical outputs defined
- Proper use characteristics
- Risk control outputs

Core evidence to look for (minimal subset for PASS):
- Essential characteristics required
- Safety linkage explicit
- Proper use specifications
- Risk control documentation

Examples of strong PASS evidence:
- Essential characteristics list
- Risk-based prioritization
- Critical-to-quality identification
- Regulatory linkage (substantial equivalence)

When to FLAG:
- Essential mentioned without criteria
- Safety linkage vague
- Prioritization unclear
- Risk connection informal

When to FAIL:
- No essential characteristics
- Safety outputs undefined
- No prioritization
- Risk controls not outputs

Typical OFIs (can still PASS):
- Essential performance testing
- Process capability for essentials
- Change control for essentials
- Post-market monitoring linkage$req$,
 28, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-29: ISO7.3.4-06: Design Output - Risk Control Measures as Outputs (ISO 14971)
('20000000-0000-0000-0000-000000000029'::uuid,
 'ISO7.3.4-06',
 'Design Output - Risk Control Measures as Outputs (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-06 -- "Design Output - Risk Control Measures as Outputs (ISO 14971)".

Objective:
Determine whether design outputs include risk control measures, including:
- Risk controls documented as outputs
- Control specifications
- Residual risk documentation
- Risk-output traceability

Core evidence to look for (minimal subset for PASS):
- Risk controls in output documentation
- Control specifications defined
- Residual risk documented
- Traceability to risk analysis

Examples of strong PASS evidence:
- Risk control specification format
- Residual risk acceptance documentation
- Verification protocol linkage
- Risk management report integration

When to FLAG:
- Risk controls mentioned without format
- Specifications vague
- Residual risk informal
- Traceability unclear

When to FAIL:
- No risk control outputs
- Controls not specified
- Residual risk undocumented
- No traceability

Typical OFIs (can still PASS):
- Use-related control outputs
- Information for safety outputs
- Training as control output
- Post-market control effectiveness$req$,
 29, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-30: ISO7.3.4-07: Design Output - User Interface Specification as Output (IEC 62366-1)
('20000000-0000-0000-0000-000000000030'::uuid,
 'ISO7.3.4-07',
 'Design Output - User Interface Specification as Output (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.4-07 -- "Design Output - User Interface Specification as Output (IEC 62366-1)".

Objective:
Determine whether design outputs include user interface specification, including:
- UI specification as output
- Safety-relevant UI elements
- Labeling/IFU as outputs
- Training materials

Core evidence to look for (minimal subset for PASS):
- UI specification required
- Safety elements identified
- Labeling as design output
- Training requirements

Examples of strong PASS evidence:
- UI specification template
- IFU content requirements
- Training effectiveness criteria
- Usability test acceptance criteria

When to FLAG:
- UI mentioned without detail
- Labeling not explicit output
- Training not addressed
- Safety elements vague

When to FAIL:
- No UI specification
- Labeling uncontrolled
- No training requirements
- Use safety not in outputs

Typical OFIs (can still PASS):
- Multilingual requirements
- Quick reference guide
- Video/multimedia outputs
- User feedback mechanism$req$,
 30, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-31: ISO7.3.5-01: Design Review - Systematic Reviews at Suitable Stages
('20000000-0000-0000-0000-000000000031'::uuid,
 'ISO7.3.5-01',
 'Design Review - Systematic Reviews at Suitable Stages',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-01 -- "Design Review - Systematic Reviews at Suitable Stages".

Objective:
Determine whether systematic reviews of design and development are performed at suitable stages, including:
- Systematic reviews required
- Reviews at suitable stages
- Review methodology defined
- Stage-appropriate scope

Core evidence to look for (minimal subset for PASS):
- Systematic review requirements
- Stage definitions for reviews
- Review methodology defined
- Scope per stage

Examples of strong PASS evidence:
- Review types defined (technical, management, gate)
- Stage-specific review criteria
- Review agenda templates
- Phase gate criteria

When to FLAG:
- Reviews required but stages unclear
- Methodology vague
- Scope informal
- Systematic not defined

When to FAIL:
- No systematic reviews
- Reviews ad hoc
- No stage linkage
- Methodology undefined

Typical OFIs (can still PASS):
- Review effectiveness metrics
- Pre-review package requirements
- Review action tracking
- Lessons learned capture$req$,
 31, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-32: ISO7.3.5-02: Design Review - Evaluation of Design Results
('20000000-0000-0000-0000-000000000032'::uuid,
 'ISO7.3.5-02',
 'Design Review - Evaluation of Design Results',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-02 -- "Design Review - Evaluation of Design Results".

Objective:
Determine whether reviews evaluate ability of design results to meet requirements, including:
- Results evaluated against requirements
- Input-output conformance assessed
- V&V status reviewed
- Risk status evaluated

Core evidence to look for (minimal subset for PASS):
- Requirement conformance evaluation
- Design status assessment
- V&V progress review
- Risk management status

Examples of strong PASS evidence:
- Review checklist against requirements
- Traceability matrix review
- V&V summary presentation
- Risk report presentation

When to FLAG:
- Evaluation mentioned without criteria
- Conformance assessment vague
- V&V status informal
- Risk review not explicit

When to FAIL:
- No evaluation against requirements
- Conformance not assessed
- V&V not reviewed
- Risk not evaluated

Typical OFIs (can still PASS):
- Quantitative progress metrics
- Technical debt assessment
- Schedule/resource review
- Quality metrics review$req$,
 32, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-33: ISO7.3.5-03: Design Review - Problem Identification and Actions
('20000000-0000-0000-0000-000000000033'::uuid,
 'ISO7.3.5-03',
 'Design Review - Problem Identification and Actions',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-03 -- "Design Review - Problem Identification and Actions".

Objective:
Determine whether reviews identify problems and propose necessary actions, including:
- Problem identification required
- Actions proposed
- Action tracking
- Closure verification

Core evidence to look for (minimal subset for PASS):
- Problem identification in reviews
- Action proposal process
- Tracking mechanism
- Closure documentation

Examples of strong PASS evidence:
- Problem categorization (critical, major, minor)
- Action ownership and due dates
- Escalation criteria
- Closure verification process

When to FLAG:
- Problems mentioned without process
- Actions informal
- Tracking vague
- Closure not verified

When to FAIL:
- No problem identification
- No action tracking
- Issues not documented
- No closure process

Typical OFIs (can still PASS):
- CAPA linkage for systemic issues
- Trend analysis
- Risk register update triggers
- Design decision documentation$req$,
 33, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-34: ISO7.3.5-04: Design Review - Review Participants
('20000000-0000-0000-0000-000000000034'::uuid,
 'ISO7.3.5-04',
 'Design Review - Review Participants',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-04 -- "Design Review - Review Participants".

Objective:
Determine whether reviews include representatives of functions concerned with the design stage, including:
- Function representatives required
- Stage-appropriate participation
- Specialist inclusion
- Independent perspective

Core evidence to look for (minimal subset for PASS):
- Cross-functional attendance required
- Functions defined by stage
- Specialist determination
- Independent reviewer (per 820.30)

Examples of strong PASS evidence:
- Attendee matrix by review type
- Quorum requirements
- Specialist identification criteria
- Independence definition

When to FLAG:
- Participation required but vague
- Specialists not addressed
- Independence unclear
- Attendance not documented

When to FAIL:
- No participation requirements
- Single function acceptable
- No specialist requirements
- No independence

Typical OFIs (can still PASS):
- Drug development for combination products
- HF specialist requirements
- Clinical input requirements
- Supplier participation$req$,
 34, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-35: ISO7.3.5-05: Design Review - Review Records
('20000000-0000-0000-0000-000000000035'::uuid,
 'ISO7.3.5-05',
 'Design Review - Review Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-05 -- "Design Review - Review Records".

Objective:
Determine whether records of review results and necessary actions are maintained, including:
- Review results recorded
- Actions documented
- Records maintained
- Traceability to design file

Core evidence to look for (minimal subset for PASS):
- Results documentation required
- Action documentation required
- Record retention defined
- Design file linkage

Examples of strong PASS evidence:
- Review minutes template
- Action item format
- Attendee/signature records
- DHF/design file requirements

When to FLAG:
- Documentation required but format unclear
- Actions informal
- Retention vague
- File linkage not specified

When to FAIL:
- No record requirements
- Results not documented
- Actions not recorded
- No design file

Typical OFIs (can still PASS):
- Electronic review records
- Action closure tracking
- Review effectiveness metrics
- Searchable records$req$,
 35, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-36: ISO7.3.5-06: Design Review - Risk Management Review Integration (ISO 14971)
('20000000-0000-0000-0000-000000000036'::uuid,
 'ISO7.3.5-06',
 'Design Review - Risk Management Review Integration (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-06 -- "Design Review - Risk Management Review Integration (ISO 14971)".

Objective:
Determine whether design reviews include risk management status review, including:
- Risk status at reviews
- Risk file adequacy
- Control implementation
- Residual risk evaluation

Core evidence to look for (minimal subset for PASS):
- Risk review as agenda item
- Risk file assessment
- Control status review
- Residual risk discussion

Examples of strong PASS evidence:
- Risk review checklist
- Risk management report presentation
- Open risk item tracking
- Risk acceptance documentation

When to FLAG:
- Risk mentioned without specifics
- File review not explicit
- Control status vague
- Residual risk not discussed

When to FAIL:
- No risk review
- Risk separate from design reviews
- Status not assessed
- No risk acceptance

Typical OFIs (can still PASS):
- Use-related risk review
- Production risk review
- Post-market risk integration
- Cumulative risk assessment$req$,
 36, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-37: ISO7.3.5-07: Design Review - Human Factors Review Integration (IEC 62366-1)
('20000000-0000-0000-0000-000000000037'::uuid,
 'ISO7.3.5-07',
 'Design Review - Human Factors Review Integration (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.5-07 -- "Design Review - Human Factors Review Integration (IEC 62366-1)".

Objective:
Determine whether design reviews include human factors/usability evaluation status, including:
- HF status at reviews
- Formative study results
- Use error analysis
- UI adequacy assessment

Core evidence to look for (minimal subset for PASS):
- HF review as agenda item
- Formative results presented
- Use errors discussed
- UI adequacy evaluated

Examples of strong PASS evidence:
- HF specialist presentation
- Use error trending
- Summative readiness assessment
- Critical task review

When to FLAG:
- HF mentioned without requirements
- Formative not reviewed
- Use errors not tracked
- UI criteria vague

When to FAIL:
- No HF review
- Usability separate
- Use errors ignored
- UI not assessed

Typical OFIs (can still PASS):
- User feedback review
- Training effectiveness
- Labeling adequacy
- Competitive comparison$req$,
 37, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-38: ISO7.3.6-01: Design Verification - Verification per Planned Arrangements
('20000000-0000-0000-0000-000000000038'::uuid,
 'ISO7.3.6-01',
 'Design Verification - Verification per Planned Arrangements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-01 -- "Design Verification - Verification per Planned Arrangements".

Objective:
Determine whether design verification is performed in accordance with planned arrangements, including:
- Verification per plan
- Planned arrangements defined
- Verification methods appropriate
- Timing per design stage

Core evidence to look for (minimal subset for PASS):
- Verification per planning requirements
- Methods defined in plan
- Stage-appropriate verification
- Protocol requirements

Examples of strong PASS evidence:
- Verification matrix per plan
- Protocol template
- Method selection criteria
- Statistical rationale requirements

When to FLAG:
- Verification required but planning link unclear
- Methods vague
- Timing not specified
- Protocol format undefined

When to FAIL:
- No verification planning link
- Methods ad hoc
- Uncontrolled verification
- No protocols

Typical OFIs (can still PASS):
- Verification vs validation distinction
- Sample size guidance
- Worst-case selection
- Accelerated testing guidance$req$,
 38, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-39: ISO7.3.6-02: Design Verification - Output Conformance to Inputs
('20000000-0000-0000-0000-000000000039'::uuid,
 'ISO7.3.6-02',
 'Design Verification - Output Conformance to Inputs',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-02 -- "Design Verification - Output Conformance to Inputs".

Objective:
Determine whether verification ensures design outputs meet design input requirements, including:
- Output-input conformance verified
- Traceability demonstrated
- All inputs verified
- Gap identification

Core evidence to look for (minimal subset for PASS):
- Conformance verification required
- Traceability matrix verification
- Input coverage assessment
- Gap analysis process

Examples of strong PASS evidence:
- Verification report showing traceability
- 100% input coverage requirement
- Gap closure documentation
- Summary verification matrix

When to FLAG:
- Conformance mentioned without method
- Traceability informal
- Coverage not assessed
- Gaps not tracked

When to FAIL:
- No conformance verification
- Inputs-outputs disconnected
- Coverage unknown
- Gaps ignored

Typical OFIs (can still PASS):
- Partial verification criteria
- Negative testing
- Boundary condition testing
- Regression verification$req$,
 39, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-40: ISO7.3.6-03: Design Verification - Verification Records
('20000000-0000-0000-0000-000000000040'::uuid,
 'ISO7.3.6-03',
 'Design Verification - Verification Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-03 -- "Design Verification - Verification Records".

Objective:
Determine whether records of verification results and necessary actions are maintained, including:
- Verification results recorded
- Actions documented
- Records complete
- Design file integration

Core evidence to look for (minimal subset for PASS):
- Result documentation required
- Action documentation
- Record completeness criteria
- Design file requirements

Examples of strong PASS evidence:
- Verification report template
- Protocol-report linkage
- Deviation handling
- DHF integration

When to FLAG:
- Documentation required but incomplete
- Actions informal
- Completeness vague
- File integration unclear

When to FAIL:
- No verification records
- Results undocumented
- Actions not tracked
- No design file

Typical OFIs (can still PASS):
- Electronic data integrity
- Raw data retention
- OOS handling
- Summary reports$req$,
 40, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-41: ISO7.3.6-04: Design Verification - Risk Control Verification (ISO 14971)
('20000000-0000-0000-0000-000000000041'::uuid,
 'ISO7.3.6-04',
 'Design Verification - Risk Control Verification (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-04 -- "Design Verification - Risk Control Verification (ISO 14971)".

Objective:
Determine whether verification includes risk control implementation and effectiveness, including:
- Control implementation verified
- Effectiveness verified
- Verification methods for controls
- Documentation requirements

Core evidence to look for (minimal subset for PASS):
- Implementation verification required
- Effectiveness verification required
- Methods defined
- Documentation specified

Examples of strong PASS evidence:
- Control verification matrix
- Effectiveness criteria
- Risk file linkage
- Residual risk verification

When to FLAG:
- Verification mentioned without method
- Effectiveness vague
- Documentation unclear
- Residual risk not addressed

When to FAIL:
- No control verification
- Controls assumed effective
- No documentation
- Risk-verification disconnected

Typical OFIs (can still PASS):
- Use-related control verification
- Information for safety verification
- Training verification
- Post-market monitoring$req$,
 41, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-42: ISO7.3.6-05: Design Verification - Formative Usability Evaluation (IEC 62366-1)
('20000000-0000-0000-0000-000000000042'::uuid,
 'ISO7.3.6-05',
 'Design Verification - Formative Usability Evaluation (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-05 -- "Design Verification - Formative Usability Evaluation (IEC 62366-1)".

Objective:
Determine whether formative usability evaluation is included in design verification, including:
- Formative evaluation required
- Methods defined
- Iterative improvement
- Design feedback mechanism

Core evidence to look for (minimal subset for PASS):
- Formative evaluation requirements
- Method options (expert review, user testing)
- Iteration process
- Design change triggers

Examples of strong PASS evidence:
- Formative protocol guidance
- User recruitment criteria
- Finding categorization
- Design improvement tracking

When to FLAG:
- Formative mentioned without requirements
- Methods vague
- Iteration unclear
- Feedback informal

When to FAIL:
- No formative evaluation
- Usability only at end
- No iteration
- Findings not used

Typical OFIs (can still PASS):
- Remote vs in-person
- Prototype fidelity
- Participant numbers
- Comparative evaluation$req$,
 42, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-43: ISO7.3.6-CP01: Design Verification - Combination Product: Verification with Drug Product
('20000000-0000-0000-0000-000000000043'::uuid,
 'ISO7.3.6-CP01',
 'Design Verification - Combination Product: Verification with Drug Product',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.6-CP01 -- "Design Verification - Combination Product: Verification with Drug Product".

Objective:
Determine whether verification includes testing with drug product for combination products, including:
- Drug product in verification
- Functional performance with drug
- Dose accuracy verification
- Container closure integrity

Core evidence to look for (minimal subset for PASS):
- Drug product use required
- Functional testing with drug
- Dose accuracy testing
- Container closure testing

Examples of strong PASS evidence:
- Surrogate/bridging rationale
- Drug lot selection criteria
- Dose accuracy acceptance criteria
- Stability condition testing

When to FLAG:
- Drug use mentioned without requirements
- Surrogate without rationale
- Criteria unclear
- Container closure vague

When to FAIL:
- No drug product verification
- Device tested alone
- Dose accuracy missing
- Container closure absent

Typical OFIs (can still PASS):
- Drug lot variability
- Aged drug testing
- Temperature excursion
- Multi-formulation compatibility$req$,
 43, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-44: ISO7.3.7-01: Design Validation - Validation per Planned Arrangements
('20000000-0000-0000-0000-000000000044'::uuid,
 'ISO7.3.7-01',
 'Design Validation - Validation per Planned Arrangements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-01 -- "Design Validation - Validation per Planned Arrangements".

Objective:
Determine whether design validation is performed in accordance with planned arrangements, including:
- Validation per plan
- Planned arrangements defined
- Validation timing appropriate
- User needs focus

Core evidence to look for (minimal subset for PASS):
- Validation per planning
- Methods in plan
- Late-stage timing
- User needs linkage

Examples of strong PASS evidence:
- Validation matrix per plan
- Protocol template
- Timing criteria
- User needs traceability

When to FLAG:
- Validation required but planning vague
- Methods unclear
- Timing not specified
- User needs link informal

When to FAIL:
- No validation planning link
- Methods ad hoc
- Timing inappropriate
- User needs ignored

Typical OFIs (can still PASS):
- Clinical study integration
- Real-world evidence
- User satisfaction
- Post-market validation$req$,
 44, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-45: ISO7.3.7-02: Design Validation - Conformance to User Needs and Intended Uses
('20000000-0000-0000-0000-000000000045'::uuid,
 'ISO7.3.7-02',
 'Design Validation - Conformance to User Needs and Intended Uses',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-02 -- "Design Validation - Conformance to User Needs and Intended Uses".

Objective:
Determine whether validation ensures product conforms to defined user needs and intended uses, including:
- User needs validated
- Intended use demonstrated
- Actual/simulated conditions
- User population tested

Core evidence to look for (minimal subset for PASS):
- User needs traceability
- Intended use validation
- Use condition requirements
- Representative users

Examples of strong PASS evidence:
- User needs mapping in protocol
- Intended use acceptance criteria
- Use environment specification
- User group definitions

When to FLAG:
- User needs mentioned without method
- Intended use vague
- Conditions unclear
- Users not defined

When to FAIL:
- No user needs validation
- Intended use not demonstrated
- Conditions inappropriate
- Users not representative

Typical OFIs (can still PASS):
- Patient vs HCP validation
- Home vs clinical use
- Training effectiveness
- Long-term use validation$req$,
 45, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-46: ISO7.3.7-03: Design Validation - Validation Prior to Release
('20000000-0000-0000-0000-000000000046'::uuid,
 'ISO7.3.7-03',
 'Design Validation - Validation Prior to Release',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-03 -- "Design Validation - Validation Prior to Release".

Objective:
Determine whether validation is completed prior to product release for use or delivery, including:
- Validation before release
- Completion criteria
- Release decision linkage
- Timing requirements

Core evidence to look for (minimal subset for PASS):
- Validation timing before release
- Completion definition
- Release criteria include validation
- Timing enforced

Examples of strong PASS evidence:
- Validation as release gate
- Completion checklist
- Release decision documentation
- Partial release criteria

When to FLAG:
- Timing mentioned without enforcement
- Completion vague
- Release link unclear
- Exceptions undefined

When to FAIL:
- No timing requirement
- Validation after release acceptable
- Completion undefined
- Release disconnected

Typical OFIs (can still PASS):
- Conditional release
- Post-market commitments
- Validation completion metrics
- Regulatory submission timing$req$,
 46, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-47: ISO7.3.7-04: Design Validation - Validation Records
('20000000-0000-0000-0000-000000000047'::uuid,
 'ISO7.3.7-04',
 'Design Validation - Validation Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-04 -- "Design Validation - Validation Records".

Objective:
Determine whether records of validation results and necessary actions are maintained, including:
- Validation results recorded
- Actions documented
- Records complete
- Design file integration

Core evidence to look for (minimal subset for PASS):
- Result documentation required
- Action documentation
- Completeness criteria
- Design file requirements

Examples of strong PASS evidence:
- Validation report template
- Protocol-report linkage
- Statistical analysis requirements
- Regulatory submission format

When to FLAG:
- Documentation incomplete
- Actions informal
- Completeness vague
- File integration unclear

When to FAIL:
- No validation records
- Results undocumented
- Actions not tracked
- No design file

Typical OFIs (can still PASS):
- Electronic records
- Raw data retention
- Summary reports
- Trend analysis$req$,
 47, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-48: ISO7.3.7-05: Design Validation - Summative Usability Validation (IEC 62366-1)
('20000000-0000-0000-0000-000000000048'::uuid,
 'ISO7.3.7-05',
 'Design Validation - Summative Usability Validation (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-05 -- "Design Validation - Summative Usability Validation (IEC 62366-1)".

Objective:
Determine whether summative human factors validation study is required, including:
- Summative study required
- Final design/labeling/training
- Representative users
- Use safety evidence

Core evidence to look for (minimal subset for PASS):
- Summative requirements
- Final design requirement
- Representative user requirement
- Safety evidence requirements

Examples of strong PASS evidence:
- Summative protocol template
- User group definitions
- Sample size (15+ per group)
- Acceptance criteria (no critical task failures)

When to FLAG:
- Summative mentioned without requirements
- Final design unclear
- User representation vague
- Criteria undefined

When to FAIL:
- No summative requirements
- Design not finalized
- Users not representative
- No use safety validation

Typical OFIs (can still PASS):
- Simulated use environment
- Interview methodology
- Use error RCA
- Knowledge task assessment$req$,
 48, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-49: ISO7.3.7-06: Design Validation - Overall Residual Risk Evaluation (ISO 14971)
('20000000-0000-0000-0000-000000000049'::uuid,
 'ISO7.3.7-06',
 'Design Validation - Overall Residual Risk Evaluation (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-06 -- "Design Validation - Overall Residual Risk Evaluation (ISO 14971)".

Objective:
Determine whether overall residual risk evaluation is performed before product release, including:
- Overall risk evaluated
- Risk-benefit determination
- Before release timing
- Acceptability documented

Core evidence to look for (minimal subset for PASS):
- Overall evaluation required
- Risk-benefit if needed
- Timing specified
- Acceptability documented

Examples of strong PASS evidence:
- Risk management report requirements
- Risk-benefit methodology
- Stakeholder involvement
- Residual risk disclosure

When to FLAG:
- Evaluation mentioned without process
- Risk-benefit vague
- Timing unclear
- Documentation incomplete

When to FAIL:
- No overall evaluation
- Individual risks only
- No risk-benefit
- Release without assessment

Typical OFIs (can still PASS):
- Clinical input
- Patient perspective
- Comparative assessment
- Post-market monitoring plan$req$,
 49, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-50: ISO7.3.7-CP01: Design Validation - Combination Product: Validation with Drug Product
('20000000-0000-0000-0000-000000000050'::uuid,
 'ISO7.3.7-CP01',
 'Design Validation - Combination Product: Validation with Drug Product',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.7-CP01 -- "Design Validation - Combination Product: Validation with Drug Product".

Objective:
Determine whether validation uses commercial-equivalent drug product for combination products, including:
- Commercial-equivalent drug
- Clinical performance validation
- Combination use validated
- Patient population

Core evidence to look for (minimal subset for PASS):
- Drug product requirements
- Clinical study linkage
- Combination use requirements
- Patient population requirements

Examples of strong PASS evidence:
- Drug lot selection criteria
- Clinical protocol integration
- Real-world conditions
- Patient subgroups

When to FLAG:
- Drug use mentioned without requirements
- Clinical linkage vague
- Combination use unclear
- Population undefined

When to FAIL:
- No drug product requirements
- Clinical disconnected
- Device-only validation
- No patient studies

Typical OFIs (can still PASS):
- Drug stability at use
- Self-administration
- HCP administration
- Home vs clinical$req$,
 50, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-51: ISO7.3.8-01: Design Transfer - Transfer Procedures
('20000000-0000-0000-0000-000000000051'::uuid,
 'ISO7.3.8-01',
 'Design Transfer - Transfer Procedures',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.8-01 -- "Design Transfer - Transfer Procedures".

Objective:
Determine whether procedures for transfer of design outputs to manufacturing are documented, including:
- Transfer procedures documented
- Output to manufacturing translation
- Transfer completeness
- Transfer verification

Core evidence to look for (minimal subset for PASS):
- Transfer procedure requirements
- Translation process defined
- Completeness criteria
- Verification of transfer

Examples of strong PASS evidence:
- Transfer checklist
- DMR completeness verification
- Process validation linkage
- First article inspection

When to FLAG:
- Transfer mentioned without procedure
- Translation vague
- Completeness undefined
- Verification not specified

When to FAIL:
- No transfer procedures
- Design-manufacturing gap
- No completeness criteria
- No verification

Typical OFIs (can still PASS):
- Supplier transfer
- Training documentation
- Equipment qualification
- Scale-up process$req$,
 51, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-52: ISO7.3.8-02: Design Transfer - Manufacturing Suitability Verification
('20000000-0000-0000-0000-000000000052'::uuid,
 'ISO7.3.8-02',
 'Design Transfer - Manufacturing Suitability Verification',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.8-02 -- "Design Transfer - Manufacturing Suitability Verification".

Objective:
Determine whether design outputs are verified as suitable for manufacturing prior to release, including:
- Suitability verified
- Manufacturing capability assessed
- Production requirements met
- Pre-production verification

Core evidence to look for (minimal subset for PASS):
- Suitability verification required
- Capability assessment
- Requirement conformance
- Pre-production activities

Examples of strong PASS evidence:
- Capability study requirements
- Cpk/Ppk criteria
- Equipment qualification
- Operator training

When to FLAG:
- Suitability mentioned without criteria
- Capability informal
- Requirements vague
- Pre-production undefined

When to FAIL:
- No suitability verification
- Capability not assessed
- Requirements not verified
- Transfer uncontrolled

Typical OFIs (can still PASS):
- SPC implementation
- Continuous improvement
- Supplier capability
- Multi-site capability$req$,
 52, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-53: ISO7.3.8-03: Design Transfer - Production Capability for Product Requirements
('20000000-0000-0000-0000-000000000053'::uuid,
 'ISO7.3.8-03',
 'Design Transfer - Production Capability for Product Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.8-03 -- "Design Transfer - Production Capability for Product Requirements".

Objective:
Determine whether production capability can meet product requirements, including:
- Capability demonstrated
- Product requirements met
- Process validation
- Ongoing capability

Core evidence to look for (minimal subset for PASS):
- Capability demonstration required
- Requirement linkage
- Process validation requirements
- Capability monitoring

Examples of strong PASS evidence:
- Process validation protocol
- Capability indices
- Control plan
- Monitoring requirements

When to FLAG:
- Capability mentioned without method
- Validation linkage vague
- Control undefined
- Monitoring not specified

When to FAIL:
- No capability demonstration
- Requirements not linked
- No process validation
- No monitoring

Typical OFIs (can still PASS):
- Continuous verification
- Revalidation triggers
- Supplier capability
- Capacity planning$req$,
 53, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-54: ISO7.3.8-04: Design Transfer - Labeling and Training Transfer (IEC 62366-1)
('20000000-0000-0000-0000-000000000054'::uuid,
 'ISO7.3.8-04',
 'Design Transfer - Labeling and Training Transfer (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.8-04 -- "Design Transfer - Labeling and Training Transfer (IEC 62366-1)".

Objective:
Determine whether finalized labeling and training materials are released at transfer, including:
- Labeling finalized
- Training materials released
- IFU controlled
- Materials validated

Core evidence to look for (minimal subset for PASS):
- Labeling release required
- Training requirements
- IFU in DMR
- Validation required

Examples of strong PASS evidence:
- Labeling approval process
- Training effectiveness validation
- Multi-language requirements
- Packaging requirements

When to FLAG:
- Labeling timing unclear
- Training not addressed
- IFU control vague
- Validation incomplete

When to FAIL:
- No labeling requirements
- Training absent
- IFU uncontrolled
- No validation

Typical OFIs (can still PASS):
- Label printing qualification
- Training monitoring
- User feedback
- Labeling change control$req$,
 54, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-55: ISO7.3.9-01: Design Changes - Change Identification and Records
('20000000-0000-0000-0000-000000000055'::uuid,
 'ISO7.3.9-01',
 'Design Changes - Change Identification and Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-01 -- "Design Changes - Change Identification and Records".

Objective:
Determine whether design and development changes are identified and records maintained, including:
- Changes identified
- Records maintained
- Change documentation
- Configuration management

Core evidence to look for (minimal subset for PASS):
- Change identification process
- Record requirements
- Documentation format
- Configuration control

Examples of strong PASS evidence:
- Change request form
- Change log requirements
- Version control
- Baseline management

When to FLAG:
- Identification vague
- Records informal
- Documentation incomplete
- Configuration unclear

When to FAIL:
- No change identification
- No records
- Changes undocumented
- No configuration control

Typical OFIs (can still PASS):
- Change metrics
- Trending analysis
- Impact prediction
- Change board efficiency$req$,
 55, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-56: ISO7.3.9-02: Design Changes - Change Review, Verification, and Validation
('20000000-0000-0000-0000-000000000056'::uuid,
 'ISO7.3.9-02',
 'Design Changes - Change Review, Verification, and Validation',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-02 -- "Design Changes - Change Review, Verification, and Validation".

Objective:
Determine whether changes are reviewed, verified, validated as appropriate, and approved before implementation, including:
- Changes reviewed
- Verification as appropriate
- Validation as appropriate
- Approval before implementation

Core evidence to look for (minimal subset for PASS):
- Review requirements
- V&V determination process
- Approval workflow
- Implementation control

Examples of strong PASS evidence:
- Change classification criteria
- V&V matrix for changes
- Approval authority matrix
- Implementation verification

When to FLAG:
- Review vague
- V&V determination unclear
- Approval informal
- Implementation uncontrolled

When to FAIL:
- No review requirements
- No V&V for changes
- No approval
- Changes uncontrolled

Typical OFIs (can still PASS):
- Expedited change process
- Risk-based classification
- Batch/lot impact
- Effectiveness verification$req$,
 56, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-57: ISO7.3.9-03: Design Changes - Impact on Constituent Parts and Delivered Product
('20000000-0000-0000-0000-000000000057'::uuid,
 'ISO7.3.9-03',
 'Design Changes - Impact on Constituent Parts and Delivered Product',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-03 -- "Design Changes - Impact on Constituent Parts and Delivered Product".

Objective:
Determine whether change review includes evaluation of effect on constituent parts and product already delivered, including:
- Constituent part impact
- Delivered product impact
- Downstream assessment
- Field action determination

Core evidence to look for (minimal subset for PASS):
- Impact assessment required
- Constituent evaluation
- Delivered product consideration
- Field action criteria

Examples of strong PASS evidence:
- Impact assessment template
- Regulatory filing impact
- Customer notification criteria
- Recall determination

When to FLAG:
- Impact mentioned without process
- Constituent vague
- Delivered product informal
- Field action unclear

When to FAIL:
- No impact assessment
- Effects not evaluated
- Delivered product ignored
- Field action not addressed

Typical OFIs (can still PASS):
- Supply chain impact
- Clinical impact
- Post-market surveillance
- Communication plan$req$,
 57, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-58: ISO7.3.9-04: Design Changes - Change Records
('20000000-0000-0000-0000-000000000058'::uuid,
 'ISO7.3.9-04',
 'Design Changes - Change Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-04 -- "Design Changes - Change Records".

Objective:
Determine whether records of change review results and necessary actions are maintained, including:
- Review results recorded
- Actions documented
- Records complete
- Design file updated

Core evidence to look for (minimal subset for PASS):
- Result documentation
- Action documentation
- Record requirements
- File update requirements

Examples of strong PASS evidence:
- Change record template
- Action closure tracking
- Design file update checklist
- Regulatory impact documentation

When to FLAG:
- Documentation incomplete
- Actions informal
- Records vague
- File update unclear

When to FAIL:
- No change records
- Results undocumented
- Actions not tracked
- File not updated

Typical OFIs (can still PASS):
- Electronic records
- Audit trail
- Trend analysis
- Effectiveness review$req$,
 58, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-59: ISO7.3.9-05: Design Changes - Risk File Update (ISO 14971)
('20000000-0000-0000-0000-000000000059'::uuid,
 'ISO7.3.9-05',
 'Design Changes - Risk File Update (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-05 -- "Design Changes - Risk File Update (ISO 14971)".

Objective:
Determine whether risk management file update is assessed for design changes, including:
- Risk file update assessed
- New hazards identified
- Control impact evaluated
- Residual risk re-evaluated

Core evidence to look for (minimal subset for PASS):
- Risk file review required
- Hazard identification
- Control assessment
- Residual risk update

Examples of strong PASS evidence:
- Risk change impact matrix
- New hazard process
- Control re-verification
- RMR update criteria

When to FLAG:
- Risk mentioned without process
- Hazards informal
- Controls vague
- Residual risk unclear

When to FAIL:
- No risk file update
- Hazards not reassessed
- Controls not evaluated
- Risk file static

Typical OFIs (can still PASS):
- Cumulative assessment
- Risk trending
- Production risk
- Post-market integration$req$,
 59, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-60: ISO7.3.9-06: Design Changes - HF Impact Assessment (IEC 62366-1)
('20000000-0000-0000-0000-000000000060'::uuid,
 'ISO7.3.9-06',
 'Design Changes - HF Impact Assessment (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-06 -- "Design Changes - HF Impact Assessment (IEC 62366-1)".

Objective:
Determine whether human factors impact is assessed for design changes, including:
- HF impact assessed
- UI change evaluation
- Revalidation triggers
- Use error consideration

Core evidence to look for (minimal subset for PASS):
- HF assessment required
- UI change process
- Revalidation criteria
- Use error assessment

Examples of strong PASS evidence:
- HF change checklist
- Revalidation decision tree
- Formative for significant changes
- Critical task impact

When to FLAG:
- HF mentioned without process
- UI changes vague
- Revalidation unclear
- Use errors informal

When to FAIL:
- No HF assessment
- UI changes uncontrolled
- No revalidation process
- Use errors ignored

Typical OFIs (can still PASS):
- Training update triggers
- Labeling assessment
- User feedback
- Comparative evaluation$req$,
 60, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-61: ISO7.3.9-CP01: Design Changes - Combination Product: Drug-Device Interface Change Assessment
('20000000-0000-0000-0000-000000000061'::uuid,
 'ISO7.3.9-CP01',
 'Design Changes - Combination Product: Drug-Device Interface Change Assessment',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.9-CP01 -- "Design Changes - Combination Product: Drug-Device Interface Change Assessment".

Objective:
Determine whether change impact on drug product is assessed for combination products, including:
- Drug impact assessed
- Regulatory filing impact
- Drug development coordination
- CMC assessment

Core evidence to look for (minimal subset for PASS):
- Drug impact required
- Regulatory pathway impact
- Coordination requirements
- CMC linkage

Examples of strong PASS evidence:
- Drug-device change matrix
- Supplement determination
- Stability impact
- Change decision tree

When to FLAG:
- Drug impact vague
- Regulatory unclear
- Coordination informal
- CMC linkage missing

When to FAIL:
- No drug assessment
- Regulatory not addressed
- No coordination
- CMC disconnected

Typical OFIs (can still PASS):
- FDA/EMA coordination
- Comparability triggers
- Clinical bridging
- PQ impact$req$,
 61, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-62: ISO7.3.10-01: Design Files - Design and Development File Requirements
('20000000-0000-0000-0000-000000000062'::uuid,
 'ISO7.3.10-01',
 'Design Files - Design and Development File Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-01 -- "Design Files - Design and Development File Requirements".

Objective:
Determine whether a design and development file is maintained for each device type or family, including:
- File required per device type
- File establishment requirements
- File maintenance
- File completeness

Core evidence to look for (minimal subset for PASS):
- File requirement per type/family
- Establishment timing
- Maintenance process
- Completeness criteria

Examples of strong PASS evidence:
- File structure template
- Device type/family criteria
- File review process
- Completeness checklist

When to FLAG:
- File required but structure vague
- Type/family unclear
- Maintenance informal
- Completeness undefined

When to FAIL:
- No file requirements
- Device-specific files missing
- No maintenance
- No completeness

Typical OFIs (can still PASS):
- Electronic file system
- File archival
- Legacy file guidance
- Audit checklist$req$,
 62, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-63: ISO7.3.10-02: Design Files - Design Conformity Records
('20000000-0000-0000-0000-000000000063'::uuid,
 'ISO7.3.10-02',
 'Design Files - Design Conformity Records',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-02 -- "Design Files - Design Conformity Records".

Objective:
Determine whether the file includes records demonstrating conformity to design and development requirements, including:
- Conformity records included
- Design requirements demonstrated
- Traceability complete
- Records comprehensive

Core evidence to look for (minimal subset for PASS):
- Conformity records required
- Requirement demonstration
- Traceability documentation
- Record completeness

Examples of strong PASS evidence:
- Conformity evidence checklist
- Traceability matrix in file
- Regulatory requirement mapping
- Completeness verification

When to FLAG:
- Records mentioned without specifics
- Demonstration vague
- Traceability incomplete
- Completeness unclear

When to FAIL:
- No conformity records
- Requirements not demonstrated
- Traceability absent
- Records incomplete

Typical OFIs (can still PASS):
- Conformity summary
- Gap analysis documentation
- Regulatory mapping
- Audit trail$req$,
 63, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-64: ISO7.3.10-03: Design Files - Design Change Records in File
('20000000-0000-0000-0000-000000000064'::uuid,
 'ISO7.3.10-03',
 'Design Files - Design Change Records in File',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-03 -- "Design Files - Design Change Records in File".

Objective:
Determine whether the file includes records of design and development changes, including:
- Change records in file
- Change history complete
- Impact documentation
- Approval records

Core evidence to look for (minimal subset for PASS):
- Change records required
- History maintenance
- Impact documentation
- Approval inclusion

Examples of strong PASS evidence:
- Change log in file
- Complete change history
- Impact assessment records
- Approval documentation

When to FLAG:
- Changes mentioned without file requirements
- History incomplete
- Impact vague
- Approvals informal

When to FAIL:
- No change records in file
- History absent
- Impact undocumented
- Approvals missing

Typical OFIs (can still PASS):
- Change trending
- Effectiveness records
- Lessons learned
- Change metrics$req$,
 64, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-65: ISO7.3.10-04: Design Files - Risk Management File Integration (ISO 14971)
('20000000-0000-0000-0000-000000000065'::uuid,
 'ISO7.3.10-04',
 'Design Files - Risk Management File Integration (ISO 14971)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-04 -- "Design Files - Risk Management File Integration (ISO 14971)".

Objective:
Determine whether risk management file is integrated with or referenced by design file, including:
- Risk file integrated/referenced
- Content per ISO 14971
- Traceability complete
- File maintained

Core evidence to look for (minimal subset for PASS):
- Risk file requirements
- Integration specified
- Content defined
- Traceability required

Examples of strong PASS evidence:
- Risk file content checklist
- RMP, analysis, controls, RMR
- Complete traceability
- Maintenance process

When to FLAG:
- Risk file mentioned without content
- Integration unclear
- Content vague
- Traceability incomplete

When to FAIL:
- No risk file requirements
- Risk records scattered
- Content undefined
- No traceability

Typical OFIs (can still PASS):
- Risk file audit checklist
- Electronic system
- Device families
- Post-market updates$req$,
 65, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-66: ISO7.3.10-05: Design Files - Usability Engineering File Integration (IEC 62366-1)
('20000000-0000-0000-0000-000000000066'::uuid,
 'ISO7.3.10-05',
 'Design Files - Usability Engineering File Integration (IEC 62366-1)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-05 -- "Design Files - Usability Engineering File Integration (IEC 62366-1)".

Objective:
Determine whether usability engineering file is integrated with or referenced by design file, including:
- UE file integrated/referenced
- Content per IEC 62366-1
- Traceability complete
- File maintained

Core evidence to look for (minimal subset for PASS):
- UE file requirements
- Integration specified
- Content defined
- Traceability required

Examples of strong PASS evidence:
- UE file content per 4.1.1
- Use specification included
- Formative/summative records
- Risk-usability traceability

When to FLAG:
- UE file mentioned without content
- Integration unclear
- Content vague
- Traceability incomplete

When to FAIL:
- No UE file requirements
- HF records scattered
- Content undefined
- No traceability

Typical OFIs (can still PASS):
- UE file audit checklist
- Electronic system
- Device families
- International requirements$req$,
 66, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-67: ISO7.3.10-US01: Design Files - US: Design History File (21 CFR 820.30)
('20000000-0000-0000-0000-000000000067'::uuid,
 'ISO7.3.10-US01',
 'Design Files - US: Design History File (21 CFR 820.30)',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-US01 -- "Design Files - US: Design History File (21 CFR 820.30)".

Objective:
Determine whether DHF requirements per 21 CFR 820.30(j) are addressed for US market, including:
- DHF per device type
- Plan conformance demonstrated
- 820.30 conformance demonstrated
- Records complete

Core evidence to look for (minimal subset for PASS):
- DHF requirement referenced
- Plan compliance records
- Regulatory compliance
- Completeness checklist

Examples of strong PASS evidence:
- DHF index template
- 820.30 mapping
- Completeness verification
- Audit readiness

When to FLAG:
- DHF mentioned without specifics
- Plan conformance vague
- Regulatory mapping incomplete
- Completeness undefined

When to FAIL:
- No DHF requirements
- Plan not demonstrated
- Regulatory not addressed
- Records incomplete

Typical OFIs (can still PASS):
- DHF vs design file alignment
- Electronic DHF
- Legacy guidance
- QMSR transition$req$,
 67, 'process', '00000000-0000-0000-0000-000000000003'::uuid),

-- DC-68: ISO7.3.10-CP01: Design Files - Combination Product: File Requirements
('20000000-0000-0000-0000-000000000068'::uuid,
 'ISO7.3.10-CP01',
 'Design Files - Combination Product: File Requirements',
 $req$You are evaluating ISO 13485:2016 clause ISO7.3.10-CP01 -- "Design Files - Combination Product: File Requirements".

Objective:
Determine whether design file addresses combination product-specific requirements including drug CMC cross-reference, including:
- Combination product addressed
- Drug CMC cross-reference
- CGMP election documented
- Interface documentation

Core evidence to look for (minimal subset for PASS):
- Combination product requirements
- CMC reference process
- CGMP rationale
- Interface documentation

Examples of strong PASS evidence:
- Combination product checklist
- CMC methodology
- 21 CFR 4 compliance
- Integrated records

When to FLAG:
- Combination mentioned without specifics
- CMC unclear
- CGMP vague
- Interface informal

When to FAIL:
- No combination requirements
- CMC not referenced
- CGMP undocumented
- Interface missing

Typical OFIs (can still PASS):
- Co-packaged products
- Drug lot traceability
- Clinical linkage
- Regulatory correspondence$req$,
 68, 'process', '00000000-0000-0000-0000-000000000003'::uuid)

ON CONFLICT (id) DO UPDATE SET
    clause = EXCLUDED.clause,
    title = EXCLUDED.title,
    requirement_text = EXCLUDED.requirement_text,
    display_order = EXCLUDED.display_order,
    evaluation_type = EXCLUDED.evaluation_type,
    framework_id = EXCLUDED.framework_id,
    updated_at = NOW();

COMMIT;