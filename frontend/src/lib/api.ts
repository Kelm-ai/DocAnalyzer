/**
 * API client for Document Compliance Evaluation Pipeline
 */
import type { ISORequirement } from "./types"

// Framework types for multi-framework support
export interface Framework {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  standard_reference?: string | null;
  system_prompt: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  requirements_count?: number;
}

export interface FrameworkCreatePayload {
  name: string;
  slug: string;
  description?: string | null;
  standard_reference?: string | null;
  system_prompt: string;
  is_active?: boolean;
  display_order?: number;
}

export interface FrameworkUpdatePayload {
  name?: string;
  slug?: string;
  description?: string | null;
  standard_reference?: string | null;
  system_prompt?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface EvaluationStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
  document_name: string;
  framework_id?: string;
  progress?: number;
  created_at: string;
  completed_at?: string;
  overall_compliance_score?: number;
  requirements_passed?: number;
  requirements_failed?: number;
  requirements_flagged?: number;
  requirements_partial?: number;
  requirements_na?: number;
  error_message?: string;
  total_requirements?: number;
  // Multi-document support fields
  supporting_docs_count?: number;
  summaries_status?: 'pending' | 'generating' | 'completed' | 'failed' | 'not_required';
  summaries_completed?: number;
  summaries_total?: number;
  metadata?: {
    phase?: string;
    progress_percent?: number;
    completed_requirements?: number;
    total_requirements?: number;
    status_message?: string;
    estimated_seconds_remaining?: number;
    last_updated?: string;
  };
}

// Multi-document upload types
export interface MultiDocumentUploadResponse {
  evaluation_id: string;
  primary_document: string;
  supporting_documents: string[];
  supporting_docs_count: number;
  status: string;
  summaries_status: string;
  message: string;
}

export interface EvaluationDocument {
  id: string;
  evaluation_id: string;
  document_role: 'primary' | 'supporting';
  file_name: string;
  file_size_bytes?: number;
  storage_path: string;
  summary_text?: string;
  summary_generated_at?: string;
  display_order: number;
  created_at: string;
  storage_deleted_at?: string | null;
}

export interface RequirementResult {
  requirement_id: string;
  requirement_clause?: string | null;
  title: string;
  status: 'PASS' | 'FAIL' | 'FLAGGED' | 'PARTIAL' | 'NOT_APPLICABLE' | 'ERROR';
  confidence_level: 'low' | 'medium' | 'high';
  confidence_score?: number | null;
  evidence_snippets: string[];
  structured_evidence?: RequirementStructuredEvidenceItem[];
  evaluation_rationale: string;
  gaps_identified: string[];
  recommendations: string[];
   agreement_status?: 'agreement' | 'conflict' | 'unknown' | 'single_provider';
  tokens_used?: number;
  evaluation_duration_ms?: number;
  search_results?: Record<string, unknown>[];
  created_at?: string;
}

export interface RequirementStructuredEvidenceItem {
  page_number?: number | null;
  section_title?: string | null;
  quote: string;
  supports: string;
  document_name?: string | null;
}

