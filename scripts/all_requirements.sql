INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-01$$, 
 $$4.4(a)$$, 
 $$RMP scope & lifecycle coverage$$, 
 $$RMP identifies the device and the life‑cycle phases for which each element applies.$$, 
 $$RMP names device and versions; matrices mapping plan elements to life‑cycle phases.$$, 
 $$Risk Management Plan (RMP) vX; lifecycle applicability table.$$, 
 $$Annex A explains why scope is critical for objectivity.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-02$$, 
 $$4.4(b)$$, 
 $$Responsibilities & authorities$$, 
 $$Assign responsibilities and authorities for all risk management activities.$$, 
 $$Named owners/approvers for each activity; RACI chart in plan.$$, 
 $$RMP section with RACI; signatures/approvals.$$, 
 $$TR24971 shows typical roles and knowledge areas.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-03$$, 
 $$4.4(c)$$, 
 $$Review of RM activities$$, 
 $$Define requirements for reviews of RM activities (e.g., design reviews, periodic RM check‑ins).$$, 
 $$Planned reviews with frequency/triggers; meeting minutes stored; issues tracked to closure.$$, 
 $$Design review minutes; RM review logs.$$, 
 $$Align reviews with design controls and PMS feedback.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-04$$, 
 $$4.4(d)$$, 
 $$Criteria for risk acceptability$$, 
 $$Define criteria for risk acceptability, including cases where probability of occurrence of harm cannot be estimated.$$, 
 $$Risk criteria table/matrix defined; rules for ‘probability unknown’ documented; applies per device scope.$$, 
 $$Risk criteria appendix in RMP; risk matrix legend.$$, 
 $$TR24971 offers qualitative/semi‑quantitative scales and cautions about matrix design & rationale.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-05$$, 
 $$4.4(e)$$, 
 $$Method for overall residual risk$$, 
 $$Define the method and criteria for evaluating overall residual risk, in relation to benefits of intended use.$$, 
 $$Documented method (e.g., aggregation + expert/clinical judgement); criteria defined; sources of benefit evidence identified.$$, 
 $$Overall Residual Risk Method section; clinical/benefit evidence list.$$, 
 $$TR24971 gives examples of methods and evidence sources.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-06$$, 
 $$4.4(f)$$, 
 $$Verification planning$$, 
 $$Plan verification of implementation and effectiveness of risk control measures.$$, 
 $$Verification strategy linked to each control; protocols defined or referenced; pass/fail criteria.$$, 
 $$Verification protocol(s); V&V plan; test reports.$$, 
 $$Annex A stresses early planning of verification resources.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-07$$, 
 $$4.4(g)$$, 
 $$P&PP information collection & review$$, 
 $$Define methods to collect and review production and post‑production information and feed back into RM.$$, 
 $$Defined sources, cadence, ownership, analysis methods, escalation routes.$$, 
 $$PMS plan; complaint handling SOP; literature search plan.$$, 
 $$TR24971 aligns with ISO 13485 §§7-8 and ISO/TR 20416 PMS guidance.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.4-08$$, 
 $$4.4(h)$$, 
 $$Plan change control$$, 
 $$Maintain a record of changes to the RMP over the device life cycle.$$, 
 $$Version history present; changes justified and approved; RMF updated.$$, 
 $$RMP revision log; change control tickets.$$, 
 $$Annex A notes change records facilitate audit and review.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-4.5-01$$, 
 $$4.5$$, 
 $$Risk Management File (RMF) & traceability$$, 
 $$Establish and maintain an RMF. Provide traceability from each identified hazard to risk analysis, risk evaluation, implementation & verification of controls, and residual risk evaluation.$$, 
 $$Traceability matrix complete for all hazards; RMF collects or points to all required records; retrievable in timely fashion.$$, 
 $$RMF index; traceability matrix/baseline; pointers into QMS repositories.$$, 
 $$TR24971 clarifies RMF is a logical construct; can point to other systems; recommends a hazard‑centric index.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.1-01$$, 
 $$5.1$$, 
 $$Conduct & record risk analysis$$, 
 $$Perform risk analysis per 5.2-5.5 and record results, including device ID, analysts/organizations, scope, and date.$$, 
 $$Analysis package includes required identifiers and dates; results trace to RMF.$$, 
 $$Risk Analysis dossier; cover sheet with meta‑data.$$, 
 $$TR24971 provides technique guidance (e.g., FMEA, FTA); reuse of similar device analyses allowed with justification.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.2-01$$, 
 $$5.2$$, 
 $$Intended use documented$$, 
 $$Document intended use considering indication, patient population, body part/tissue, user profile, use environment, and operating principle.$$, 
 $$Use specification present and consistent across DHF and labeling; stored in RMF.$$, 
 $$Use specification; user needs; intended purpose statement.$$, 
 $$TR24971 lists factors and links to usability engineering inputs.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.2-02$$, 
 $$5.2$$, 
 $$Reasonably foreseeable misuse$$, 
 $$Document reasonably foreseeable misuse; consider predictable human behaviour and use errors.$$, 
 $$Misuse scenarios identified and justified; linkage to HFE/validation or field data.$$, 
 $$Misuse log; HFE reports; post‑market signals.$$, 
 $$TR24971 explains deriving misuse via simulated/actual use and HFE.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.3-01$$, 
 $$5.3$$, 
 $$Characteristics related to safety$$, 
 $$Identify and document qualitative/quantitative characteristics that could affect safety; define limits where appropriate.$$, 
 $$Characteristics list complete with limits/tolerances; link to essential performance where applicable.$$, 
 $$Characteristics inventory; engineering specs; acceptance limits.$$, 
 $$TR24971 offers guiding questions to elicit characteristics.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.4-01$$, 
 $$5.4$$, 
 $$Hazards & hazardous situations$$, 
 $$Identify known and foreseeable hazards; for each hazard, identify sequences/combinations of events leading to hazardous situations across life‑cycle stages.$$, 
 $$Comprehensive hazard list with linked hazardous situations; life‑cycle coverage; interfaces considered.$$, 
 $$Hazard list; event trees/FTAs; interface analysis.$$, 
 $$TR24971 Annexes give examples and techniques; systematic methods recommended.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-5.5-01$$, 
 $$5.5$$, 
 $$Risk estimation per hazardous situation$$, 
 $$For each hazardous situation, estimate the associated risk(s) using available data; define severity and probability approach; handle cases where probability cannot be estimated per policy.$$, 
 $$Documented rationale, data sources, and calculation/scoring; treatment for ‘unknown probability’ aligns with RMP.$$, 
 $$Risk estimation tables; datasets; literature review logs.$$, 
 $$TR24971 provides example scales and matrices; document rationale and avoid over‑granularity.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-6-01$$, 
 $$6$$, 
 $$Risk evaluation vs criteria$$, 
 $$Compare estimated risks against criteria for acceptability; if acceptable, treat as residual risk; otherwise proceed to risk control.$$, 
 $$Evaluation outcome recorded for each hazardous situation; consistent application of criteria.$$, 
 $$Risk evaluation tables; sign‑offs.$$, 
 $$TR24971: manufacturer sets criteria in policy/RMP; examples in Annex C.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.1-01$$, 
 $$7.1$$, 
 $$Risk control option analysis (priority order)$$, 
 $$Determine risk control measures and select options in priority: (a) inherently safe design/manufacture; (b) protective measures; (c) information for safety and training.$$, 
 $$Controls chosen reflect priority order unless justified; rationale documented; relevant standards considered.$$, 
 $$Risk control option analysis log; design changes; protective features; IFU/training plans.$$, 
 $$TR24971 expands examples for each option and their effect on probability/severity.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.1-02$$, 
 $$7.1$$, 
 $$Record selected measures & impracticability$$, 
 $$Record selected measures; if further reduction is not practicable, trigger benefit‑risk analysis.$$, 
 $$Records show selected controls and any impracticability analysis with justification.$$, 
 $$RCA for impracticability; technical assessments.$$, 
 $$Align with state of the art and feasibility analysis.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.2-01$$, 
 $$7.2$$, 
 $$Implement selected measures$$, 
 $$Implement all selected risk control measures.$$, 
 $$Links from controls to design outputs/process controls; implementation evidence stored.$$, 
 $$Design outputs; process qualifications.$$, 
 $$$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.2-02$$, 
 $$7.2$$, 
 $$Verify implementation$$, 
 $$Verify implementation of each risk control measure.$$, 
 $$Objective evidence that each control exists as designed (tests/inspection).$$, 
 $$Verification protocols & reports; DHR evidence.$$, 
 $$Verification may occur in design verification or process qualification.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.2-03$$, 
 $$7.2$$, 
 $$Verify effectiveness$$, 
 $$Verify the effectiveness of risk control measures in reducing risk.$$, 
 $$Evidence that severity/probability reduction was realized; method appropriate (validation, user testing, etc.).$$, 
 $$Validation reports; user studies; performance tests.$$, 
 $$Examples include dose accuracy verification or process qualification linking to risk reduction.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.3-01$$, 
 $$7.3$$, 
 $$Residual risk evaluation (per HS)$$, 
 $$After implementing controls, evaluate residual risk for each hazardous situation against acceptability criteria; iterate if not acceptable.$$, 
 $$Residual risk recorded; next actions defined for non‑acceptable risks.$$, 
 $$Residual risk tables; decision logs.$$, 
 $$$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.4-01$$, 
 $$7.4$$, 
 $$Benefit‑risk analysis (BRA)$$, 
 $$If residual risk is not acceptable and further control is not practicable, perform BRA to determine if benefits outweigh residual risk.$$, 
 $$BRA present with data/literature; conclusion documented; if benefits do not outweigh risk, modify device or intended use.$$, 
 $$BRA report; clinical/market data; expert panel minutes.$$, 
 $$Follow TR24971 guidance for BRA execution and documentation.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.5-01$$, 
 $$7.5$$, 
 $$Risks arising from controls$$, 
 $$Review whether risk controls introduce new hazards or affect previously estimated risks; manage any new/increased risks.$$, 
 $$Assessment documented post‑implementation; new risks fed back into analysis.$$, 
 $$Change impact assessments; updated analyses.$$, 
 $$$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-7.6-01$$, 
 $$7.6$$, 
 $$Completeness of risk control$$, 
 $$Review risk control activities for completeness across all identified hazardous situations.$$, 
 $$Checklist completed; evidence that all planned controls were implemented and verified.$$, 
 $$Completeness review record; sign‑off.$$, 
 $$$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-8-01$$, 
 $$8$$, 
 $$Overall residual risk evaluation$$, 
 $$After implementing and verifying all controls, evaluate overall residual risk in relation to benefits, using method/criteria defined in RMP.$$, 
 $$Documented overall evaluation with conclusion acceptable/not; references to supporting evidence.$$, 
 $$Overall residual risk evaluation memo; clinical benefit dossier.$$, 
 $$TR24971 provides guidance on methods and disclosure of significant residual risks.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-8-02$$, 
 $$8$$, 
 $$Disclosure of significant residual risks$$, 
 $$Inform users of significant residual risks in accompanying documentation.$$, 
 $$Labeling/IFU includes residual risk disclosures; cross‑referenced in RMF.$$, 
 $$IFU, labeling change history; RMF cross‑refs.$$, 
 $$$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-9-01$$, 
 $$9$$, 
 $$Risk management review & report$$, 
 $$Prior to commercial release, review execution of the RMP to ensure plan was implemented, overall residual risk is acceptable, and P&PP methods are in place; record results as the Risk Management Report (RMR) and include in RMF; responsibility assigned in RMP.$$, 
 $$Approved RMR present; confirms criteria; identifies any conditions of release; reviewer has appropriate authority.$$, 
 $$Risk Management Report; RMP section listing responsible reviewer; approvals.$$, 
 $$TR24971 notes RMR can be updated when new information emerges.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-10.1-01$$, 
 $$10.1$$, 
 $$System for P&PP monitoring$$, 
 $$Establish, document, and maintain a system to actively collect and review safety‑relevant information during production and post‑production; consider appropriate collection and processing methods.$$, 
 $$PMS system/procedures defined; active and passive sources listed; responsibilities and tools defined.$$, 
 $$PMS Plan; complaint handling SOP; vigilance/field action procedures; data pipelines.$$, 
 $$TR24971 emphasizes the feedback loop to keep RM continuous; aligns with ISO 13485 and ISO/TR 20416.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-10.2-01$$, 
 $$10.2$$, 
 $$Information collection - sources$$, 
 $$Collect information as applicable: production/process monitoring; user and servicing feedback; supply chain inputs; publicly available information; and state of the art; also consider similar devices and other products.$$, 
 $$Evidence of routine ingestion from listed sources; periodic literature/signal review; competitor/alternative therapy monitoring.$$, 
 $$Supplier quality records; service logs; complaint database; literature review logs.$$, 
 $$TR24971 explains typical sources and the value of prior experience with similar devices.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$ISO14971-10.3-01$$, 
 $$10.3$$, 
 $$Information review & escalation$$, 
 $$Review collected information for relevance to safety (e.g., new hazards, risks no longer acceptable) and feed back into earlier RM phases with appropriate actions.$$, 
 $$Signal review minutes; triggers documented; updates to hazard analysis/RMP; CAPA as needed.$$, 
 $$Signal management SOP; safety review board minutes; RM updates.$$, 
 $$TR24971 details the continuous feedback loop and alignment with PMS.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$TR24971-AnnC-01$$, 
 $$TR §6 & Annex C$$, 
 $$Risk matrices & scales documented$$, 
 $$If using qualitative or semi‑quantitative scales/matrices, document definitions, ranges, and rationale for chosen matrix size and cut‑points.$$, 
 $$Matrix legend and definitions approved; justification for scale choice; avoid excessive levels without data support.$$, 
 $$Risk matrix appendix; probability/severity definitions.$$, 
 $$TR24971 includes example 3×3 and 5×5 matrices and warns about data needs for >5 levels.$$)
