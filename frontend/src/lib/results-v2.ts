import type {
  RequirementPresentationAnalysisBlock,
  RequirementPresentationCitation,
  RequirementPresentationClaim,
  RequirementPresentationSummary,
  RequirementResult,
} from "@/lib/api"

export type ResultsV2Status = "PASS" | "FAIL" | "FLAGGED" | "NOT_APPLICABLE" | "ERROR"
export type ResultsV2ReviewState = "approved" | "rejected" | "pending"
export type ClaimKind = "assessment" | "supporting" | "gap" | "verification" | "ofi"
export type ClaimTone = "neutral" | "critical" | "warning" | "success" | "muted"

export type CitationReference = RequirementPresentationCitation

export type PresentationClaim = {
  id: string
  text: string
  kind: ClaimKind
  tone: ClaimTone
  citations: CitationReference[]
}

export type AnalysisBlock = {
  id: string
  label: string
  body: string
  tone: ClaimTone
  citations: CitationReference[]
}

export type RequirementDetailViewModel = {
  requirementId: string
  clause: string | null
  title: string
  status: ResultsV2Status
  statusLabel: string
  confidenceLevel: "low" | "medium" | "high"
  reviewState: ResultsV2ReviewState
  reviewLabel: string
  rationale: string
  inlineClaims: PresentationClaim[]
  modalClaims: PresentationClaim[]
  fullAnalysis: AnalysisBlock[]
  tableFinding: string
  searchText: string
}

const STATUS_LABELS: Record<ResultsV2Status, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  FLAGGED: "Flagged",
  NOT_APPLICABLE: "N/A",
  ERROR: "Error",
}

const REVIEW_LABELS: Record<ResultsV2ReviewState, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Pending",
}

export const STATUS_ORDER: Record<ResultsV2Status, number> = {
  FAIL: 0,
  FLAGGED: 1,
  PASS: 2,
  NOT_APPLICABLE: 3,
  ERROR: 4,
}

export const CONFIDENCE_NOTES: Record<"low" | "medium" | "high", string> = {
  high: "High confidence: strong, explicit evidence found in the document.",
  medium: "Medium confidence: partial or indirect evidence found; some inference is still required.",
  low: "Low confidence: weak or ambiguous evidence found; manual review is recommended.",
}

function cleanSourceText(value: string, limit = 220): string {
  const stripped = value
    .trim()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")

  if (stripped.length <= limit) {
    return stripped
  }

  const truncated = stripped.slice(0, limit - 1).trimEnd()
  const safe = truncated.includes(" ") ? truncated.slice(0, truncated.lastIndexOf(" ")) : truncated
  return `${safe}...`
}

function firstSentence(value: string, limit = 220): string {
  const cleaned = cleanSourceText(value, 1000)
  const parts = cleaned.split(/(?<=[.!?])\s+/)
  return cleanSourceText(parts[0] || cleaned, limit)
}

export function normalizeRequirementStatus(status?: string | null): ResultsV2Status {
  const normalized = String(status ?? "").trim().toUpperCase()

  if (normalized === "PARTIAL") {
    return "FLAGGED"
  }
  if (normalized === "FAILED") {
    return "FAIL"
  }
  if (
    normalized === "PASS" ||
    normalized === "FAIL" ||
    normalized === "FLAGGED" ||
    normalized === "NOT_APPLICABLE" ||
    normalized === "ERROR"
  ) {
    return normalized
  }

  return "ERROR"
}

export function feedbackToReviewState(isHelpful: boolean | null | undefined): ResultsV2ReviewState {
  if (isHelpful === true) {
    return "approved"
  }
  if (isHelpful === false) {
    return "rejected"
  }
  return "pending"
}

function getFallbackAssessment(status: ResultsV2Status): string {
  switch (status) {
    case "PASS":
      return "This requirement is adequately addressed in the reviewed documentation."
    case "FAIL":
      return "The reviewed documentation does not adequately address this requirement."
    case "FLAGGED":
      return "The evidence is incomplete or ambiguous and needs human verification."
    case "NOT_APPLICABLE":
      return "This requirement was marked not applicable for this evaluation."
    case "ERROR":
    default:
      return "This requirement could not be evaluated successfully."
  }
}

function getClaimTone(kind: ClaimKind, status: ResultsV2Status): ClaimTone {
  if (kind === "gap") {
    return "critical"
  }
  if (kind === "verification" || kind === "ofi") {
    return "warning"
  }
  if (status === "PASS" && (kind === "supporting" || kind === "assessment")) {
    return "success"
  }
  if (status === "NOT_APPLICABLE") {
    return "muted"
  }
  return "neutral"
}

