import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import * as XLSX from "xlsx"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"

import { api } from "@/lib/api"
import type { ComplianceReport, Framework } from "@/lib/api"
import {
  CONFIDENCE_NOTES,
  feedbackToReviewState,
  mapRequirementToResultsV2ViewModel,
  STATUS_ORDER,
  type AnalysisBlock,
  type CitationReference,
  type ClaimTone,
  type PresentationClaim,
  type RequirementDetailViewModel,
  type ResultsV2ReviewState,
  type ResultsV2Status,
} from "@/lib/results-v2"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type FeedbackEntry = {
  isHelpful: boolean | null
  comment: string
  isSaving: boolean
  error: string | null
}

function createDefaultFeedbackEntry(): FeedbackEntry {
  return {
    isHelpful: null,
    comment: "",
    isSaving: false,
    error: null,
  }
}

function getToneClasses(tone: ClaimTone): string {
  switch (tone) {
    case "critical":
      return "border-status-fail/20 bg-status-fail-bg text-foreground"
    case "warning":
      return "border-status-flagged/20 bg-status-flagged-bg text-foreground"
    case "success":
      return "border-status-pass/20 bg-status-pass-bg text-foreground"
    case "muted":
      return "border-border bg-muted text-foreground"
    case "neutral":
    default:
      return "border-border bg-background text-foreground"
  }
}

function formatCitationLabel(citation: CitationReference, index: number): string {
  if (typeof citation.label === "string" && citation.label.trim().length > 0) {
    return citation.label.trim()
  }
  if (citation.page_number != null) {
    return `p.${citation.page_number}`
  }
  return `Source ${index + 1}`
}

function formatCitationHover(citation: CitationReference): string {
  const parts = [citation.location, citation.excerpt].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  )
  return parts.join("\n")
}

function CitationPill({ citation, index }: { citation: CitationReference; index: number }) {
  return (
    <span className="rv2-citation group relative inline-flex">
      <span
        className="inline-flex cursor-help items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
        title={formatCitationHover(citation)}
      >
        {formatCitationLabel(citation, index)}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-border bg-background p-3 text-left text-[11px] leading-relaxed text-foreground shadow-xl group-hover:block">
        <span className="mb-1 block font-semibold text-muted-foreground">{citation.location}</span>
        <span>{citation.excerpt}</span>
      </span>
    </span>
  )
}

/* ── Presentational helpers ──────────────────────── */

function StatusDot({ status, label }: { status: ResultsV2Status; label: string }) {
  const dotColor: Record<ResultsV2Status, string> = {
    PASS: "bg-status-pass",
    FAIL: "bg-status-fail",
    FLAGGED: "bg-status-flagged",
    NOT_APPLICABLE: "bg-status-na",
    ERROR: "bg-status-fail",
  }
  const textColor: Record<ResultsV2Status, string> = {
    PASS: "text-status-pass",
    FAIL: "text-status-fail",
    FLAGGED: "text-status-flagged",
    NOT_APPLICABLE: "text-status-na",
    ERROR: "text-status-fail",
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", textColor[status])}>
      <span className={cn("rv2-status-dot", dotColor[status])} />
      {label}
    </span>
  )
}

function ConfidenceBar({ level }: { level: "low" | "medium" | "high" }) {
  const config = {
    high: { width: "100%", fill: "bg-status-pass", text: "text-status-pass" },
    medium: { width: "60%", fill: "bg-status-flagged", text: "text-status-flagged" },
    low: { width: "30%", fill: "bg-status-na", text: "text-status-na" },
  }[level]
  return (
    <div className="flex items-center gap-2">
      <div className="rv2-confidence-track">
        <div className={cn("rv2-confidence-fill", config.fill)} style={{ width: config.width }} />
      </div>
      <span className={cn("text-xs capitalize whitespace-nowrap", config.text)}>{level}</span>
    </div>
  )
}

function ReviewBadge({ state, label }: { state: ResultsV2ReviewState; label: string }) {
  return (
    <span
      className={cn("rv2-review-badge", {
        "bg-muted text-muted-foreground": state === "pending",
        "bg-status-pass-bg text-status-pass": state === "approved",
        "bg-status-fail-bg text-status-fail": state === "rejected",
      })}
    >
      {label}
    </span>
  )
}

