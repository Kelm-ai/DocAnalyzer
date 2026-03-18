import type {
  RequirementPresentationAnalysisBlock,
  RequirementPresentationCitation,
  RequirementPresentationClaim,
  RequirementPresentationEvidenceGroup,
  RequirementPresentationEvidenceItem,
  RequirementPresentationSummary,
  RequirementPresentationTextBlock,
  RequirementResult,
} from "@/lib/api"

export type ResultsV2Status = "PASS" | "FAIL" | "FLAGGED" | "NOT_APPLICABLE" | "ERROR"
export type ResultsV2ReviewState = "approved" | "rejected" | "pending"
export type ClaimTone = "neutral" | "critical" | "warning" | "success" | "muted"
export type CitationReference = RequirementPresentationCitation
export type DetailLabel =
  | "Finding"
  | "Document evidence"
  | "Observed limitation"
  | "Opportunity for improvement"
  | "Needs verification"

type LegacyClaimKind = "assessment" | "supporting" | "gap" | "verification" | "ofi"

export type NarrativeItem = {
  id: string
  label?: DetailLabel
  text: string
  tone: ClaimTone
  citations: CitationReference[]
}

export type SourceGroup = {
  id: string
  label: DetailLabel
  statementId: string
  sources: CitationReference[]
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
  inlineFinding: NarrativeItem
  inlineEvidence: NarrativeItem | null
  inlineCaveat: NarrativeItem | null
  modalSummary: string
  modalEvidence: NarrativeItem[]
  sourceGroups: SourceGroup[]
  totalSources: number
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

function cleanSourceText(value: string, limit = 300): string {
  const stripped = value
    .trim()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\[E\d+\]/gi, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

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

function getFindingTone(status: ResultsV2Status): ClaimTone {
  switch (status) {
    case "PASS":
      return "success"
    case "FAIL":
      return "critical"
    case "FLAGGED":
      return "warning"
    case "NOT_APPLICABLE":
      return "muted"
    case "ERROR":
    default:
      return "critical"
  }
}

function getEvidenceTone(label: DetailLabel, status: ResultsV2Status): ClaimTone {
  if (label === "Document evidence") {
    if (status === "PASS") {
      return "success"
    }
    if (status === "NOT_APPLICABLE") {
      return "muted"
    }
    return "neutral"
  }
  if (label === "Needs verification") {
    return "warning"
  }
  if (status === "FAIL") {
    return "critical"
  }
  return "warning"
}

function normalizeDetailLabel(label: DetailLabel, status: ResultsV2Status): DetailLabel {
  if (status === "PASS" && label === "Observed limitation") {
    return "Opportunity for improvement"
  }

  return label
}

function getInlineCaveatLabel(status: ResultsV2Status): DetailLabel {
  if (status === "FLAGGED") {
    return "Needs verification"
  }
  if (status === "PASS") {
    return "Opportunity for improvement"
  }
  return "Observed limitation"
}

function normalizeCitations(citations?: RequirementPresentationCitation[] | null): CitationReference[] {
  return (citations ?? []).filter(
    (citation): citation is RequirementPresentationCitation =>
      Boolean(citation && typeof citation.label === "string" && citation.label.trim())
  )
}

function makeNarrativeItem(
  id: string,
  text: string,
  tone: ClaimTone,
  citations: CitationReference[] = [],
  label?: DetailLabel
): NarrativeItem {
  return {
    id,
    label,
    text: text.trim(),
    tone,
    citations,
  }
}

function dedupeSources(sources: CitationReference[]): CitationReference[] {
  const seen = new Set<string>()

  return sources.filter((source) => {
    const key = `${source.location}|${source.excerpt}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function normalizeTextBlock(
  block: RequirementPresentationTextBlock | null | undefined,
  id: string,
  tone: ClaimTone,
  label?: DetailLabel
): NarrativeItem | null {
  if (!block || typeof block.text !== "string" || block.text.trim().length === 0) {
    return null
  }

  return makeNarrativeItem(id, block.text.trim(), tone, normalizeCitations(block.citations), label)
}

function normalizeEvidenceItems(
  items: RequirementPresentationEvidenceItem[] | null | undefined,
  status: ResultsV2Status,
  prefix: string,
  limit?: number
): NarrativeItem[] {
  const normalized = (items ?? [])
    .filter((item) => typeof item.text === "string" && item.text.trim().length > 0)
    .map((item, index) =>
      makeNarrativeItem(
        `${prefix}-${index}`,
        item.text.trim(),
        getEvidenceTone(normalizeDetailLabel(item.label, status), status),
        normalizeCitations(item.citations),
        normalizeDetailLabel(item.label, status)
      )
    )

  return typeof limit === "number" ? normalized.slice(0, limit) : normalized
}

function defaultDocumentEvidenceText(status: ResultsV2Status): string | null {
  if (status === "PASS") {
    return "The document appears to address this requirement, but no specific citations were extracted."
  }
  if (status === "FAIL") {
    return "No direct supporting text was identified in the reviewed document for this requirement."
  }
  if (status === "FLAGGED") {
    return "The extracted evidence is not specific enough to resolve this requirement without human review."
  }
  return null
}

function fallbackInlineEvidence(status: ResultsV2Status, evidence: string[]): NarrativeItem | null {
  if (evidence[0]) {
    return makeNarrativeItem(
      "fallback-inline-evidence",
      cleanSourceText(evidence[0], 260),
      getEvidenceTone("Document evidence", status),
      [],
      "Document evidence"
    )
  }

  const fallbackText = defaultDocumentEvidenceText(status)
  if (!fallbackText) {
    return null
  }

  return makeNarrativeItem(
    "fallback-inline-evidence",
    fallbackText,
    getEvidenceTone("Document evidence", status),
    [],
    "Document evidence"
  )
}

function fallbackInlineCaveat(status: ResultsV2Status, gaps: string[]): NarrativeItem | null {
  if (status === "FLAGGED") {
    const text = gaps[0]
      ? cleanSourceText(gaps[0], 600)
      : "Human review is still needed to confirm whether this requirement is met."

    return makeNarrativeItem(
      "fallback-inline-caveat",
      text,
      getEvidenceTone("Needs verification", status),
      [],
      "Needs verification"
    )
  }

  if (!gaps[0]) {
    return null
  }

  return makeNarrativeItem(
    "fallback-inline-caveat",
    cleanSourceText(gaps[0], 600),
    getEvidenceTone(getInlineCaveatLabel(status), status),
    [],
    getInlineCaveatLabel(status)
  )
}

function dedupeNarratives(items: NarrativeItem[]): NarrativeItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.label ?? ""}|${item.text}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function buildSourceGroups(items: Array<Omit<SourceGroup, "sources"> & { sources: CitationReference[] }>): SourceGroup[] {
  const merged = new Map<string, SourceGroup>()

  items.forEach((item) => {
    if (item.sources.length === 0) {
      return
    }

    const key = `${item.statementId}|${item.label}`
    const existing = merged.get(key)
    if (existing) {
      existing.sources = dedupeSources([...existing.sources, ...item.sources])
      return
    }

    merged.set(key, {
      id: item.id,
      label: item.label,
      statementId: item.statementId,
      sources: dedupeSources(item.sources),
    })
  })

  return Array.from(merged.values())
}

function countSources(groups: SourceGroup[]): number {
  return dedupeSources(groups.flatMap((group) => group.sources)).length
}

function sourcesForStatement(groups: SourceGroup[], statementId: string | null | undefined): CitationReference[] {
  if (!statementId) {
    return []
  }

  return dedupeSources(
    groups
      .filter((group) => group.statementId === statementId)
      .flatMap((group) => group.sources)
  )
}

function fallbackModalEvidence(
  status: ResultsV2Status,
  evidence: string[],
  gaps: string[],
  inlineEvidence: NarrativeItem | null
): NarrativeItem[] {
  const items: NarrativeItem[] = []

  if (inlineEvidence) {
    items.push({ ...inlineEvidence, id: "fallback-modal-evidence-0" })
  }

  if (!inlineEvidence) {
    const fallbackText = defaultDocumentEvidenceText(status)
    if (fallbackText) {
      items.push(
        makeNarrativeItem(
          "fallback-modal-evidence-0",
          fallbackText,
          getEvidenceTone("Document evidence", status),
          [],
          "Document evidence"
        )
      )
    }
  }

  const secondaryLabel: DetailLabel | null =
    status === "FLAGGED" ? "Needs verification" : status === "PASS" || status === "FAIL" ? getInlineCaveatLabel(status) : null

  if (secondaryLabel) {
    gaps.slice(0, 2).forEach((gap, index) => {
      items.push(
        makeNarrativeItem(
          `fallback-modal-secondary-${index}`,
          cleanSourceText(gap, 260),
          getEvidenceTone(secondaryLabel, status),
          [],
          secondaryLabel
        )
      )
    })
  }

  if (status === "FLAGGED" && gaps.length === 0) {
    items.push(
      makeNarrativeItem(
        "fallback-modal-secondary-generic",
        "The available document evidence is incomplete or ambiguous enough that this requirement should be reviewed by a human.",
        getEvidenceTone("Needs verification", status),
        [],
        "Needs verification"
      )
    )
  }

  return dedupeNarratives(items).slice(0, 4)
}

function buildFallbackPresentation(
  status: ResultsV2Status,
  rationale: string,
  evidence: string[],
  gaps: string[]
): Pick<
  RequirementDetailViewModel,
  "inlineFinding" | "inlineEvidence" | "inlineCaveat" | "modalSummary" | "modalEvidence" | "sourceGroups" | "totalSources"
> {
  const inlineEvidence = fallbackInlineEvidence(status, evidence)
  const inlineCaveat = fallbackInlineCaveat(status, gaps)
  const inlineFinding = makeNarrativeItem(
    "fallback-inline-finding",
    cleanSourceText(rationale || getFallbackAssessment(status), 600),
    getFindingTone(status),
    inlineEvidence?.citations ?? [],
    "Finding"
  )
  const modalEvidence = fallbackModalEvidence(status, evidence, gaps, inlineEvidence)
  const sourceGroups = buildSourceGroups([
    {
      id: "fallback-finding-sources",
      label: "Finding",
      statementId: inlineFinding.id,
      sources: inlineFinding.citations,
    },
    ...(inlineCaveat
      ? [
          {
            id: "fallback-caveat-sources",
            label: normalizeDetailLabel(inlineCaveat.label ?? getInlineCaveatLabel(status), status),
            statementId: inlineCaveat.id,
            sources: inlineCaveat.citations,
          },
        ]
      : []),
    ...modalEvidence.map((item) => ({
      id: `${item.id}-sources`,
      label: normalizeDetailLabel(item.label ?? "Document evidence", status),
      statementId:
        item.label === "Observed limitation" || item.label === "Needs verification"
          ? inlineCaveat?.id ?? inlineFinding.id
          : inlineFinding.id,
      sources: item.citations,
    })),
  ])

  return {
    inlineFinding,
    inlineEvidence,
    inlineCaveat,
    modalSummary: cleanSourceText(rationale || inlineFinding.text, 300),
    modalEvidence,
    sourceGroups,
    totalSources: countSources(sourceGroups),
  }
}

function hasFindingPresentationData(presentation?: RequirementPresentationSummary | null): boolean {
  return Boolean(
    presentation &&
      ((presentation.inline_finding?.text?.trim().length ?? 0) > 0 ||
        (presentation.inline_evidence?.text?.trim().length ?? 0) > 0 ||
        (presentation.inline_caveat?.text?.trim().length ?? 0) > 0 ||
        (presentation.modal_summary?.trim().length ?? 0) > 0 ||
        (presentation.modal_evidence?.length ?? 0) > 0)
  )
}

function hasV3PresentationData(presentation?: RequirementPresentationSummary | null): boolean {
  return Boolean(
    presentation &&
      ((presentation.presentation_version === "openai-finding-v3" &&
        ((presentation.evidence_groups?.length ?? 0) > 0 || (presentation.inline_finding?.text?.trim().length ?? 0) > 0)) ||
        (presentation.evidence_groups?.length ?? 0) > 0 ||
        presentation.inline_finding?.id === "finding" ||
        presentation.inline_caveat?.id === "caveat")
  )
}

function hasLegacyPresentationData(presentation?: RequirementPresentationSummary | null): boolean {
  return Boolean(
    presentation &&
      ((presentation.inline_claims?.length ?? 0) > 0 ||
        (presentation.modal_claims?.length ?? 0) > 0 ||
        (presentation.full_analysis?.length ?? 0) > 0)
  )
}

function normalizeEvidenceGroups(
  groups: RequirementPresentationEvidenceGroup[] | null | undefined,
  status: ResultsV2Status,
  prefix: string
): Array<NarrativeItem & { claimId: string }> {
  return (groups ?? [])
    .filter((group) => typeof group.text === "string" && group.text.trim().length > 0)
    .map((group, index) => ({
      ...makeNarrativeItem(
        `${prefix}-${index}`,
        group.text.trim(),
        getEvidenceTone(normalizeDetailLabel(group.label, status), status),
        normalizeCitations(group.citations),
        normalizeDetailLabel(group.label, status)
      ),
      claimId: String(group.claim_id || ""),
    }))
}

function aggregateClaimCitations(
  groups: Array<NarrativeItem & { claimId: string }>,
  claimId: string
): CitationReference[] {
  const seen = new Set<string>()
  const citations: CitationReference[] = []

  groups
    .filter((group) => group.claimId === claimId)
    .forEach((group) => {
      group.citations.forEach((citation) => {
        const key = `${citation.location}|${citation.excerpt}`
        if (seen.has(key)) {
          return
        }
        seen.add(key)
        citations.push(citation)
      })
    })

  return citations
}

function normalizeLegacyClaimKind(kind: string | null | undefined, status: ResultsV2Status): LegacyClaimKind {
  const value = String(kind ?? "").trim().toLowerCase()
  if (value === "assessment" || value === "supporting" || value === "gap" || value === "verification" || value === "ofi") {
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

function normalizeLegacyClaims(
  claims: RequirementPresentationClaim[] | null | undefined,
  status: ResultsV2Status
): Array<{ text: string; kind: LegacyClaimKind; citations: CitationReference[] }> {
  return (claims ?? [])
    .filter((claim) => typeof claim.text === "string" && claim.text.trim().length > 0)
    .map((claim) => ({
      text: claim.text.trim(),
      kind: normalizeLegacyClaimKind(claim.kind, status),
      citations: normalizeCitations(claim.citations),
    }))
}

function legacyAnalysisLabel(label: string, status: ResultsV2Status): DetailLabel | null {
  const normalized = label.trim().toLowerCase()
  if (normalized.includes("evidence") || normalized.includes("support")) {
    return "Document evidence"
  }
  if (normalized.includes("verification")) {
    return "Needs verification"
  }
  if (normalized.includes("gap") || normalized.includes("opportunity") || normalized.includes("limitation")) {
    if (status === "FLAGGED") {
      return "Needs verification"
    }
    if (status === "PASS") {
      return "Opportunity for improvement"
    }
    return "Observed limitation"
  }
  return null
}

function normalizeLegacyAnalysis(
  blocks: RequirementPresentationAnalysisBlock[] | null | undefined,
  status: ResultsV2Status
): NarrativeItem[] {
  return (blocks ?? [])
    .filter((block) => typeof block.body === "string" && block.body.trim().length > 0)
    .map((block, index) => {
      const label = legacyAnalysisLabel(block.label, status)
      if (!label) {
        return null
      }
      return makeNarrativeItem(
        `legacy-analysis-${index}`,
        block.body.trim(),
        getEvidenceTone(label, status),
        normalizeCitations(block.citations),
        label
      )
    })
    .filter((item): item is NarrativeItem => item !== null)
}

function buildLegacyPresentation(
  presentation: RequirementPresentationSummary,
  status: ResultsV2Status,
  rationale: string
): Partial<Pick<RequirementDetailViewModel, "inlineFinding" | "inlineEvidence" | "inlineCaveat" | "modalSummary" | "modalEvidence">> {
  const inlineClaims = normalizeLegacyClaims(presentation.inline_claims, status)
  const modalClaims = normalizeLegacyClaims(presentation.modal_claims, status)
  const allClaims = [...inlineClaims, ...modalClaims]

  const findingClaim = allClaims.find((claim) => claim.kind === "assessment") ?? allClaims[0]
  const supportingClaims = allClaims.filter((claim) => claim.kind === "supporting")
  const caveatClaim = allClaims.find((claim) => claim.kind === "gap" || claim.kind === "verification" || claim.kind === "ofi")

  const inlineFinding = findingClaim
    ? makeNarrativeItem("legacy-inline-finding", findingClaim.text, getFindingTone(status), findingClaim.citations, "Finding")
    : null

  const inlineEvidence = supportingClaims[0]
    ? makeNarrativeItem(
        "legacy-inline-evidence",
        supportingClaims[0].text,
        getEvidenceTone("Document evidence", status),
        supportingClaims[0].citations,
        "Document evidence"
      )
    : null

  const caveatLabel =
    caveatClaim?.kind === "verification" ? "Needs verification" : caveatClaim ? getInlineCaveatLabel(status) : undefined
  const inlineCaveat =
    caveatClaim && caveatLabel
      ? makeNarrativeItem(
          "legacy-inline-caveat",
          caveatClaim.text,
          getEvidenceTone(caveatLabel, status),
          caveatClaim.citations,
          caveatLabel
        )
      : null

  const modalEvidence = dedupeNarratives([
    ...(inlineEvidence ? [{ ...inlineEvidence, id: "legacy-modal-inline-evidence" }] : []),
    ...supportingClaims.slice(1, 3).map((claim, index) =>
      makeNarrativeItem(
        `legacy-modal-support-${index}`,
        claim.text,
        getEvidenceTone("Document evidence", status),
        claim.citations,
        "Document evidence"
      )
    ),
    ...normalizeLegacyAnalysis(presentation.full_analysis, status),
    ...(inlineCaveat ? [{ ...inlineCaveat, id: "legacy-modal-inline-caveat" }] : []),
  ]).slice(0, 4)

  const analysisSummary =
    (presentation.full_analysis ?? []).find((block) => block.label.toLowerCase().includes("summary"))?.body?.trim() ?? null

  return {
    inlineFinding: inlineFinding ?? undefined,
    inlineEvidence: inlineEvidence ?? undefined,
    inlineCaveat: inlineCaveat ?? undefined,
    modalSummary: analysisSummary || findingClaim?.text || rationale,
    modalEvidence,
  }
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

  const fallback = buildFallbackPresentation(status, rationale, evidence, gaps)

  let inlineFinding = fallback.inlineFinding
  let inlineEvidence = fallback.inlineEvidence
  let inlineCaveat = fallback.inlineCaveat
  let modalSummary = fallback.modalSummary
  let modalEvidence = fallback.modalEvidence
  let sourceGroups = fallback.sourceGroups
  let totalSources = fallback.totalSources

  if (hasV3PresentationData(presentation)) {
    const normalizedEvidenceGroups = normalizeEvidenceGroups(presentation?.evidence_groups, status, "v3-group")

    inlineFinding =
      normalizeTextBlock(presentation?.inline_finding, "v3-inline-finding", getFindingTone(status), "Finding") ??
      inlineFinding

    inlineCaveat =
      normalizeTextBlock(
        presentation?.inline_caveat,
        "v3-inline-caveat",
        getEvidenceTone(getInlineCaveatLabel(status), status),
        getInlineCaveatLabel(status)
      ) ?? inlineCaveat

    inlineEvidence = null

    if (typeof presentation?.modal_summary === "string" && presentation.modal_summary.trim().length > 0) {
      modalSummary = presentation.modal_summary.trim()
    }

    if (normalizedEvidenceGroups.length > 0) {
      modalEvidence = normalizedEvidenceGroups.map(({ claimId: _claimId, ...item }) => item)
      sourceGroups = buildSourceGroups(
        normalizedEvidenceGroups.map((group) => ({
          id: `${group.id}-sources`,
          label: normalizeDetailLabel(group.label, status),
          statementId: group.claimId === "caveat" ? inlineCaveat?.id ?? "v3-inline-caveat" : inlineFinding.id,
          sources: group.citations,
        }))
      )
      inlineFinding = {
        ...inlineFinding,
        citations: aggregateClaimCitations(normalizedEvidenceGroups, "finding"),
      }
      if (inlineCaveat) {
        inlineCaveat = {
          ...inlineCaveat,
          citations: aggregateClaimCitations(normalizedEvidenceGroups, "caveat"),
        }
      }
      totalSources = countSources(sourceGroups)
    }
  } else if (hasFindingPresentationData(presentation)) {
    inlineFinding =
      normalizeTextBlock(presentation?.inline_finding, "v2-inline-finding", getFindingTone(status), "Finding") ??
      inlineFinding
    inlineEvidence =
      normalizeTextBlock(
        presentation?.inline_evidence,
        "v2-inline-evidence",
        getEvidenceTone("Document evidence", status),
        "Document evidence"
      ) ?? inlineEvidence
    inlineCaveat =
      normalizeTextBlock(
        presentation?.inline_caveat,
        "v2-inline-caveat",
        getEvidenceTone(getInlineCaveatLabel(status), status),
        getInlineCaveatLabel(status)
      ) ?? inlineCaveat

    if (typeof presentation?.modal_summary === "string" && presentation.modal_summary.trim().length > 0) {
      modalSummary = presentation.modal_summary.trim()
    }

    const normalizedModalEvidence = normalizeEvidenceItems(presentation?.modal_evidence, status, "v2-modal", 4)
    if (normalizedModalEvidence.length > 0) {
      modalEvidence = normalizedModalEvidence
    }
    if (inlineFinding.citations.length === 0 && inlineEvidence?.citations.length) {
      inlineFinding = {
        ...inlineFinding,
        citations: inlineEvidence.citations,
      }
    }
    sourceGroups = buildSourceGroups([
      {
        id: "v2-finding-sources",
        label: "Finding",
        statementId: inlineFinding.id,
        sources: inlineFinding.citations,
      },
      ...(inlineEvidence
        ? [
            {
              id: "v2-document-sources",
              label: "Document evidence" as DetailLabel,
              statementId: inlineFinding.id,
              sources: inlineEvidence.citations,
            },
          ]
        : []),
      ...(inlineCaveat
        ? [
            {
              id: "v2-caveat-sources",
              label: normalizeDetailLabel(inlineCaveat.label ?? getInlineCaveatLabel(status), status),
              statementId: inlineCaveat.id,
              sources: inlineCaveat.citations,
            },
          ]
        : []),
      ...modalEvidence.map((item) => ({
        id: `${item.id}-sources`,
        label: normalizeDetailLabel(item.label ?? "Document evidence", status),
        statementId:
          item.label === "Observed limitation" || item.label === "Needs verification"
            ? inlineCaveat?.id ?? inlineFinding.id
            : inlineFinding.id,
        sources: item.citations,
      })),
    ])
    totalSources = countSources(sourceGroups)
  } else if (hasLegacyPresentationData(presentation)) {
    const legacy = buildLegacyPresentation(presentation as RequirementPresentationSummary, status, rationale)
    inlineFinding = legacy.inlineFinding ?? inlineFinding
    inlineEvidence = legacy.inlineEvidence ?? inlineEvidence
    inlineCaveat = legacy.inlineCaveat ?? inlineCaveat
    modalSummary = legacy.modalSummary ?? modalSummary
    modalEvidence = legacy.modalEvidence?.length ? legacy.modalEvidence : modalEvidence
    if (inlineFinding.citations.length === 0 && inlineEvidence?.citations.length) {
      inlineFinding = {
        ...inlineFinding,
        citations: inlineEvidence.citations,
      }
    }
    sourceGroups = buildSourceGroups([
      {
        id: "legacy-finding-sources",
        label: "Finding",
        statementId: inlineFinding.id,
        sources: inlineFinding.citations,
      },
      ...(inlineEvidence
        ? [
            {
              id: "legacy-document-sources",
              label: "Document evidence" as DetailLabel,
              statementId: inlineFinding.id,
              sources: inlineEvidence.citations,
            },
          ]
        : []),
      ...(inlineCaveat
        ? [
            {
              id: "legacy-caveat-sources",
              label: normalizeDetailLabel(inlineCaveat.label ?? getInlineCaveatLabel(status), status),
              statementId: inlineCaveat.id,
              sources: inlineCaveat.citations,
            },
          ]
        : []),
      ...modalEvidence.map((item) => ({
        id: `${item.id}-sources`,
        label: normalizeDetailLabel(item.label ?? "Document evidence", status),
        statementId:
          item.label === "Observed limitation" || item.label === "Needs verification"
            ? inlineCaveat?.id ?? inlineFinding.id
            : inlineFinding.id,
        sources: item.citations,
      })),
    ])
    totalSources = countSources(sourceGroups)
  }

  if (inlineFinding.citations.length === 0 && inlineEvidence?.citations.length) {
    inlineFinding = {
      ...inlineFinding,
      citations: inlineEvidence.citations,
    }
  }

  const findingSources = sourcesForStatement(sourceGroups, inlineFinding.id)
  if (findingSources.length > 0) {
    inlineFinding = {
      ...inlineFinding,
      citations: findingSources,
    }
  }

  if (inlineCaveat) {
    const caveatSources = sourcesForStatement(sourceGroups, inlineCaveat.id)
    if (caveatSources.length > 0) {
      inlineCaveat = {
        ...inlineCaveat,
        citations: caveatSources,
      }
    }
  }

  // If finding text was truncated by the backend, restore full text from rationale
  if (inlineFinding.text.endsWith("...") && rationale.length > inlineFinding.text.length) {
    inlineFinding = { ...inlineFinding, text: cleanSourceText(rationale, 600) }
  }
  if (inlineCaveat?.text.endsWith("...") && gaps[0] && gaps[0].length > inlineCaveat.text.length) {
    inlineCaveat = { ...inlineCaveat, text: cleanSourceText(gaps[0], 600) }
  }

  const tableFinding = firstSentence(inlineFinding.text, 220)

  const searchText = [
    requirement.requirement_id,
    requirement.requirement_clause,
    requirement.title,
    rationale,
    ...evidence,
    ...gaps,
    inlineFinding.text,
    inlineEvidence?.text,
    inlineCaveat?.text,
    modalSummary,
    ...modalEvidence.map((item) => item.text),
    ...sourceGroups.flatMap((group) => [
      group.label,
      ...group.sources.flatMap((source) => [source.label, source.location, source.excerpt]),
    ]),
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
    inlineFinding,
    inlineEvidence,
    inlineCaveat,
    modalSummary,
    modalEvidence,
    sourceGroups,
    totalSources,
    tableFinding,
    searchText,
  }
}