ON CONFLICT (id) DO NOTHING;INSERT INTO iso_requirements 
(id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
VALUES 
($$TR24971-Trace-01$$, 
 $$TR §4.5$$, 
 $$Traceability approach documented$$, 
 $$Document the traceability method/tool linking hazards → analysis → evaluation → controls → residual risk → overall evaluation.$$, 
 $$Traceability index is complete and stays current through changes; retrievable quickly.$$, 
 $$Traceability matrix; RMF index.$$, 
 $$TR24971 recommends a hazard‑centric index and keeping it current as devices change.$$)
ON CONFLICT (id) DO NOTHING;
    INSERT INTO iso_requirements 
    (id, clause, title, requirement_text, acceptance_criteria, expected_artifacts, guidance_notes)
    VALUES 
    ('ISO14971-4.1-01', '4.1', 'Risk management process established', 'Establish, implement, document, and maintain an ongoing risk management process covering the entire device life cycle. Include risk analysis, risk evaluation, risk control, and production & post‑production activities. Integrate with product realization as appropriate.', 'Procedure(s) exist and are controlled; scope includes life‑cycle coverage; process map/flow shows required elements; references to related QMS processes are clear.', 'Risk Management SOP; process flowchart; quality manual/QMS cross‑references.', 'TR24971 clarifies the process can be within a QMS but is not required; ensure linkage to ISO 13485 processes as relevant.'),('ISO14971-4.2-01', '4.2', 'Top management commitment', 'Provide evidence of top‑management commitment: adequate resources and assignment of competent personnel.', 'Documented management commitment (e.g., management review minutes, resourcing decisions); defined roles; training plans.', 'Management Review records; org charts; resource plans.', 'TR24971 details the emphasis on top management and periodic suitability review.'),('ISO14971-4.2-02', '4.2', 'Policy for risk acceptability', 'Define and document a policy for establishing criteria for risk acceptability, aligned with regulations, relevant standards, state of the art, and stakeholder concerns; include guidance on overall residual risk.', 'Approved policy exists; cites regulatory/standard inputs; defines principles for specific device families where needed; accessible to teams.', 'Risk Acceptability Policy document; references within RMPs.', 'TR24971 Annex C provides detailed guidance and examples for setting the policy and criteria.'),('ISO14971-4.2-03', '4.2', 'Suitability review of the process', 'Review the suitability and effectiveness of the risk management process at planned intervals; record decisions and actions.', 'Evidence of periodic reviews (inputs/outputs, action tracking); updates to procedures as needed.', 'Management Review records; CAPA/Change control tickets.', 'TR24971 lists aspects to review (procedure effectiveness, criteria adequacy, feedback loop effectiveness).'),('ISO14971-4.3-01', '4.3', 'Competence of personnel', 'Ensure persons performing risk management tasks are competent (education, training, skills, experience) and maintain objective evidence of competence.', 'Training matrix and records exist; CVs/experience captured; role‑based competency profiles defined.', 'Training records; job descriptions; competency matrices.', 'Annex A & TR24971 include example competencies by function; such records need not be inside the RMF.'),('ISO14971-4.4-01', '4.4(a)', 'RMP scope & lifecycle coverage', 'RMP identifies the device and the life‑cycle phases for which each element applies.', 'RMP names device and versions; matrices mapping plan elements to life‑cycle phases.', 'Risk Management Plan (RMP) vX; lifecycle applicability table.', 'Annex A explains why scope is critical for objectivity.'),('ISO14971-4.4-02', '4.4(b)', 'Responsibilities & authorities', 'Assign responsibilities and authorities for all risk management activities.', 'Named owners/approvers for each activity; RACI chart in plan.', 'RMP section with RACI; signatures/approvals.', 'TR24971 shows typical roles and knowledge areas.'),('ISO14971-4.4-03', '4.4(c)', 'Review of RM activities', 'Define requirements for reviews of RM activities (e.g., design reviews, periodic RM check‑ins).', 'Planned reviews with frequency/triggers; meeting minutes stored; issues tracked to closure.', 'Design review minutes; RM review logs.', 'Align reviews with design controls and PMS feedback.'),('ISO14971-4.4-04', '4.4(d)', 'Criteria for risk acceptability', 'Define criteria for risk acceptability, including cases where probability of occurrence of harm cannot be estimated.', 'Risk criteria table/matrix defined; rules for ‘probability unknown’ documented; applies per device scope.', 'Risk criteria appendix in RMP; risk matrix legend.', 'TR24971 offers qualitative/semi‑quantitative scales and cautions about matrix design & rationale.'),('ISO14971-4.4-05', '4.4(e)', 'Method for overall residual risk', 'Define the method and criteria for evaluating overall residual risk, in relation to benefits of intended use.', 'Documented method (e.g., aggregation + expert/clinical judgement); criteria defined; sources of benefit evidence identified.', 'Overall Residual Risk Method section; clinical/benefit evidence list.', 'TR24971 gives examples of methods and evidence sources.'),('ISO14971-4.4-06', '4.4(f)', 'Verification planning', 'Plan verification of implementation and effectiveness of risk control measures.', 'Verification strategy linked to each control; protocols defined or referenced; pass/fail criteria.', 'Verification protocol(s); V&V plan; test reports.', 'Annex A stresses early planning of verification resources.'),('ISO14971-4.4-07', '4.4(g)', 'P&PP information collection & review', 'Define methods to collect and review production and post‑production information and feed back into RM.', 'Defined sources, cadence, ownership, analysis methods, escalation routes.', 'PMS plan; complaint handling SOP; literature search plan.', 'TR24971 aligns with ISO 13485 §§7–8 and ISO/TR 20416 PMS guidance.'),('ISO14971-4.4-08', '4.4(h)', 'Plan change control', 'Maintain a record of changes to the RMP over the device life cycle.', 'Version history present; changes justified and approved; RMF updated.', 'RMP revision log; change control tickets.', 'Annex A notes change records facilitate audit and review.'),('ISO14971-4.5-01', '4.5', 'Risk Management File (RMF) & traceability', 'Establish and maintain an RMF. Provide traceability from each identified hazard to risk analysis, risk evaluation, implementation & verification of controls, and residual risk evaluation.', 'Traceability matrix complete for all hazards; RMF collects or points to all required records; retrievable in timely fashion.', 'RMF index; traceability matrix/baseline; pointers into QMS repositories.', 'TR24971 clarifies RMF is a logical construct; can point to other systems; recommends a hazard‑centric index.'),('ISO14971-5.1-01', '5.1', 'Conduct & record risk analysis', 'Perform risk analysis per 5.2–5.5 and record results, including device ID, analysts/organizations, scope, and date.', 'Analysis package includes required identifiers and dates; results trace to RMF.', 'Risk Analysis dossier; cover sheet with meta‑data.', 'TR24971 provides technique guidance (e.g., FMEA, FTA); reuse of similar device analyses allowed with justification.'),('ISO14971-5.2-01', '5.2', 'Intended use documented', 'Document intended use considering indication, patient population, body part/tissue, user profile, use environment, and operating principle.', 'Use specification present and consistent across DHF and labeling; stored in RMF.', 'Use specification; user needs; intended purpose statement.', 'TR24971 lists factors and links to usability engineering inputs.'),('ISO14971-5.2-02', '5.2', 'Reasonably foreseeable misuse', 'Document reasonably foreseeable misuse; consider predictable human behaviour and use errors.', 'Misuse scenarios identified and justified; linkage to HFE/validation or field data.', 'Misuse log; HFE reports; post‑market signals.', 'TR24971 explains deriving misuse via simulated/actual use and HFE.'),('ISO14971-5.3-01', '5.3', 'Characteristics related to safety', 'Identify and document qualitative/quantitative characteristics that could affect safety; define limits where appropriate.', 'Characteristics list complete with limits/tolerances; link to essential performance where applicable.', 'Characteristics inventory; engineering specs; acceptance limits.', 'TR24971 offers guiding questions to elicit characteristics.'),('ISO14971-5.4-01', '5.4', 'Hazards & hazardous situations', 'Identify known and foreseeable hazards; for each hazard, identify sequences/combinations of events leading to hazardous situations across life‑cycle stages.', 'Comprehensive hazard list with linked hazardous situations; life‑cycle coverage; interfaces considered.', 'Hazard list; event trees/FTAs; interface analysis.', 'TR24971 Annexes give examples and techniques; systematic methods recommended.'),('ISO14971-5.5-01', '5.5', 'Risk estimation per hazardous situation', 'For each hazardous situation, estimate the associated risk(s) using available data; define severity and probability approach; handle cases where probability cannot be estimated per policy.', 'Documented rationale, data sources, and calculation/scoring; treatment for ‘unknown probability’ aligns with RMP.', 'Risk estimation tables; datasets; literature review logs.', 'TR24971 provides example scales and matrices; document rationale and avoid over‑granularity.'),('ISO14971-6-01', '6', 'Risk evaluation vs criteria', 'Compare estimated risks against criteria for acceptability; if acceptable, treat as residual risk; otherwise proceed to risk control.', 'Evaluation outcome recorded for each hazardous situation; consistent application of criteria.', 'Risk evaluation tables; sign‑offs.', 'TR24971: manufacturer sets criteria in policy/RMP; examples in Annex C.'),('ISO14971-7.1-01', '7.1', 'Risk control option analysis (priority order)', 'Determine risk control measures and select options in priority: (a) inherently safe design/manufacture; (b) protective measures; (c) information for safety and training.', 'Controls chosen reflect priority order unless justified; rationale documented; relevant standards considered.', 'Risk control option analysis log; design changes; protective features; IFU/training plans.', 'TR24971 expands examples for each option and their effect on probability/severity.'),('ISO14971-7.1-02', '7.1', 'Record selected measures & impracticability', 'Record selected measures; if further reduction is not practicable, trigger benefit‑risk analysis.', 'Records show selected controls and any impracticability analysis with justification.', 'RCA for impracticability; technical assessments.', 'Align with state of the art and feasibility analysis.'),('ISO14971-7.2-01', '7.2', 'Implement selected measures', 'Implement all selected risk control measures.', 'Links from controls to design outputs/process controls; implementation evidence stored.', 'Design outputs; process qualifications.', '—'),('ISO14971-7.2-02', '7.2', 'Verify implementation', 'Verify implementation of each risk control measure.', 'Objective evidence that each control exists as designed (tests/inspection).', 'Verification protocols & reports; DHR evidence.', 'Verification may occur in design verification or process qualification.'),('ISO14971-7.2-03', '7.2', 'Verify effectiveness', 'Verify the effectiveness of risk control measures in reducing risk.', 'Evidence that severity/probability reduction was realized; method appropriate (validation, user testing, etc.).', 'Validation reports; user studies; performance tests.', 'Examples include dose accuracy verification or process qualification linking to risk reduction.'),('ISO14971-7.3-01', '7.3', 'Residual risk evaluation (per HS)', 'After implementing controls, evaluate residual risk for each hazardous situation against acceptability criteria; iterate if not acceptable.', 'Residual risk recorded; next actions defined for non‑acceptable risks.', 'Residual risk tables; decision logs.', '—'),('ISO14971-7.4-01', '7.4', 'Benefit‑risk analysis (BRA)', 'If residual risk is not acceptable and further control is not practicable, perform BRA to determine if benefits outweigh residual risk.', 'BRA present with data/literature; conclusion documented; if benefits do not outweigh risk, modify device or intended use.', 'BRA report; clinical/market data; expert panel minutes.', 'Follow TR24971 guidance for BRA execution and documentation.'),('ISO14971-7.5-01', '7.5', 'Risks arising from controls', 'Review whether risk controls introduce new hazards or affect previously estimated risks; manage any new/increased risks.', 'Assessment documented post‑implementation; new risks fed back into analysis.', 'Change impact assessments; updated analyses.', '—'),('ISO14971-7.6-01', '7.6', 'Completeness of risk control', 'Review risk control activities for completeness across all identified hazardous situations.', 'Checklist completed; evidence that all planned controls were implemented and verified.', 'Completeness review record; sign‑off.', '—'),('ISO14971-8-01', '8', 'Overall residual risk evaluation', 'After implementing and verifying all controls, evaluate overall residual risk in relation to benefits, using method/criteria defined in RMP.', 'Documented overall evaluation with conclusion acceptable/not; references to supporting evidence.', 'Overall residual risk evaluation memo; clinical benefit dossier.', 'TR24971 provides guidance on methods and disclosure of significant residual risks.'),('ISO14971-8-02', '8', 'Disclosure of significant residual risks', 'Inform users of significant residual risks in accompanying documentation.', 'Labeling/IFU includes residual risk disclosures; cross‑referenced in RMF.', 'IFU, labeling change history; RMF cross‑refs.', '—'),('ISO14971-9-01', '9', 'Risk management review & report', 'Prior to commercial release, review execution of the RMP to ensure plan was implemented, overall residual risk is acceptable, and P&PP methods are in place; record results as the Risk Management Report (RMR) and include in RMF; responsibility assigned in RMP.', 'Approved RMR present; confirms criteria; identifies any conditions of release; reviewer has appropriate authority.', 'Risk Management Report; RMP section listing responsible reviewer; approvals.', 'TR24971 notes RMR can be updated when new information emerges.'),('ISO14971-10.1-01', '10.1', 'System for P&PP monitoring', 'Establish, document, and maintain a system to actively collect and review safety‑relevant information during production and post‑production; consider appropriate collection and processing methods.', 'PMS system/procedures defined; active and passive sources listed; responsibilities and tools defined.', 'PMS Plan; complaint handling SOP; vigilance/field action procedures; data pipelines.', 'TR24971 emphasizes the feedback loop to keep RM continuous; aligns with ISO 13485 and ISO/TR 20416.'),('ISO14971-10.2-01', '10.2', 'Information collection — sources', 'Collect information as applicable: production/process monitoring; user and servicing feedback; supply chain inputs; publicly available information; and state of the art; also consider similar devices and other products.', 'Evidence of routine ingestion from listed sources; periodic literature/signal review; competitor/alternative therapy monitoring.', 'Supplier quality records; service logs; complaint database; literature review logs.', 'TR24971 explains typical sources and the value of prior experience with similar devices.'),('ISO14971-10.3-01', '10.3', 'Information review & escalation', 'Review collected information for relevance to safety (e.g., new hazards, risks no longer acceptable) and feed back into earlier RM phases with appropriate actions.', 'Signal review minutes; triggers documented; updates to hazard analysis/RMP; CAPA as needed.', 'Signal management SOP; safety review board minutes; RM updates.', 'TR24971 details the continuous feedback loop and alignment with PMS.'),('TR24971-AnnC-01', 'TR §6 & Annex C', 'Risk matrices & scales documented', 'If using qualitative or semi‑quantitative scales/matrices, document definitions, ranges, and rationale for chosen matrix size and cut‑points.', 'Matrix legend and definitions approved; justification for scale choice; avoid excessive levels without data support.', 'Risk matrix appendix; probability/severity definitions.', 'TR24971 includes example 3×3 and 5×5 matrices and warns about data needs for >5 levels.'),('TR24971-Trace-01', 'TR §4.5', 'Traceability approach documented', 'Document the traceability method/tool linking hazards → analysis → evaluation → controls → residual risk → overall evaluation.', 'Traceability index is complete and stays current through changes; retrievable quickly.', 'Traceability matrix; RMF index.', 'TR24971 recommends a hazard‑centric index and keeping it current as devices change.')
    ON CONFLICT (id) DO UPDATE SET
        clause = EXCLUDED.clause,
        title = EXCLUDED.title,
        requirement_text = EXCLUDED.requirement_text,
        acceptance_criteria = EXCLUDED.acceptance_criteria,
        expected_artifacts = EXCLUDED.expected_artifacts,
        guidance_notes = EXCLUDED.guidance_notes,
        updated_at = NOW();
    