function ClaimSentenceView({ claim, compact = false }: { claim: PresentationClaim; compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border leading-relaxed",
        compact ? "px-3 py-2.5 text-[13px]" : "px-4 py-3 text-sm",
        getToneClasses(claim.tone)
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", {
            "bg-status-fail": claim.tone === "critical",
            "bg-status-flagged": claim.tone === "warning",
            "bg-status-pass": claim.tone === "success",
            "bg-muted-foreground": claim.tone === "muted",
            "bg-sc": claim.tone === "neutral",
          })}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{claim.text}</span>
          {claim.citations.map((citation, index) => (
            <CitationPill key={`${claim.id}-citation-${index}`} citation={citation} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AnalysisBlockView({ block }: { block: AnalysisBlock }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {block.label}
        </h3>
        {block.citations.map((citation, index) => (
          <CitationPill key={`${block.id}-citation-${index}`} citation={citation} index={index} />
        ))}
      </div>
      <div className={cn("rounded-lg border p-4 text-sm leading-relaxed", getToneClasses(block.tone))}>
        {block.body}
      </div>
    </section>
  )
}

export function ResultsV2() {
  const { evaluationId } = useParams<{ evaluationId: string }>()

  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackEntry>>({})
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | ResultsV2Status>("all")
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "low" | "medium" | "high">("all")
  const [clauseFilter, setClauseFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null)
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null)
  const [draftComment, setDraftComment] = useState("")

  useEffect(() => {
    if (!evaluationId) {
      setError("No evaluation ID provided")
      setLoading(false)
      return
    }

    const loadReport = async () => {
      try {
        setLoading(true)
        const [reportData, evaluationStatus] = await Promise.all([
          api.getComplianceReport(evaluationId),
          api.getEvaluationStatus(evaluationId),
        ])
        setReport(reportData)
        setError(null)

        if (evaluationStatus.framework_id) {
          try {
            const frameworkData = await api.getFramework(evaluationStatus.framework_id)
            setFramework(frameworkData)
          } catch (frameworkError) {
            console.error("Failed to load framework", frameworkError)
          }
        }
      } catch (loadError) {
        console.error("Failed to load compliance report", loadError)
        setError("Failed to load compliance report")
      } finally {
        setLoading(false)
      }
    }

    void loadReport()
  }, [evaluationId])

  useEffect(() => {
    if (!evaluationId) {
      return
    }

    const loadFeedback = async () => {
      try {
        setFeedbackLoading(true)
        const feedback = await api.getRequirementFeedback(evaluationId)
        const mapped = Array.isArray(feedback)
          ? feedback.reduce<Record<string, FeedbackEntry>>((acc, record) => {
              acc[record.requirement_id] = {
                isHelpful: record.is_helpful,
                comment: record.comment ?? "",
                isSaving: false,
                error: null,
              }
              return acc
            }, {})
          : {}

        if (!Array.isArray(feedback)) {
          setFeedbackError("Could not load human feedback. Displaying default values.")
        } else {
          setFeedbackError(null)
        }

        setFeedbackMap(mapped)
      } catch (loadError) {
        console.error("Failed to load feedback", loadError)
        setFeedbackError("Could not load human feedback. Displaying default values.")
        setFeedbackMap({})
      } finally {
        setFeedbackLoading(false)
      }
    }

    void loadFeedback()
  }, [evaluationId])

  const rows = useMemo<RequirementDetailViewModel[]>(() => {
    if (!report) {
      return []
    }

    return report.requirements
      .map((requirement) =>
        mapRequirementToResultsV2ViewModel(
          requirement,
          feedbackToReviewState(feedbackMap[requirement.requirement_id]?.isHelpful),
          report.requirement_presentations?.[requirement.requirement_id]
        )
      )
      .sort((left, right) => {
        const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
        if (statusDiff !== 0) {
          return statusDiff
        }

        const clauseLeft = left.clause ?? ""
        const clauseRight = right.clause ?? ""
        const clauseDiff = clauseLeft.localeCompare(clauseRight, undefined, {
          numeric: true,
          sensitivity: "base",
        })
        if (clauseDiff !== 0) {
          return clauseDiff
        }

        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      })
  }, [feedbackMap, report])

  const clauseOptions = useMemo(() => {
    return [...new Set(rows.map((row) => row.clause).filter(Boolean) as string[])].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
    )
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false
      }
      if (confidenceFilter !== "all" && row.confidenceLevel !== confidenceFilter) {
        return false
      }
      if (clauseFilter !== "all" && row.clause !== clauseFilter) {
        return false
      }
      if (normalizedSearch && !row.searchText.includes(normalizedSearch)) {
        return false
      }
      return true
    })
  }, [clauseFilter, confidenceFilter, rows, searchQuery, statusFilter])

  const activeRow = useMemo(() => {
    return filteredRows.find((row) => row.requirementId === activeRequirementId) ?? null
  }, [activeRequirementId, filteredRows])

  const activeFeedbackEntry = activeRow
    ? feedbackMap[activeRow.requirementId] ?? createDefaultFeedbackEntry()
    : createDefaultFeedbackEntry()

  useEffect(() => {
    if (!activeRow) {
      setDraftComment("")
      return
    }
    setDraftComment(activeFeedbackEntry.comment)
  }, [activeFeedbackEntry.comment, activeRow])

  useEffect(() => {
    if (activeRequirementId && !filteredRows.some((row) => row.requirementId === activeRequirementId)) {
      setActiveRequirementId(null)
    }
    if (expandedRequirementId && !filteredRows.some((row) => row.requirementId === expandedRequirementId)) {
      setExpandedRequirementId(null)
    }
  }, [activeRequirementId, expandedRequirementId, filteredRows])

  useEffect(() => {
    if (!activeRow) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentIndex = filteredRows.findIndex((row) => row.requirementId === activeRow.requirementId)

      if (event.key === "Escape") {
        setActiveRequirementId(null)
        return
      }
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setActiveRequirementId(filteredRows[currentIndex - 1].requirementId)
      }
      if (event.key === "ArrowRight" && currentIndex < filteredRows.length - 1) {
        setActiveRequirementId(filteredRows[currentIndex + 1].requirementId)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeRow, filteredRows])

  const summaryCounts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc[row.status] += 1
        return acc
      },
      {
        PASS: 0,
        FAIL: 0,
        FLAGGED: 0,
        NOT_APPLICABLE: 0,
        ERROR: 0,
      } as Record<ResultsV2Status, number>
    )
  }, [rows])

  const reviewedCount = useMemo(() => {
    return Object.values(feedbackMap).filter((entry) => entry.isHelpful !== null).length
  }, [feedbackMap])

  const handleVote = useCallback(
    async (requirementId: string, vote: "up" | "down") => {
      if (!evaluationId) {
        return
      }

      let nextHelpful: boolean | null = null
      let commentToSend: string | null = null

      setFeedbackMap((prev) => {
        const current = prev[requirementId] ?? createDefaultFeedbackEntry()
        const desired = vote === "up"
        nextHelpful = current.isHelpful === desired ? null : desired
        commentToSend = current.comment.trim().length > 0 ? current.comment : null

        return {
          ...prev,
          [requirementId]: {
            ...current,
            isHelpful: nextHelpful,
            isSaving: true,
            error: null,
          },
        }
      })

      try {
        await api.upsertRequirementFeedback(evaluationId, {
          requirement_id: requirementId,
          is_helpful: nextHelpful,
          comment: commentToSend,
        })

        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: null,
          },
        }))
      } catch (saveError) {
        console.error("Failed to save feedback", saveError)
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: "Failed to save review. Try again.",
          },
        }))
      }
    },
    [evaluationId]
  )

  const saveComment = useCallback(
    async (requirementId: string, comment: string) => {
      if (!evaluationId) {
        return
      }

      const current = feedbackMap[requirementId] ?? createDefaultFeedbackEntry()

      setFeedbackMap((prev) => ({
        ...prev,
        [requirementId]: {
          ...current,
          comment,
          isSaving: true,
          error: null,
        },
      }))

      try {
        await api.upsertRequirementFeedback(evaluationId, {
          requirement_id: requirementId,
          is_helpful: current.isHelpful,
          comment: comment.trim().length > 0 ? comment : null,
        })

        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: null,
          },
        }))
      } catch (saveError) {
        console.error("Failed to save comment", saveError)
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: "Failed to save note. Try again.",
          },
        }))
      }
    },
    [evaluationId, feedbackMap]
  )

  const handleExport = useCallback(() => {
    if (!report || rows.length === 0) {
      return
    }

    const exportRows = rows.map((row) => ({
      "Requirement ID": row.requirementId,
      Clause: row.clause ?? "",
      Title: row.title,
      Status: row.status,
      Confidence: row.confidenceLevel,
      Review: row.reviewLabel,
      "Assessment Summary": row.rationale,
      "Inline Claims": row.inlineClaims.map((claim) => claim.text).join(" | "),
      "Modal Claims": row.modalClaims.map((claim) => claim.text).join(" | "),
      "Full Analysis": row.fullAnalysis.map((block) => `${block.label}: ${block.body}`).join(" | "),
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluation Results V2")

    const timestamp = new Date().toISOString().split("T")[0]
    XLSX.writeFile(workbook, `evaluation-v2-${evaluationId}-${timestamp}.xlsx`)
  }, [evaluationId, report, rows])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading evaluation results...</span>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <span className="text-sm">{error ?? "Report not found"}</span>
      </div>
    )
  }

  const totalRequirements = rows.length
  const overallScore = Number.isFinite(report.overall_score) ? report.overall_score : 0
  const filteredIndex = activeRow
    ? filteredRows.findIndex((row) => row.requirementId === activeRow.requirementId)
    : -1
  const canGoPrev = filteredIndex > 0
  const canGoNext = filteredIndex >= 0 && filteredIndex < filteredRows.length - 1

  return (
    <div className="results-v2 space-y-5">
      {/* ── Main card ── */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">

        {/* ── Header ── */}
        <div className="border-b border-border px-8 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h1 className="relative pb-2 text-lg font-semibold tracking-tight text-foreground after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-10 after:rounded-sm after:bg-sc-gold-dark">
                Compliance Report
              </h1>
              <p className="text-[13px] text-muted-foreground">{report.document_name}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {framework?.standard_reference ? <span>{framework.standard_reference}</span> : null}
                {framework?.standard_reference && framework?.name ? (
                  <span className="text-border">|</span>
                ) : null}
                {framework?.name ? <span>{framework.name}</span> : null}
                <span className="text-border">|</span>
                <span className="font-mono">ID: {report.evaluation_id}</span>
              </div>
            </div>
            <div className="space-y-1 text-left lg:text-right">
              <div className="text-3xl font-semibold leading-none text-foreground">
                {overallScore.toFixed(1)}%
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Overall score
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-8 py-6">

          {/* ── Summary card ── */}
          <div className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Compliance overview
              </span>
              <span className="text-[13px] text-muted-foreground">
                {totalRequirements} requirements assessed
              </span>
            </div>

            {/* Thinner progress bar */}
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="flex h-full w-full">
                <div
                  className="bg-status-fail"
                  style={{ width: `${totalRequirements ? (summaryCounts.FAIL / totalRequirements) * 100 : 0}%` }}
                />
                <div
                  className="bg-status-flagged"
                  style={{ width: `${totalRequirements ? (summaryCounts.FLAGGED / totalRequirements) * 100 : 0}%` }}
                />
                <div
                  className="bg-status-pass"
                  style={{ width: `${totalRequirements ? (summaryCounts.PASS / totalRequirements) * 100 : 0}%` }}
                />
                <div
                  className="bg-status-na"
                  style={{ width: `${totalRequirements ? (summaryCounts.NOT_APPLICABLE / totalRequirements) * 100 : 0}%` }}
                />
                <div
                  className="bg-muted-foreground/20"
                  style={{ width: `${totalRequirements ? (summaryCounts.ERROR / totalRequirements) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Stat items with left color accent bars */}
            <div className="flex flex-wrap gap-y-3 md:flex-nowrap">
              {(
                [
                  ["Fail", summaryCounts.FAIL, "bg-status-fail"],
                  ["Flagged", summaryCounts.FLAGGED, "bg-status-flagged"],
                  ["Pass", summaryCounts.PASS, "bg-status-pass"],
                  ["N/A", summaryCounts.NOT_APPLICABLE, "bg-status-na"],
                  ["Error", summaryCounts.ERROR, "bg-status-fail"],
                ] as const
              ).map(([label, value, colorClass], index, arr) => (
                <div
                  key={label}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 px-4",
                    index < arr.length - 1 && "md:border-r md:border-border",
                    index === 0 && "pl-0",
                    index === arr.length - 1 && "pr-0"
                  )}
                >
                  <div className={cn("h-7 w-[3px] shrink-0 rounded-sm", colorClass)} />
                  <div className="flex flex-col">
                    <span className="text-xl font-bold leading-tight text-foreground">{value}</span>
                    <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="border-t border-border/40 p-4">
            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
              <div className="relative xl:min-w-[240px] xl:flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setExpandedRequirementId(null)
                  }}
                  placeholder="Search requirements..."
                  className="h-9 pl-9 text-[13px]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "all" | ResultsV2Status)
                  setExpandedRequirementId(null)
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              >
                <option value="all">All statuses</option>
                <option value="FAIL">Fail</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PASS">Pass</option>
                <option value="NOT_APPLICABLE">N/A</option>
                <option value="ERROR">Error</option>
              </select>
              <select
                value={clauseFilter}
                onChange={(event) => {
                  setClauseFilter(event.target.value)
                  setExpandedRequirementId(null)
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              >
                <option value="all">All clauses</option>
                {clauseOptions.map((clause) => (
                  <option key={clause} value={clause}>
                    Clause {clause}
                  </option>
                ))}
              </select>
              <select
                value={confidenceFilter}
                onChange={(event) => {
                  setConfidenceFilter(event.target.value as "all" | "low" | "medium" | "high")
                  setExpandedRequirementId(null)
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
              >
                <option value="all">All confidence</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <div className="flex items-center gap-3 xl:ml-auto">
                <span className="text-[13px] text-muted-foreground">
                  Showing {filteredRows.length} of {totalRequirements}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>
            {feedbackLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading review feedback...</span>
              </div>
            ) : null}
            {feedbackError ? (
              <div className="mt-3 rounded-md border border-status-flagged/20 bg-status-flagged-bg px-3 py-2 text-xs text-status-flagged">
                {feedbackError}
              </div>
            ) : null}
          </div>

          {/* ── Table ── */}
          <div className="overflow-x-auto">
              <table className="min-w-full border-collapse bg-background">
                <thead className="bg-muted/60">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Clause</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                        No requirements match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const feedbackEntry = feedbackMap[row.requirementId] ?? createDefaultFeedbackEntry()
                      const isExpanded = expandedRequirementId === row.requirementId

                      return [
                        <tr
                          key={`${row.requirementId}-row`}
                          className="cursor-pointer border-t border-border/40 transition-colors hover:bg-accent/50"
                          onClick={() =>
                            setExpandedRequirementId((current) =>
                              current === row.requirementId ? null : row.requirementId
                            )
                          }
                        >
                          <td className="px-4 py-3 align-middle">
                            <StatusDot status={row.status} label={row.statusLabel} />
                          </td>
                          <td className="px-4 py-3 align-middle font-mono text-xs text-muted-foreground">
                            {row.requirementId}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="space-y-0.5">
                              <div className="text-[13px] font-medium text-foreground">{row.title}</div>
                              <div className="text-[13px] leading-snug text-muted-foreground">
                                {row.tableFinding}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-[13px] text-foreground">
                            {row.clause ?? "\u2014"}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <ConfidenceBar level={row.confidenceLevel} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <ReviewBadge state={row.reviewState} label={row.reviewLabel} />
                              {feedbackEntry.isSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              ) : null}
                            </div>
                          </td>
                        </tr>,
                        isExpanded ? (
                          <tr
                            key={`${row.requirementId}-detail`}
                            className="border-t border-border/40"
                          >
                            <td colSpan={6} className="p-0">
                              <div className="rv2-expansion m-4 bg-muted/30 p-5">
                                <div className="space-y-4">
                                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                                    <div className="space-y-3">
                                      {row.inlineClaims.map((claim) => (
                                        <ClaimSentenceView key={claim.id} claim={claim} compact />
                                      ))}
                                    </div>
                                    <div className="flex flex-col gap-2 lg:min-w-[200px]">
                                      <Button
                                        type="button"
                                        className="justify-center bg-sc text-white hover:bg-sc-dark"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          void handleVote(row.requirementId, "up")
                                        }}
                                      >
                                        <ThumbsUp className="mr-2 h-4 w-4" />
                                        Approve
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="justify-center border-destructive/30 text-destructive hover:bg-status-fail-bg"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          void handleVote(row.requirementId, "down")
                                        }}
                                      >
                                        <ThumbsDown className="mr-2 h-4 w-4" />
                                        Reject
                                      </Button>
                                      <button
                                        type="button"
                                        className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-sc-dark transition-colors hover:text-sc-deep hover:underline"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setActiveRequirementId(row.requirementId)
                                        }}
                                      >
                                        View all details
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {feedbackEntry.error ? (
                                    <div className="text-xs text-destructive">{feedbackEntry.error}</div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ]
                    })
                  )}
                </tbody>
              </table>
          </div>

          {/* ── Footer ── */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background px-5 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-sc-gold-dark" />
              <span>
                {reviewedCount} of {totalRequirements} reviewed
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* ── Detail modal ── */}
      {activeRow ? (
        <div className="rv2-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={() => setActiveRequirementId(null)}
          />
          <div className="rv2-modal-card relative flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden border border-border bg-background">
            {/* Modal header */}
            <div className="sticky top-0 z-10 border-b border-border bg-background px-8 py-6" style={{ borderRadius: '16px 16px 0 0' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
                      {activeRow.requirementId}
                    </div>
                    <h2 className="text-xl font-semibold leading-snug text-foreground">{activeRow.title}</h2>
                  </div>
                  {/* Labeled meta items with dividers */}
                  <div className="flex flex-wrap items-center gap-3.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Status</span>
                      <StatusDot status={activeRow.status} label={activeRow.statusLabel} />
                    </div>
                    {activeRow.clause ? (
                      <>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Clause</span>
                          <span className="font-mono text-xs text-foreground">{activeRow.clause}</span>
                        </div>
                      </>
                    ) : null}
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Confidence</span>
                      <ConfidenceBar level={activeRow.confidenceLevel} />
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Review</span>
                      <ReviewBadge state={activeRow.reviewState} label={activeRow.reviewLabel} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRequirementId(null)}
                  aria-label="Close details"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal body + sidebar */}
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rv2-scroll min-h-0 overflow-y-auto px-8 py-6">
                <div className="space-y-6">
                  <section className="space-y-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Claim summary
                    </h3>
                    <div className="space-y-3">
                      {activeRow.modalClaims.map((claim) => (
                        <ClaimSentenceView key={claim.id} claim={claim} />
                      ))}
                    </div>
                  </section>
                  {activeRow.fullAnalysis.map((block) => (
                    <AnalysisBlockView key={block.id} block={block} />
                  ))}
                </div>
              </div>

              <aside className="rv2-scroll flex min-h-0 flex-col border-t border-border bg-muted/30 lg:border-l lg:border-t-0">
                <div className="space-y-5 overflow-y-auto px-5 py-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Review</h3>
                      {activeFeedbackEntry.isSaving ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving...
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 bg-sc text-white hover:bg-sc-dark"
                        onClick={() => void handleVote(activeRow.requirementId, "up")}
                      >
                        <ThumbsUp className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-status-fail-bg"
                        onClick={() => void handleVote(activeRow.requirementId, "down")}
                      >
                        <ThumbsDown className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                    {activeFeedbackEntry.error ? (
                      <div className="text-xs text-destructive">{activeFeedbackEntry.error}</div>
                    ) : null}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Reviewer note</h3>
                    </div>
                    <textarea
                      value={draftComment}
                      onChange={(event) => setDraftComment(event.target.value)}
                      className="min-h-[120px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-sc focus:outline-none focus:ring-2 focus:ring-sc/15"
                      placeholder="Add reviewer context or decision notes..."
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void saveComment(activeRow.requirementId, draftComment)}
                    >
                      Save note
                    </Button>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Confidence note</h3>
                    <div className="rounded-lg border border-border bg-background p-3 text-[13px] italic leading-relaxed text-muted-foreground">
                      {CONFIDENCE_NOTES[activeRow.confidenceLevel]}
                    </div>
                  </section>
                </div>
              </aside>
            </div>

            {/* Modal footer */}
            <div className="flex flex-col gap-3 border-t border-border px-8 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {filteredIndex + 1} of {filteredRows.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    canGoPrev
                      ? setActiveRequirementId(filteredRows[filteredIndex - 1].requirementId)
                      : undefined
                  }
                  disabled={!canGoPrev}
                  className="flex items-center gap-1 rounded-md border border-border bg-muted px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:cursor-default disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    canGoNext
                      ? setActiveRequirementId(filteredRows[filteredIndex + 1].requirementId)
                      : undefined
                  }
                  disabled={!canGoNext}
                  className="flex items-center gap-1 rounded-md border border-border bg-muted px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:cursor-default disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
