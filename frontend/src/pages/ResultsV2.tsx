import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "react-router-dom"
import { exportToExcel } from "@/lib/excel-export"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  Search,
  Square,
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
  type CitationReference,
  type NarrativeItem,
  type RequirementDetailViewModel,
  type ResultsV2ReviewState,
  type ResultsV2Status,
  type SourceGroup,
} from "@/lib/results-v2"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ExecutiveSummaryView } from "@/components/results/ExecutiveSummaryView"

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

function formatSourceLabel(source: CitationReference, index: number): string {
  if (typeof source.label === "string" && source.label.trim().length > 0) {
    return source.label.trim()
  }
  if (source.page_number != null) {
    return `p.${source.page_number}`
  }
  return `Evidence ${index + 1}`
}

function SourceChip({
  source,
  index,
  onHover,
  onLeave,
  onClick,
}: {
  source: CitationReference
  index: number
  onHover?: (pill: HTMLElement, source: CitationReference) => void
  onLeave?: () => void
  onClick?: () => void
}) {
  return (
    <span
      className="rv2-citation-pill"
      onMouseEnter={(e) => onHover?.(e.currentTarget, source)}
      onMouseLeave={() => onLeave?.()}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {formatSourceLabel(source, index)}
    </span>
  )
}

function StatementContent({
  item,
  requirementId,
  compact = false,
  maxPills = 2,
  onShowTooltip,
  onHideTooltip,
  onOpenModal,
}: {
  item: NarrativeItem
  requirementId: string
  compact?: boolean
  maxPills?: number
  onShowTooltip?: (pill: HTMLElement, source: CitationReference) => void
  onHideTooltip?: () => void
  onOpenModal?: (requirementId: string) => void
}) {
  const visibleCitations = item.citations.slice(0, maxPills)
  const remainingCount = item.citations.length - visibleCitations.length

  return (
    <div className="space-y-2">
      <div className={cn("leading-relaxed text-foreground", compact ? "text-[13px]" : "text-sm")}>{item.text}</div>
      {item.citations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleCitations.map((source, index) => (
            <SourceChip
              key={`${item.id}-source-${index}`}
              source={source}
              index={index}
              onHover={onShowTooltip}
              onLeave={onHideTooltip}
              onClick={() => onOpenModal?.(requirementId)}
            />
          ))}
          {remainingCount > 0 ? (
            <span
              className="rv2-citation-pill rv2-citation-more"
              onClick={(e) => {
                e.stopPropagation()
                onOpenModal?.(requirementId)
              }}
              onMouseEnter={(e) => {
                onShowTooltip?.(e.currentTarget, {
                  label: `${item.citations.length} sources`,
                  location: "",
                  excerpt: `${item.citations.length} source citations back this statement. Click to see all in the detail view.`,
                })
              }}
              onMouseLeave={() => onHideTooltip?.()}
            >
              +{remainingCount} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
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

function NarrativeItemView({
  item,
  requirementId,
  compact = false,
  onShowTooltip,
  onHideTooltip,
  onOpenModal,
}: {
  item: NarrativeItem
  requirementId: string
  compact?: boolean
  onShowTooltip?: (pill: HTMLElement, source: CitationReference) => void
  onHideTooltip?: () => void
  onOpenModal?: (requirementId: string) => void
}) {
  return (
    <div className={cn("space-y-1.5 leading-relaxed", compact ? "text-[13px]" : "text-sm")}>
      {item.label ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {item.label}
        </div>
      ) : null}
      <StatementContent
        item={item}
        requirementId={requirementId}
        compact={compact}
        onShowTooltip={onShowTooltip}
        onHideTooltip={onHideTooltip}
        onOpenModal={onOpenModal}
      />
    </div>
  )
}

function SourcesSection({
  groups,
  totalSources,
  focusedStatementId,
  sectionRef,
}: {
  groups: SourceGroup[]
  totalSources: number
  focusedStatementId: string | null
  sectionRef: { current: HTMLElement | null }
}) {
  const evidenceGroups = groups.filter(
    (g) => g.label === "Document evidence" || g.label === "Finding"
  )
  const actionGroups = groups.filter(
    (g) => g.label === "Needs verification"
      || g.label === "Observed limitation"
      || g.label === "Opportunity for improvement"
  )
  const evidenceSourceCount = evidenceGroups.reduce((n, g) => n + g.sources.length, 0)

  if (evidenceGroups.length === 0 && actionGroups.length === 0) {
    return null
  }

  return (
    <section ref={sectionRef} className="space-y-4">
      {evidenceGroups.length > 0 && (
        <>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Supporting Evidence ({evidenceSourceCount})
          </h3>
          <div className="space-y-3">
            {evidenceGroups.map((group) => (
              <section
                key={group.id}
                className={cn(
                  "rv2-modal-citations-block",
                  focusedStatementId && group.statementId === focusedStatementId
                    ? "ring-1 ring-sc/20"
                    : ""
                )}
              >
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {group.label}
                </h4>
                <div className="rv2-modal-citations-grid">
                  {group.sources.map((source, index) => (
                    <div key={`${group.id}-source-${index}`} className="rv2-modal-cite-card">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="rv2-modal-cite-ref">
                          {formatSourceLabel(source, index)}
                        </span>
                        {source.page_number != null ? (
                          <span className="rv2-modal-cite-page">p. {source.page_number}</span>
                        ) : source.location ? (
                          <span className="rv2-modal-cite-page">{source.location}</span>
                        ) : null}
                      </div>
                      {source.document_name ? (
                        <div className="text-[10px] text-muted-foreground mt-1">{source.document_name}</div>
                      ) : null}
                      <p className="rv2-modal-cite-text">{source.excerpt}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {actionGroups.length > 0 && (
        <div className="space-y-3">
          {actionGroups.map((group) => (
            <section
              key={group.id}
              className={cn(
                "rounded-xl border border-status-flagged/20 bg-status-flagged-bg/30 px-5 py-4",
                focusedStatementId && group.statementId === focusedStatementId
                  ? "ring-1 ring-sc/20"
                  : ""
              )}
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">
                {group.label}
              </h4>
              <ul className="space-y-2">
                {group.sources.map((source, index) => (
                  <li key={`${group.id}-source-${index}`} className="flex items-start gap-2.5">
                    <Square className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-flagged/60" />
                    <span className="text-sm leading-relaxed text-foreground">
                      {source.excerpt}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
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
  const [activeTab, setActiveTab] = useState<"summary" | "details">("details")
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null)
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null)
  const [focusedSourceTarget, setFocusedSourceTarget] = useState<{ requirementId: string; statementId: string } | null>(null)
  const [scrollSourcesOnOpen, setScrollSourcesOnOpen] = useState(false)
  const [draftComment, setDraftComment] = useState("")
  const sourcesSectionRef = useRef<HTMLElement | null>(null)

  /* ── Citation tooltip state ───────────────────── */
  const [tooltip, setTooltip] = useState<{ visible: boolean; top: number; left: number; source: CitationReference | null }>({
    visible: false, top: 0, left: 0, source: null,
  })
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showCitationTooltip = useCallback((pill: HTMLElement, source: CitationReference) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    setTooltip({ visible: true, top: -9999, left: -9999, source })
    requestAnimationFrame(() => {
      const el = tooltipRef.current
      if (!el) return
      const rect = pill.getBoundingClientRect()
      const tw = el.offsetWidth
      const th = el.offsetHeight
      let left = rect.left + rect.width / 2 - tw / 2
      let top = rect.top - th - 10
      if (top < 8) top = rect.bottom + 10
      if (left < 8) left = 8
      if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8
      setTooltip({ visible: true, top, left, source })
    })
  }, [])

  const hideCitationTooltip = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip((prev) => ({ ...prev, visible: false }))
    }, 120)
  }, [])

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
        const clauseLeft = left.clause ?? ""
        const clauseRight = right.clause ?? ""
        const clauseDiff = clauseLeft.localeCompare(clauseRight, undefined, {
          numeric: true,
          sensitivity: "base",
        })
        if (clauseDiff !== 0) {
          return clauseDiff
        }

        const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
        if (statusDiff !== 0) {
          return statusDiff
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
      setFocusedSourceTarget(null)
      setScrollSourcesOnOpen(false)
      return
    }

    if (
      focusedSourceTarget &&
      (focusedSourceTarget.requirementId !== activeRow.requirementId ||
        !activeRow.sourceGroups.some((group) => group.statementId === focusedSourceTarget.statementId))
    ) {
      setFocusedSourceTarget(null)
    }

    if (!scrollSourcesOnOpen || !sourcesSectionRef.current) {
      return
    }

    sourcesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    setScrollSourcesOnOpen(false)
  }, [activeRow, focusedSourceTarget, scrollSourcesOnOpen])

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

    const timestamp = new Date().toISOString().split("T")[0]

    exportToExcel({
      sheetName: "Evaluation Results",
      filename: `evaluation-v2-${evaluationId}-${timestamp}.xlsx`,
      statusKey: "status",
      columns: [
        { header: "Requirement ID", key: "requirementId", width: 18 },
        { header: "Clause", key: "clause", width: 10 },
        { header: "Title", key: "title", width: 30 },
        { header: "Status", key: "status", width: 16 },
        { header: "Confidence", key: "confidence", width: 14 },
        { header: "Review", key: "review", width: 12 },
        { header: "Reviewer Notes", key: "reviewerNotes", width: 40, wrap: true },
        { header: "Assessment Summary", key: "assessment", width: 50, wrap: true },
        { header: "Finding", key: "finding", width: 50, wrap: true },
        { header: "Evidence", key: "evidence", width: 40, wrap: true },
        { header: "Caveat", key: "caveat", width: 40, wrap: true },
        { header: "Detailed Summary", key: "modalSummary", width: 50, wrap: true },
        { header: "Detailed Evidence", key: "modalEvidence", width: 50, wrap: true },
        { header: "Sources", key: "sources", width: 10 },
      ],
      rows: rows.map((row) => ({
        requirementId: row.requirementId,
        clause: row.clause ?? "",
        title: row.title,
        status: row.status,
        confidence: row.confidenceLevel,
        review: row.reviewLabel,
        reviewerNotes: feedbackMap[row.requirementId]?.comment ?? "",
        assessment: row.rationale,
        finding: row.inlineFinding.text,
        evidence: row.inlineEvidence?.text ?? "",
        caveat: row.inlineCaveat?.text ?? "",
        modalSummary: row.modalSummary,
        modalEvidence: row.modalEvidence
          .map((item) => `${item.label ?? "Detail"}: ${item.text}`)
          .join("\n\n"),
        sources: row.totalSources,
      })),
    })
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
  const activeSourceGroups = activeRow?.sourceGroups ?? []

  return (
    <div className="results-v2 space-y-6">
      {/* ── DIV 1: Header + stat breakdown ── */}
      <div className="space-y-5 rounded-xl border border-border/60 bg-background p-6" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{framework?.name ?? 'Compliance Report'}</p>
            <h1 className="relative pb-2 text-lg font-semibold tracking-tight text-foreground after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-10 after:rounded-sm after:bg-sc-gold-dark">
              {report.document_name}
            </h1>
            {framework?.standard_reference ? (
              <p className="text-xs text-muted-foreground">{framework.standard_reference}</p>
            ) : null}
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

        {/* Compliance overview panel */}
        <div className="space-y-5 pt-4 border-t border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Compliance overview
            </span>
            <span className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">{totalRequirements}</span> requirements assessed
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 overflow-hidden rounded-full bg-muted">
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
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "summary" | "details"); setActiveRequirementId(null) }}>
        <TabsList>
          <TabsTrigger value="summary">Executive Summary</TabsTrigger>
          <TabsTrigger value="details">Detailed Results</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <ExecutiveSummaryView executiveSummary={report.executive_summary} />
        </TabsContent>

        <TabsContent value="details" className="space-y-6">
      {/* ── DIV 2: Filter bar ── */}
      <div className="rounded-xl border border-border/60 bg-background p-5" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
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

      {/* ── DIV 3: Table ── */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-background" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse bg-background">
              <thead className="bg-muted/60">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Clause</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
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
                        <td className="px-4 py-3 align-middle">
                          <div className="space-y-0.5">
                            <div className="text-[13px] font-medium text-foreground">{row.title}</div>
                            <div className="text-[13px] leading-snug text-muted-foreground">{row.tableFinding}</div>
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
                          <td colSpan={5} className="p-0">
                            <div className="rv2-expansion m-4 bg-muted/30 p-5">
                              <div className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                                  <div className="space-y-3">
                                    <NarrativeItemView
                                      item={row.inlineFinding}
                                      requirementId={row.requirementId}
                                      compact
                                      onShowTooltip={showCitationTooltip}
                                      onHideTooltip={hideCitationTooltip}
                                      onOpenModal={(reqId) => setActiveRequirementId(reqId)}
                                    />
                                    {row.inlineCaveat ? (
                                      <NarrativeItemView
                                        item={row.inlineCaveat}
                                        requirementId={row.requirementId}
                                        compact
                                        onShowTooltip={showCitationTooltip}
                                        onHideTooltip={hideCitationTooltip}
                                        onOpenModal={(reqId) => setActiveRequirementId(reqId)}
                                      />
                                    ) : null}
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

        {/* Footer */}
        <div className="px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border/40">
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

        </TabsContent>
      </Tabs>

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
                  {activeRow.modalSummary !== activeRow.inlineFinding.text ? (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Summary
                      </h3>
                      <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground">
                        {activeRow.modalSummary}
                      </div>
                    </section>
                  ) : null}
                  <section className="space-y-3">
                    <div className="space-y-3">
                      <NarrativeItemView
                        item={activeRow.inlineFinding}
                        requirementId={activeRow.requirementId}
                        onShowTooltip={showCitationTooltip}
                        onHideTooltip={hideCitationTooltip}
                        onOpenModal={() => sourcesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      />
                      {activeRow.inlineCaveat ? (
                        <NarrativeItemView
                          item={activeRow.inlineCaveat}
                          requirementId={activeRow.requirementId}
                          onShowTooltip={showCitationTooltip}
                          onHideTooltip={hideCitationTooltip}
                          onOpenModal={() => sourcesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        />
                      ) : null}
                    </div>
                  </section>
                  <SourcesSection
                    groups={activeSourceGroups}
                    totalSources={activeRow.totalSources}
                    focusedStatementId={
                      focusedSourceTarget?.requirementId === activeRow.requirementId
                        ? focusedSourceTarget.statementId
                        : null
                    }
                    sectionRef={sourcesSectionRef}
                  />
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

      {/* Citation tooltip — singleton portal */}
      {createPortal(
        <div
          ref={tooltipRef}
          className={`rv2-cite-tooltip${tooltip.visible ? " visible" : ""}`}
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.source ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="rv2-cite-tooltip-source">
                  {formatSourceLabel(tooltip.source, 0)}
                </span>
                {tooltip.source.page_number != null ? (
                  <span className="rv2-cite-tooltip-page">p. {tooltip.source.page_number}</span>
                ) : tooltip.source.location ? (
                  <span className="rv2-cite-tooltip-page">{tooltip.source.location}</span>
                ) : null}
              </div>
              {tooltip.source.document_name ? (
                <div className="rv2-cite-tooltip-page mb-1">{tooltip.source.document_name}</div>
              ) : null}
              {tooltip.source.excerpt ? (
                <p className="rv2-cite-tooltip-text">{tooltip.source.excerpt}</p>
              ) : null}
              <div className="rv2-cite-tooltip-hint">Click to view all details</div>
            </>
          ) : null}
        </div>,
        document.body
      )}
    </div>
  )
}
