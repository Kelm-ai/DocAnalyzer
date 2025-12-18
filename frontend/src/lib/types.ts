export interface ISORequirement {
  id: string;
  clause: string;
  title: string;
  requirement_text?: string | null;
  display_order: number;
  evaluation_type?: string;
  framework_id?: string | null;
}

export interface RequirementEvaluation extends ISORequirement {
  status?: 'PASS' | 'FAIL' | 'FLAGGED' | 'PARTIAL' | 'NOT_APPLICABLE' | 'PENDING' | 'ERROR';
  confidence_level?: 'low' | 'medium' | 'high';
  confidence_score?: number;
  evidence_snippets?: string[];
  gaps?: string[];
  recommendations?: string[];
  evaluation_rationale?: string;
  evaluated_at?: string;
}

export interface DocumentEvaluation {
  id: string;
  document_name: string;
  document_type?: string;
  framework_id?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
  overall_compliance_score: number;
  requirements_passed: number;
  requirements_failed: number;
  requirements_flagged?: number;
  requirements_partial?: number;
  requirements_na: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  evaluations: RequirementEvaluation[];
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  status: 'pending' | 'uploading' | 'processing' | 'indexed' | 'error';
  progress?: number;
  error?: string;
}

export interface ComplianceReport {
  document_evaluation_id: string;
  report_type: 'summary' | 'full' | 'executive';
  summary_stats: {
    total_evaluated: number;
    passed: number;
    failed: number;
    flagged: number;
    partial?: number;
    not_applicable: number;
  };
  high_risk_findings: string[];
  key_gaps: string[];
  recommendations: {
    immediate: string[];
    short_term: string[];
    long_term: string[];
  };
  by_clause: Record<string, {
    pass: number;
    fail: number;
    flagged: number;
    partial?: number;
  }>;
  generated_at: string;
}