export interface RequirementFeedbackRecord {
  evaluation_id: string;
  requirement_id: string;
  is_helpful: boolean | null;
  comment: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExecutiveSummaryItem {
  clause: string;
  title: string;
  finding: string;
  recommendation: string;
}

export interface ExecutiveSummary {
  overview: string;
  critical_gaps: ExecutiveSummaryItem[];
  opportunities_for_improvement: ExecutiveSummaryItem[];
  generated_at: string;
}

export interface RequirementPresentationCitation {
  label: string;
  location: string;
  excerpt: string;
  provider?: string | null;
  file_id?: string | null;
  page_number?: number | null;
  section_title?: string | null;
  document_name?: string | null;
  supports?: string | null;
  evidence_id?: string | null;
  evidence_type?: 'direct_quote' | 'cross_reference' | 'visual_or_table' | null;
}

export interface RequirementPresentationTextBlock {
  id?: string | null;
  text: string;
  citations?: RequirementPresentationCitation[] | null;
}

export interface RequirementPresentationEvidenceItem {
  label: 'Document evidence' | 'Observed limitation' | 'Needs verification';
  text: string;
  citations: RequirementPresentationCitation[];
}

export interface RequirementPresentationEvidenceGroup {
  claim_id: string;
  label: 'Document evidence' | 'Observed limitation' | 'Needs verification';
  text: string;
  citations: RequirementPresentationCitation[];
}

export interface RequirementPresentationClaim {
  text: string;
  kind: 'assessment' | 'supporting' | 'gap' | 'verification' | 'ofi';
  citations: RequirementPresentationCitation[];
}

export interface RequirementPresentationAnalysisBlock {
  label: string;
  body: string;
  citations: RequirementPresentationCitation[];
}

export interface RequirementPresentationSummary {
  status: 'PASS' | 'FAIL' | 'FLAGGED' | 'PARTIAL' | 'NOT_APPLICABLE' | 'ERROR';
  confidence_level: 'low' | 'medium' | 'high';
  inline_finding?: RequirementPresentationTextBlock | null;
  inline_evidence?: RequirementPresentationTextBlock | null;
  inline_caveat?: RequirementPresentationTextBlock | null;
  modal_summary?: string | null;
  modal_evidence?: RequirementPresentationEvidenceItem[] | null;
  evidence_groups?: RequirementPresentationEvidenceGroup[] | null;
  inline_claims?: RequirementPresentationClaim[] | null;
  modal_claims?: RequirementPresentationClaim[] | null;
  full_analysis?: RequirementPresentationAnalysisBlock[] | null;
  generated_at?: string;
  presentation_version?: string;
}

export interface ComplianceReport {
  evaluation_id: string;
  document_name: string;
  overall_score: number;
  summary_stats: {
    total_evaluated: number;
    passed: number;
    failed: number;
    flagged: number;
    partial?: number;
    not_applicable: number;
    agreement_by_requirement?: Record<string, 'agreement' | 'conflict' | 'unknown' | 'single_provider'>;
  };
  requirements: RequirementResult[];
  high_risk_findings: string[];
  key_gaps: string[];
  executive_summary?: ExecutiveSummary;
  requirement_presentations?: Record<string, RequirementPresentationSummary>;
}

export interface RequirementCreatePayload {
  clause: string
  title: string
  requirement_text?: string | null
  display_order?: number
  evaluation_type?: string
  framework_id: string  // Required for new requirements
}

const API_BASE_URL = (() => {
  const envBaseUrl =
    (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL)?.replace(/\/$/, '');

  if (envBaseUrl && envBaseUrl.length > 0) {
    return envBaseUrl;
  }

  if (typeof window !== 'undefined') {
    // If we're running the Vite dev server on 5173, default the API to the typical backend port.
    if (window.location.port === '5173') {
      return 'http://localhost:5001/api';
    }
    const origin = window.location.origin.replace(/\/$/, '');
    return `${origin}/api`;
  }

  return '/api';
})();

class APIError extends Error {
  public status?: number;
  public details?: unknown;
  
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const isJsonLike = contentType.includes('application/json') || contentType.includes('+json');

  let parsed: any = null;
  if (rawBody && isJsonLike) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // leave parsed as null and fall back to error handling below
    }
  }

  if (!response.ok) {
    // Treat cache-related empties as success with no body
    if (response.status === 304 || response.status === 204) {
      return undefined as T;
    }

    const detail = parsed && (parsed.detail || parsed.message);
    const fallback = rawBody ? rawBody.slice(0, 200) : '';
    const errorMessage = detail || fallback || `HTTP ${response.status}: ${response.statusText}`;
    throw new APIError(errorMessage, response.status, parsed ?? rawBody);
  }

  if (parsed !== null) {
    return parsed as T;
  }

  // Allow empty bodies (e.g., 204 No Content)
  if (!rawBody) {
    return undefined as T;
  }

  throw new APIError('Unexpected non-JSON response from server', response.status, rawBody);
}

