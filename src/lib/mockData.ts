import type { RequirementEvaluation, DocumentEvaluation, UploadedFile } from "./types"

export const mockRequirements: RequirementEvaluation[] = [
  {
    id: "ISO14971-4.1-01",
    clause: "4.1",
    title: "Risk management process established",
    requirement_text: "Establish, implement, document, and maintain an ongoing risk management process covering the entire device life cycle.",
    acceptance_criteria: "Procedure(s) exist and are controlled; scope includes life-cycle coverage; process map/flow shows required elements.",
    expected_artifacts: "Risk Management SOP; process flowchart; quality manual/QMS cross-references.",
    status: "PASS",
    confidence: 0.92,
    evidence_snippets: [
      "Risk Management Standard Operating Procedure (RMP-SOP-001) documented and approved",
      "Process flowchart shows comprehensive lifecycle coverage from concept to post-market"
    ],
    gaps: [],
    recommendations: []
  },
  {
    id: "ISO14971-4.2-01",
    clause: "4.2",
    title: "Top management commitment",
    requirement_text: "Provide evidence of top-management commitment: adequate resources and assignment of competent personnel.",
    acceptance_criteria: "Documented management commitment (e.g., management review minutes, resourcing decisions); defined roles; training plans.",
    expected_artifacts: "Management Review records; org charts; resource plans.",
    status: "PARTIAL",
    confidence: 0.68,
    evidence_snippets: [
      "Management review minutes from Q3 2024 show resource allocation discussions"
    ],
    gaps: [
      "Missing formal resource allocation plan",
      "Training plans not fully documented"
    ],
    recommendations: [
      "Create formal resource allocation document",
      "Complete and approve training plans for risk management team"
    ]
  },
  {
    id: "ISO14971-4.2-02",
    clause: "4.2",
    title: "Policy for risk acceptability",
    requirement_text: "Define and document a policy for establishing criteria for risk acceptability.",
    acceptance_criteria: "Approved policy exists; cites regulatory/standard inputs; defines principles for specific device families.",
    expected_artifacts: "Risk Acceptability Policy document; references within RMPs.",
    status: "PASS",
    confidence: 0.88,
    evidence_snippets: [
      "Risk Acceptability Policy (RAP-POL-001) approved by CEO on 2024-01-15",
      "Policy references FDA guidance and EU MDR requirements"
    ],
    gaps: [],
    recommendations: []
  },
  {
    id: "ISO14971-4.3-01",
    clause: "4.3",
    title: "Competence of personnel",
    requirement_text: "Ensure persons performing risk management tasks are competent.",
    acceptance_criteria: "Training matrix and records exist; CVs/experience captured; role-based competency profiles defined.",
    expected_artifacts: "Training records; job descriptions; competency matrices.",
    status: "FAIL",
    confidence: 0.45,
    evidence_snippets: [
      "Some training records found in HR system"
    ],
    gaps: [
      "No formal competency matrix exists",
      "Role-based competency profiles not defined",
      "Training records incomplete for 3 team members"
    ],
    recommendations: [
      "Develop comprehensive competency matrix",
      "Define role-based competency profiles",
      "Complete training documentation for all team members"
    ]
  },
  {
    id: "ISO14971-5.1-01",
    clause: "5.1",
    title: "Risk analysis planning",
    requirement_text: "Plan risk analysis activities including scope, identification methods, and acceptance criteria.",
    acceptance_criteria: "Risk analysis plan documented; methods defined; team assigned.",
    expected_artifacts: "Risk Analysis Plan; team assignments.",
    status: "PASS",
    confidence: 0.91,
    evidence_snippets: [
      "Risk Analysis Plan (RAP-001) version 2.0 approved",
      "FMEA and FTA methods documented",
      "Cross-functional team roster defined"
    ],
    gaps: [],
    recommendations: []
  },
  {
    id: "ISO14971-5.2-01",
    clause: "5.2",
    title: "Intended use and foreseeable misuse",
    requirement_text: "Document intended use, intended users, and reasonably foreseeable misuse.",
    acceptance_criteria: "Clear documentation of use scenarios, user populations, and misuse cases.",
    expected_artifacts: "Intended Use specification; Use Error Analysis.",
    status: "PASS",
    confidence: 0.85,
    evidence_snippets: [
      "Intended Use Specification (IUS-001) comprehensive",
      "Use error analysis includes 15 foreseeable misuse scenarios"
    ],
    gaps: [],
    recommendations: []
  },
  {
    id: "ISO14971-6.1-01",
    clause: "6.1",
    title: "Risk evaluation",
    requirement_text: "Evaluate risks using defined acceptability criteria.",
    acceptance_criteria: "Risk evaluation matrix applied; decisions documented.",
    expected_artifacts: "Risk evaluation records; risk matrices.",
    status: "NOT_APPLICABLE",
    confidence: 0.95,
    evidence_snippets: [
      "Product is in early design phase - risk evaluation scheduled for Q2 2025"
    ],
    gaps: [],
    recommendations: []
  }
]

export const mockDocumentEvaluation: DocumentEvaluation = {
  id: "eval-001",
  document_name: "Risk_Management_Plan_v2.0.pdf",
  document_type: "Risk Management Plan",
  status: "completed",
  overall_compliance_score: 71.4,
  requirements_passed: 4,
  requirements_failed: 1,
  requirements_partial: 1,
  requirements_na: 1,
  started_at: "2024-11-09T10:30:00Z",
  completed_at: "2024-11-09T10:35:00Z",
  evaluations: mockRequirements
}

export const mockUploadedFiles: UploadedFile[] = [
  {
    id: "file-001",
    name: "Risk_Management_Plan_v2.0.pdf",
    size: 2458624,
    type: "application/pdf",
    uploadedAt: new Date("2024-11-09T10:25:00Z"),
    status: "indexed",
    progress: 100
  },
  {
    id: "file-002",
    name: "Clinical_Evaluation_Report.pdf",
    size: 5242880,
    type: "application/pdf",
    uploadedAt: new Date("2024-11-09T09:15:00Z"),
    status: "processing",
    progress: 65
  },
  {
    id: "file-003",
    name: "Design_Control_Documentation.docx",
    size: 1048576,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    uploadedAt: new Date("2024-11-08T14:30:00Z"),
    status: "error",
    error: "File format not supported for automatic processing"
  }
]

export const mockActiveEvaluations: DocumentEvaluation[] = [
  {
    id: "eval-002",
    document_name: "Clinical_Evaluation_Report.pdf",
    document_type: "Clinical Evaluation",
    status: "in_progress",
    overall_compliance_score: 0,
    requirements_passed: 45,
    requirements_failed: 12,
    requirements_partial: 18,
    requirements_na: 45,
    started_at: "2024-11-09T11:00:00Z",
    evaluations: []
  },
  {
    id: "eval-003",
    document_name: "Post_Market_Surveillance_Plan.pdf",
    document_type: "PMS Plan",
    status: "pending",
    overall_compliance_score: 0,
    requirements_passed: 0,
    requirements_failed: 0,
    requirements_partial: 0,
    requirements_na: 0,
    started_at: "2024-11-09T11:05:00Z",
    evaluations: []
  }
]