function getAnalysisTone(label: string, status: ResultsV2Status): ClaimTone {
  const normalized = label.trim().toLowerCase()
  if (normalized.includes("gap")) {
    return status === "PASS" ? "warning" : "critical"
  }
  if (normalized.includes("evidence")) {
    return status === "PASS" ? "success" : "neutral"
  }
  if (status === "NOT_APPLICABLE") {
    return "muted"
  }
  return "neutral"
}

function normalizeCitations(citations?: RequirementPresentationCitation[] | null): CitationReference[] {
  return (citations ?? []).filter(
    (citation): citation is RequirementPresentationCitation =>
      Boolean(citation && typeof citation.label === "string" && citation.label.trim())
  )
}

function normalizeClaimKind(kind: string | null | undefined, status: ResultsV2Status): ClaimKind {
  const value = String(kind ?? "").trim().toLowerCase()
  if (
    value === "assessment" ||
    value === "supporting" ||
    value === "gap" ||
    value === "verification" ||
    value === "ofi"
  ) {
    return value
  }

  if (status === "FAIL") {
    return "gap"
  }
  if (status === "FLAGGED") {
    return "verification"
  }
  if (status === "PASS") {
    return "supporting"
  }
  return "assessment"
}

function mapPresentationClaims(
  claims: RequirementPresentationClaim[] | undefined,
  status: ResultsV2Status,
  prefix: string,
  limit: number
): PresentationClaim[] {
  return (claims ?? [])
    .filter((claim) => typeof claim.text === "string" && claim.text.trim().length > 0)
    .slice(0, limit)
    .map((claim, index) => {
      const kind = normalizeClaimKind(claim.kind, status)
      return {
        id: `${prefix}-${index}`,
        text: claim.text.trim(),
        kind,
        tone: getClaimTone(kind, status),
        citations: normalizeCitations(claim.citations),
      }
    })
}

function mapAnalysisBlocks(
  blocks: RequirementPresentationAnalysisBlock[] | undefined,
  status: ResultsV2Status
): AnalysisBlock[] {
  return (blocks ?? [])
    .filter((block) => typeof block.label === "string" && block.label.trim() && typeof block.body === "string" && block.body.trim())
    .slice(0, 4)
    .map((block, index) => ({
      id: `analysis-${index}`,
      label: block.label.trim(),
      body: block.body.trim(),
      tone: getAnalysisTone(block.label, status),
      citations: normalizeCitations(block.citations),
    }))
}

function fallbackInlineClaims(
  status: ResultsV2Status,
  rationale: string,
  evidence: string[],
  gaps: string[]
): PresentationClaim[] {
  const claims: Array<Omit<PresentationClaim, "id">> = []
  const summary = firstSentence(rationale || getFallbackAssessment(status))

  if (status === "PASS") {
    claims.push({
      text: summary,
      kind: "assessment",
      tone: "success",
      citations: [],
    })
    if (gaps[0]) {
      claims.push({
        text: firstSentence(gaps[0]),
        kind: "ofi",
        tone: "warning",
        citations: [],
      })
    }
  } else if (status === "FAIL") {
    claims.push({
      text: summary,
      kind: "assessment",
      tone: "neutral",
      citations: [],
    })
    if (gaps[0]) {
      claims.push({
        text: firstSentence(gaps[0]),
        kind: "gap",
        tone: "critical",
        citations: [],
      })
    }
  } else if (status === "FLAGGED") {
    claims.push({
      text: summary,
      kind: "assessment",
      tone: "neutral",
      citations: [],
    })
    if (gaps[0]) {
      claims.push({
        text: firstSentence(gaps[0]),
        kind: "verification",
        tone: "warning",
        citations: [],
      })
    }
  } else {
    claims.push({
      text: summary,
      kind: "assessment",
      tone: status === "NOT_APPLICABLE" ? "muted" : "critical",
      citations: [],
    })
  }

  return claims.slice(0, 3).map((claim, index) => ({
    ...claim,
    id: `inline-${index}`,
  }))
}