export const api = {
  // ============================================================================
  // Framework Methods
  // ============================================================================

  /**
   * Get all evaluation frameworks
   */
  async getFrameworks(activeOnly: boolean = false): Promise<Framework[]> {
    const url = new URL(`${API_BASE_URL}/frameworks`);
    if (activeOnly) {
      url.searchParams.set('active_only', 'true');
    }
    const response = await fetch(url.toString(), { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Get a single framework by ID
   */
  async getFramework(frameworkId: string): Promise<Framework> {
    const response = await fetch(`${API_BASE_URL}/frameworks/${frameworkId}`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Create a new framework
   */
  async createFramework(payload: FrameworkCreatePayload): Promise<Framework> {
    const response = await fetch(`${API_BASE_URL}/frameworks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  /**
   * Update an existing framework
   */
  async updateFramework(frameworkId: string, payload: FrameworkUpdatePayload): Promise<Framework> {
    const response = await fetch(`${API_BASE_URL}/frameworks/${frameworkId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  /**
   * Delete a framework
   */
  async deleteFramework(frameworkId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/frameworks/${frameworkId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorBody = await response.text();
      let message = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const data = JSON.parse(errorBody);
        message = data.detail || message;
      } catch {
        // fall back to default message
      }
      throw new APIError(message, response.status);
    }
  },

  // ============================================================================
  // Document Upload
  // ============================================================================

  /**
   * Upload a document for evaluation
   */
  async uploadDocument(file: File, frameworkId: string): Promise<{
    evaluation_id: string;
    filename: string;
    status: string;
    queue_position: number;
    message: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    // framework_id is passed as a query parameter
    const url = new URL(`${API_BASE_URL}/upload`);
    url.searchParams.set('framework_id', frameworkId);

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
    });

    return handleResponse(response);
  },

  /**
   * Upload a document with real upload progress tracking via XHR
   */
  uploadDocumentWithProgress(
    file: File,
    frameworkId: string,
    onProgress?: (percent: number) => void
  ): Promise<{
    evaluation_id: string;
    filename: string;
    status: string;
    queue_position: number;
    message: string;
  }> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const url = new URL(`${API_BASE_URL}/upload`);
      url.searchParams.set('framework_id', frameworkId);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url.toString());

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new APIError(
              data.detail || data.message || `HTTP ${xhr.status}`,
              xhr.status,
            ));
          }
        } catch {
          reject(new APIError(`HTTP ${xhr.status}: ${xhr.statusText}`, xhr.status));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new APIError('Network error during upload'));
      });

      xhr.send(formData);
    });
  },

  /**
   * Upload multiple documents for evaluation (primary + supporting)
   */
  async uploadDocumentsMulti(
    primaryFile: File,
    supportingFiles: File[],
    frameworkId: string
  ): Promise<MultiDocumentUploadResponse> {
    const formData = new FormData();

    // Add primary file first
    formData.append('files', primaryFile);

    // Add supporting files
    for (const file of supportingFiles) {
      formData.append('files', file);
    }

    // Build roles array
    const roles = [
      { role: 'primary' },
      ...supportingFiles.map((_, i) => ({ role: 'supporting', display_order: i + 1 }))
    ];

    const url = new URL(`${API_BASE_URL}/upload-multi`);
    url.searchParams.set('framework_id', frameworkId);
    url.searchParams.set('roles', JSON.stringify(roles));

    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
    });

    return handleResponse(response);
  },

  /**
   * Get documents for an evaluation
   */
  async getEvaluationDocuments(evaluationId: string): Promise<EvaluationDocument[]> {
    const response = await fetch(
      `${API_BASE_URL}/evaluations/${evaluationId}/documents`,
      { cache: "no-store" }
    );
    return handleResponse(response);
  },

  getEvaluationDocumentContentUrl(
    evaluationId: string,
    documentId: string,
    options?: { page?: number | null; search?: string | null; highlightText?: string | null }
  ): string {
    const url = new URL(`${API_BASE_URL}/evaluations/${evaluationId}/documents/${documentId}/content`, window.location.origin);
    const fragments: string[] = [];
    const normalizedPage =
      options?.page && Number.isFinite(options.page) && options.page > 0
        ? Math.floor(options.page)
        : null;

    if (normalizedPage) {
      fragments.push(`page=${normalizedPage}`);
      url.searchParams.set("page", String(normalizedPage));
    }

    if (options?.highlightText && options.highlightText.trim().length > 0) {
      const normalizedHighlightText = options.highlightText.replace(/\s+/g, " ").trim();
      if (normalizedHighlightText.length > 0) {
        url.searchParams.set("highlight_text", normalizedHighlightText);
      }
    }

    if (options?.search && options.search.trim().length > 0) {
      fragments.push(`search=${encodeURIComponent(options.search.trim())}`);
    }
    if (fragments.length > 0) {
      url.hash = fragments.join("&");
    }

    return url.toString();
  },

  /**
   * Get all document evaluations
   */
  async getEvaluations(): Promise<EvaluationStatus[]> {
    const response = await fetch(`${API_BASE_URL}/evaluations`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Get status of specific evaluation
   */
  async getEvaluationStatus(evaluationId: string): Promise<EvaluationStatus> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Get detailed evaluation results
   */
  async getEvaluationResults(evaluationId: string): Promise<{
    requirements: RequirementResult[];
  }> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/results`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Get comprehensive compliance report
   */
  async getComplianceReport(evaluationId: string): Promise<ComplianceReport> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/report`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Fetch stored human feedback for an evaluation
   */
  async getRequirementFeedback(evaluationId: string): Promise<RequirementFeedbackRecord[]> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/feedback`, { cache: "no-store" });
    return handleResponse(response);
  },

  /**
   * Create or update human feedback for a requirement
   */
  async upsertRequirementFeedback(
    evaluationId: string,
    payload: Pick<RequirementFeedbackRecord, 'requirement_id' | 'is_helpful' | 'comment'>
  ): Promise<RequirementFeedbackRecord> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return handleResponse(response);
  },

  /**
   * Fetch ISO requirements from backend, optionally filtered by framework
   */
  async getRequirements(frameworkId?: string): Promise<ISORequirement[]> {
    const url = new URL(`${API_BASE_URL}/requirements`);
    if (frameworkId) {
      url.searchParams.set('framework_id', frameworkId);
    }
    const response = await fetch(url.toString(), { cache: "no-store" })
    return handleResponse(response)
  },

  /**
   * Create a new ISO requirement through backend
   */
  async createRequirement(payload: RequirementCreatePayload): Promise<ISORequirement> {
    const response = await fetch(`${API_BASE_URL}/requirements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return handleResponse(response)
  },

  /**
   * Update an existing ISO requirement
   */
  async updateRequirement(requirementId: string, payload: RequirementCreatePayload): Promise<ISORequirement> {
    const response = await fetch(`${API_BASE_URL}/requirements/${requirementId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return handleResponse(response)
  },

  /**
   * Delete an ISO requirement
   */
  async deleteRequirement(requirementId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/requirements/${requirementId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const errorBody = await response.text()
      let message = `HTTP ${response.status}: ${response.statusText}`
      try {
        const data = JSON.parse(errorBody)
        message = data.detail || message
      } catch {
        // fall back to default message
      }
      throw new APIError(message, response.status)
    }
  },

  /**
   * Delete an evaluation
   */
  async deleteEvaluation(evaluationId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/evaluations/${evaluationId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  /**
   * Get queue position for a specific evaluation
   */
  async getQueuePosition(evaluationId: string): Promise<{
    evaluation_id: string;
    status: string;
    queue_position: number | null;
  }> {
    const response = await fetch(`${API_BASE_URL}/queue/position/${evaluationId}`, {
      cache: 'no-store',
    });
    return handleResponse(response);
  },

  /**
   * Poll evaluation status until completion
   */
  async pollEvaluationStatus(
    evaluationId: string,
    onStatusUpdate?: (status: EvaluationStatus) => void,
    options: {
      intervalMs?: number;
      maxIdleIntervals?: number;
      maxTotalMs?: number;
    } = {}
  ): Promise<EvaluationStatus> {
    const {
      intervalMs = 5000,
      maxIdleIntervals = 60,
      maxTotalMs = 0,
    } = options;

    let idleIntervals = 0;
    let lastProgressKey: string | null = null;
    let sawProgress = false;
    const startTime = Date.now();

    while (true) {
      try {
        const status = await this.getEvaluationStatus(evaluationId);

        if (onStatusUpdate) {
          onStatusUpdate(status);
        }

        if (status.status === 'completed' || status.status === 'error' || status.status === 'failed') {
          return status;
        }

        const metadata = status.metadata;
        const progressKey = metadata
          ? `${metadata.completed_requirements ?? ''}:${metadata.progress_percent ?? ''}:${metadata.last_updated ?? ''}`
          : null;

        if (progressKey) {
          if (progressKey !== lastProgressKey) {
            idleIntervals = 0;
            lastProgressKey = progressKey;
          } else {
            idleIntervals += 1;
          }
          sawProgress = true;
        } else if (sawProgress) {
          idleIntervals += 1;
        }

        if (maxIdleIntervals > 0 && idleIntervals >= maxIdleIntervals) {
          throw new APIError('Evaluation polling timeout - no progress detected');
        }

        if (maxTotalMs > 0 && Date.now() - startTime >= maxTotalMs) {
          throw new APIError('Evaluation polling timeout - time limit exceeded');
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));

      } catch (error) {
        console.error('Error polling evaluation status:', error);
        throw error;
      }
    }
  }
};

export { APIError };
export type { RequirementCreatePayload };
