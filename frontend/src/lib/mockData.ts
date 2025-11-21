import type { RequirementEvaluation, DocumentEvaluation, UploadedFile } from "./types"

export const mockRequirements: RequirementEvaluation[] = [
  {
    id: "ISO14971-4.1-01",
    clause: "4.1",
    display_order: 1,
    title: "Risk management process established",
    evaluation_type: "Automated",
    status: "PASS",
    confidence_level: "high",
    confidence_score: 0.92,
    evidence_snippets: [
      "Risk Management Standard Operating Procedure (RMP-SOP-001) documented and approved",
      "Process flowchart shows comprehensive lifecycle coverage from concept to post-market"
    ],
    gaps: [],
    recommendations: [],
    evaluation_rationale: "Procedure covers analysis, evaluation, control, and monitoring with clear owners."
  },
  {
    id: "ISO14971-4.2-01",
    clause: "4.2",
    display_order: 2,
    title: "Top management commitment",
    evaluation_type: "Hybrid",
    status: "PARTIAL",
    confidence_level: "medium",
    confidence_score: 0.68,
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
    ],
    evaluation_rationale: "Roles are defined but evidence of resourcing and training is incomplete."
  },
  {
    id: "ISO14971-4.2-02",
    clause: "4.2",
    display_order: 3,
    title: "Policy for risk acceptability",
    evaluation_type: "Automated",
    status: "PASS",
    confidence_level: "high",
    confidence_score: 0.88,
    evidence_snippets: [
      "Risk Acceptability Policy (RAP-POL-001) approved by CEO on 2024-01-15",
      "Policy references FDA guidance and EU MDR requirements"
    ],
    gaps: [],
    recommendations: [],
    evaluation_rationale: "Approved policy covers standards, state of the art, and device-family principles."
  },
  {
    id: "ISO14971-4.3-01",
    clause: "4.3",
    display_order: 4,
    title: "Competence of personnel",
    evaluation_type: "Manual",
    status: "FAIL",
    confidence_level: "low",
    confidence_score: 0.45,
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
    ],
    evaluation_rationale: "Training evidence is incomplete and competency expectations are not documented."
  },
  {
    id: "ISO14971-5.1-01",
    clause: "5.1",
    display_order: 5,
    title: "Risk analysis planning",
    evaluation_type: "Automated",
    status: "PASS",
    confidence_level: "high",
    confidence_score: 0.91,
    evidence_snippets: [
      "Risk Analysis Plan (RAP-001) version 2.0 approved",
      "FMEA and FTA methods documented",
      "Cross-functional team roster defined"
    ],
    gaps: [],
    recommendations: [],
    evaluation_rationale: "Plan defines scope, methods, and team with approved version control."
  },
  {
    id: "ISO14971-5.2-01",
    clause: "5.2",
    display_order: 6,
    title: "Intended use and foreseeable misuse",
    evaluation_type: "Automated",
    status: "PASS",
    confidence_level: "high",
    confidence_score: 0.85,
    evidence_snippets: [
      "Intended Use Specification (IUS-001) comprehensive",
      "Use error analysis includes 15 foreseeable misuse scenarios"
    ],
    gaps: [],
    recommendations: [],
    evaluation_rationale: "Intended use and misuse scenarios are documented with supporting analysis."
  },
  {
    id: "ISO14971-6.1-01",
    clause: "6.1",
    display_order: 7,
    title: "Risk evaluation",
    evaluation_type: "Manual",
    status: "NOT_APPLICABLE",
    confidence_level: "high",
    confidence_score: 0.95,
    evidence_snippets: [
      "Product is in early design phase - risk evaluation scheduled for Q2 2025"
    ],
    gaps: [],
    recommendations: [],
    evaluation_rationale: "Evaluation deferred until later lifecycle phase; tracked in plan."
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
