/**
 * API client for ISO 14971 Compliance Pipeline
 */
import type { ISORequirement } from "./types"

export interface EvaluationStatus {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
  document_name: string;
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
  metadata?: {
    progress_percent?: number;
    completed_requirements?: number;
    total_requirements?: number;
    status_message?: string;
    last_updated?: string;
    batch_number?: number;
    batch_total?: number;
    batch_size?: number;
    last_requirement_id?: string;
  };
}

export interface RequirementResult {
  requirement_id: string;
  requirement_clause?: string | null;
  title: string;
  status: 'PASS' | 'FAIL' | 'FLAGGED' | 'PARTIAL' | 'NOT_APPLICABLE' | 'ERROR';
  confidence_level: 'low' | 'medium' | 'high';
  confidence_score?: number | null;
  evidence_snippets: string[];
  evaluation_rationale: string;
  gaps_identified: string[];
  recommendations: string[];
   agreement_status?: 'agreement' | 'conflict' | 'unknown';
  tokens_used?: number;
  evaluation_duration_ms?: number;
  search_results?: Record<string, unknown>[];
  created_at?: string;
}

export interface RequirementFeedbackRecord {
  evaluation_id: string;
  requirement_id: string;
  is_helpful: boolean | null;
  comment: string | null;
  created_at?: string;
  updated_at?: string;
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
    agreement_by_requirement?: Record<string, 'agreement' | 'conflict' | 'unknown'>;
  };
  requirements: RequirementResult[];
  high_risk_findings: string[];
  key_gaps: string[];
}

export interface RequirementCreatePayload {
  clause: string
  title: string
  requirement_text?: string | null
  display_order?: number
  evaluation_type?: string
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

  let parsed: unknown = null;
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
  /**
   * Upload a document for evaluation
   */
  async uploadDocument(file: File): Promise<{
    evaluation_id: string;
    filename: string;
    status: string;
    message: string;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    
    return handleResponse(response);
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
   * Fetch ISO requirements from backend
   */
  async getRequirements(): Promise<ISORequirement[]> {
    const response = await fetch(`${API_BASE_URL}/requirements`, { cache: "no-store" })
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