function fallbackModalClaims(
  status: ResultsV2Status,
  rationale: string,
  evidence: string[],
  gaps: string[]
): PresentationClaim[] {
  const inline = fallbackInlineClaims(status, rationale, evidence, gaps)
  const extraClaims: PresentationClaim[] = []

  const makeClaim = (text: string, kind: ClaimKind, index: number): PresentationClaim => ({
    id: `modal-extra-${kind}-${index}`,
    text,
    kind,
    tone: getClaimTone(kind, status),
    citations: [],
  })

  if (status === "FAIL") {
    gaps.slice(1, 3).forEach((gap, index) => extraClaims.push(makeClaim(firstSentence(gap), "gap", index)))
  } else if (status === "FLAGGED") {
    gaps
      .slice(1, 3)
      .forEach((gap, index) => extraClaims.push(makeClaim(firstSentence(gap), "verification", index)))
  } else if (status === "PASS") {
    gaps.slice(1, 2).forEach((gap, index) => extraClaims.push(makeClaim(firstSentence(gap), "ofi", index)))
  } else if (status === "NOT_APPLICABLE" && evidence[0]) {
    extraClaims.push(makeClaim(firstSentence(evidence[0]), "supporting", 0))
  }

  if ((status === "PASS" || status === "FAIL" || status === "FLAGGED") && evidence[0]) {
    extraClaims.unshift(makeClaim(firstSentence(evidence[0]), "supporting", 0))
  }

  return [...inline, ...extraClaims].slice(0, 5)
}

function fallbackAnalysisBlocks(
  status: ResultsV2Status,
  rationale: string,
  evidence: string[],
  gaps: string[]
): AnalysisBlock[] {
  const blocks: AnalysisBlock[] = []

  if (rationale) {
    blocks.push({
      id: "analysis-summary",
      label: "Assessment summary",
      body: cleanSourceText(rationale, 320),
      tone: getAnalysisTone("Assessment summary", status),
      citations: [],
    })
  }
  if (evidence.length > 0) {
    blocks.push({
      id: "analysis-evidence",
      label: status === "NOT_APPLICABLE" ? "Supporting context" : "Evidence analysis",
      body: evidence.slice(0, 2).map((item) => cleanSourceText(item, 180)).join(" "),
      tone: getAnalysisTone("Evidence analysis", status),
      citations: [],
    })
  }
  if (gaps.length > 0) {
    blocks.push({
      id: "analysis-gaps",
      label: status === "PASS" ? "Opportunity analysis" : "Gap analysis",
      body: gaps.slice(0, 2).map((item) => cleanSourceText(item, 180)).join(" "),
      tone: getAnalysisTone("Gap analysis", status),
      citations: [],
    })
  }

  return blocks.slice(0, 4)
}

function hasPresentationData(presentation?: RequirementPresentationSummary | null): boolean {
  return Boolean(
    presentation &&
      ((presentation.inline_claims?.length ?? 0) > 0 ||
        (presentation.modal_claims?.length ?? 0) > 0 ||
        (presentation.full_analysis?.length ?? 0) > 0)
  )
}

export function mapRequirementToResultsV2ViewModel(
  requirement: RequirementResult,
  reviewState: ResultsV2ReviewState,
  presentation?: RequirementPresentationSummary | null
): RequirementDetailViewModel {
  const status = normalizeRequirementStatus(presentation?.status ?? requirement.status)
  const evidence = (requirement.evidence_snippets ?? []).filter(Boolean)
  const gaps = (requirement.gaps_identified ?? []).filter(Boolean)
  const rationale = requirement.evaluation_rationale?.trim() || getFallbackAssessment(status)
  const confidenceLevel = presentation?.confidence_level ?? requirement.confidence_level ?? "low"

  const inlineClaims = hasPresentationData(presentation)
    ? mapPresentationClaims(presentation?.inline_claims, status, "inline-claim", 4)
    : fallbackInlineClaims(status, rationale, evidence, gaps)
  const modalClaims = hasPresentationData(presentation)
    ? mapPresentationClaims(
        presentation?.modal_claims?.length ? presentation.modal_claims : presentation?.inline_claims,
        status,
        "modal-claim",
        6
      )
    : fallbackModalClaims(status, rationale, evidence, gaps)
  const fullAnalysis =
    hasPresentationData(presentation) && (presentation?.full_analysis?.length ?? 0) > 0
      ? mapAnalysisBlocks(presentation?.full_analysis, status)
      : fallbackAnalysisBlocks(status, rationale, evidence, gaps)

  const tableFinding =
    inlineClaims.find((claim) => claim.kind !== "assessment")?.text ??
    inlineClaims[0]?.text ??
    rationale

  const searchText = [
    requirement.requirement_id,
    requirement.requirement_clause,
    requirement.title,
    rationale,
    ...evidence,
    ...gaps,
    ...inlineClaims.map((claim) => claim.text),
    ...modalClaims.map((claim) => claim.text),
    ...fullAnalysis.map((block) => block.body),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return {
    requirementId: requirement.requirement_id,
    clause: requirement.requirement_clause ?? null,
    title: requirement.title,
    status,
    statusLabel: STATUS_LABELS[status],
    confidenceLevel,
    reviewState,
    reviewLabel: REVIEW_LABELS[reviewState],
    rationale,
    inlineClaims,
    modalClaims,
    fullAnalysis,
    tableFinding,
    searchText,
  }
}
