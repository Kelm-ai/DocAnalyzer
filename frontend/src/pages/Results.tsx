import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import type { ColumnDef, Row } from "@tanstack/react-table"
import * as XLSX from "xlsx"

import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import type { ComplianceReport, RequirementResult, ExecutiveSummary } from "@/lib/api"
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"

const STATUS_STYLES: Record<string, string> = {
  PASS: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  FAIL: "bg-red-50 text-red-700 border border-red-200",
  FLAGGED: "bg-amber-50 text-amber-700 border border-amber-200",
  PARTIAL: "bg-amber-50 text-amber-700 border border-amber-200",
  NOT_APPLICABLE: "bg-slate-50 text-slate-600 border border-slate-200",
  ERROR: "bg-red-50 text-red-700 border border-red-200",
  FAILED: "bg-red-50 text-red-700 border border-red-200",
}

const DEFAULT_STATUS_STYLE = "bg-slate-100 text-slate-700 border border-slate-200"

type ConfidenceLevel = RequirementResult["confidence_level"]
type AgreementStatus = RequirementResult["agreement_status"]

const CONFIDENCE_LEVEL_META: Record<ConfidenceLevel, { label: string; className: string; sort: number }> = {
  low: {
    label: "Low",
    className: "bg-slate-100 text-slate-600 border border-slate-200",
    sort: 0,
  },
  medium: {
    label: "Medium",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
    sort: 1,
  },
  high: {
    label: "High",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    sort: 2,
  },
}

const DEFAULT_CONFIDENCE_META = {
  label: "Unknown",
  className: "bg-slate-100 text-slate-600 border border-slate-200",
  sort: -1,
}

const AGREEMENT_META: Record<AgreementStatus | "unknown", { label: string; className: string }> = {
  agreement: {
    label: "Agreement",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  conflict: {
    label: "Conflict",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  unknown: {
    label: "Unknown",
    className: "bg-slate-100 text-slate-600 border border-slate-200",
  },
}

function getConfidenceMeta(level?: RequirementResult["confidence_level"]) {
  if (!level) {
    return DEFAULT_CONFIDENCE_META
  }
  return CONFIDENCE_LEVEL_META[level] ?? DEFAULT_CONFIDENCE_META
}

function getAgreementMeta(status?: RequirementResult["agreement_status"]) {
  if (!status) {
    return AGREEMENT_META.unknown
  }
  return AGREEMENT_META[status] ?? AGREEMENT_META.unknown
}

function getConfidenceSortValue(row: RequirementResult) {
  const meta = getConfidenceMeta(row.confidence_level)
  if (meta.sort >= 0) {
    return meta.sort
  }
  if (typeof row.confidence_score === "number") {
    return row.confidence_score
  }
  return -1
}

const AGREEMENT_SORT: Record<AgreementStatus | "unknown", number> = {
  conflict: 2,
  agreement: 1,
  unknown: 0,
}

function getAgreementSortValue(row: RequirementResult) {
  const status = row.agreement_status ?? "unknown"
  return AGREEMENT_SORT[status] ?? AGREEMENT_SORT.unknown
}

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

function formatConfidenceLabel(level?: RequirementResult["confidence_level"]): string {
  return getConfidenceMeta(level).label
}

function truncateText(value: string | null | undefined, length = 140): string {
  if (!value) {
    return "-"
  }
  if (value.length <= length) {
    return value
  }
  return `${value.slice(0, length).trimEnd()}...`
}

function SummaryView({ executiveSummary }: { executiveSummary?: ExecutiveSummary }) {
  if (!executiveSummary) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-medium text-slate-900">No Summary Available</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Executive summary is not available for this evaluation. This may be because the evaluation was run before this feature was added.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { overview, critical_gaps, opportunities_for_improvement } = executiveSummary

  return (
    <div className="space-y-6">
      {/* Executive Overview */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Executive Overview</h2>
          <p className="text-slate-700 leading-relaxed">{overview}</p>
        </CardContent>
      </Card>

      {/* Critical Gaps */}
      {critical_gaps && critical_gaps.length > 0 && (
        <Card className="border-red-200">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <h2 className="text-lg font-semibold text-slate-900">
                Critical Gaps ({critical_gaps.length})
              </h2>
            </div>
            <div className="space-y-4">
              {critical_gaps.map((item, index) => (
                <div
                  key={`gap-${index}`}
                  className="rounded-lg border border-red-100 bg-red-50/50 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className="bg-red-100 text-red-700 border border-red-200">
                      Clause {item.clause}
                    </Badge>
                    <span className="font-medium text-slate-900">{item.title}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">Finding: </span>
                      <span className="text-slate-600">{item.finding}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Recommendation: </span>
                      <span className="text-slate-600">{item.recommendation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Critical Gaps Message */}
      {(!critical_gaps || critical_gaps.length === 0) && (
        <Card className="border-emerald-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <h2 className="text-lg font-semibold text-slate-900">Critical Gaps</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">No critical gaps identified.</p>
          </CardContent>
        </Card>
      )}

      {/* Opportunities for Improvement */}
      {opportunities_for_improvement && opportunities_for_improvement.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-amber-500" />
              <h2 className="text-lg font-semibold text-slate-900">
                Opportunities for Improvement ({opportunities_for_improvement.length})
              </h2>
            </div>
            <div className="space-y-4">
              {opportunities_for_improvement.map((item, index) => (
                <div
                  key={`ofi-${index}`}
                  className="rounded-lg border border-amber-100 bg-amber-50/50 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className="bg-amber-100 text-amber-700 border border-amber-200">
                      Clause {item.clause}
                    </Badge>
                    <span className="font-medium text-slate-900">{item.title}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">Finding: </span>
                      <span className="text-slate-600">{item.finding}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Recommendation: </span>
                      <span className="text-slate-600">{item.recommendation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function Results() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequirementIndex, setSelectedRequirementIndex] = useState<number | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackEntry>>({})
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"table" | "summary">("table")

  const closeDrawer = useCallback(() => setSelectedRequirementIndex(null), [])

  useEffect(() => {
    if (!evaluationId) {
      setError("No evaluation ID provided")
      setLoading(false)
      return
    }

    const loadReport = async () => {
      try {
        setLoading(true)
        const data = await api.getComplianceReport(evaluationId)
        setReport(data)
        setError(null)
      } catch (err) {
        console.error("Failed to load compliance report", err)
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
        const data = await api.getRequirementFeedback(evaluationId)
        if (!Array.isArray(data)) {
          console.error("Unexpected feedback payload", data)
          setFeedbackError("Could not load human feedback. Displaying default values.")
          setFeedbackMap({})
          return
        }
        const mapped = data.reduce<Record<string, FeedbackEntry>>((acc, record) => {
          acc[record.requirement_id] = {
            isHelpful: record.is_helpful,
            comment: record.comment ?? "",
            isSaving: false,
            error: null,
          }
          return acc
        }, {})
        setFeedbackMap(mapped)
        setFeedbackError(null)
      } catch (err) {
        console.error("Failed to load feedback", err)
        setFeedbackError("Could not load human feedback. Displaying default values.")
        setFeedbackMap({})
      } finally {
        setFeedbackLoading(false)
      }
    }

    void loadFeedback()
  }, [evaluationId])

  const totalRequirements = report?.requirements.length ?? 0

  const goToRequirement = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= totalRequirements) {
        return
      }
      setSelectedRequirementIndex(nextIndex)
    },
    [totalRequirements]
  )

  useEffect(() => {
    if (selectedRequirementIndex === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer()
        return
      }

      if (event.key === "ArrowUp") {
        goToRequirement((selectedRequirementIndex ?? 0) - 1)
      }

      if (event.key === "ArrowDown") {
        goToRequirement((selectedRequirementIndex ?? 0) + 1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedRequirementIndex, closeDrawer, goToRequirement])

  const handleVote = useCallback(
    async (requirementId: string, vote: "up" | "down") => {
      if (!evaluationId) {
        return
      }

      let nextIsHelpful: boolean | null = null
      let commentToSend: string | null = null

      setFeedbackMap((prev) => {
        const current = prev[requirementId] ?? createDefaultFeedbackEntry()
        const desired = vote === "up"
        const toggledHelpful = current.isHelpful === desired ? null : desired
        const nextEntry: FeedbackEntry = {
          ...current,
          isHelpful: toggledHelpful,
          isSaving: true,
          error: null,
        }
        commentToSend = nextEntry.comment.trim().length ? nextEntry.comment : null
        nextIsHelpful = nextEntry.isHelpful
        return {
          ...prev,
          [requirementId]: nextEntry,
        }
      })

      try {
        await api.upsertRequirementFeedback(evaluationId, {
          requirement_id: requirementId,
          is_helpful: nextIsHelpful,
          comment: commentToSend,
        })
        setFeedbackMap((prev) => {
          const current = prev[requirementId] ?? createDefaultFeedbackEntry()
          return {
            ...prev,
            [requirementId]: {
              ...current,
              isSaving: false,
              error: null,
            },
          }
        })
      } catch (err) {
        console.error("Failed to save feedback", err)
        setFeedbackMap((prev) => {
          const current = prev[requirementId] ?? createDefaultFeedbackEntry()
          return {
            ...prev,
            [requirementId]: {
              ...current,
              isSaving: false,
              error: "Failed to save feedback. Try again.",
            },
          }
        })
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
          comment: comment.trim().length ? comment : null,
        })
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...prev[requirementId],
            isSaving: false,
            error: null,
          },
        }))
      } catch (err) {
        console.error("Failed to save feedback", err)
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...prev[requirementId],
            isSaving: false,
            error: "Failed to save feedback. Try again.",
          },
        }))
      }
    },
    [evaluationId, feedbackMap]
  )

  const handleCommentClick = useCallback((requirementId: string) => {
    setEditingCommentId(requirementId)
  }, [])

  const handleCommentSave = useCallback(
    async (requirementId: string, comment: string) => {
      await saveComment(requirementId, comment)
      setEditingCommentId(null)
    },
    [saveComment]
  )

  const handleExport = useCallback(() => {
    if (!report || report.requirements.length === 0) {
      return
    }

    const exportRows = report.requirements.map((req) => ({
      "Requirement ID": req.requirement_id || "",
      "Clause": req.requirement_clause || "",
      "Title": req.title || "",
      "Status": (req.status || "PENDING").toUpperCase(),
      "Confidence Level": formatConfidenceLabel(req.confidence_level),
      "Agreement": req.agreement_status ? req.agreement_status.toUpperCase() : "UNKNOWN",
      "Evaluation Rationale": req.evaluation_rationale || "",
      "Evidence Snippets": req.evidence_snippets?.filter(Boolean).join(" | ") || "",
      "Gaps Identified": req.gaps_identified?.filter(Boolean).join(" | ") || "",
      "Recommendations": req.recommendations?.filter(Boolean).join(" | ") || "",
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluation Results")

    const timestamp = new Date().toISOString().split("T")[0]
    const filename = `evaluation-${evaluationId}-${timestamp}.xlsx`
    XLSX.writeFile(workbook, filename)
  }, [report, evaluationId])

  const columns: ColumnDef<RequirementResult>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Requirement",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {row.original.requirement_clause ? (
                <Badge variant="outline" className="px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  Clause {row.original.requirement_clause}
                </Badge>
              ) : null}
            </div>
            <div className="text-sm font-medium text-slate-900">
              {row.original.title || "Untitled requirement"}
            </div>
          </div>
        ),
        filterFn: (row, _columnId, filterValue) => {
          const query = String(filterValue ?? "").trim().toLowerCase()
          if (!query) {
            return true
          }

          const {
            title,
            requirement_id: requirementId,
            evaluation_rationale: evaluationRationale,
            evidence_snippets: evidenceSnippets,
            gaps_identified: gapsIdentified,
            requirement_clause: requirementClause,
          } = row.original

          const searchableFields = [
            title,
            requirementId,
            requirementClause,
            evaluationRationale,
            ...(Array.isArray(evidenceSnippets) ? evidenceSnippets : []),
            ...(Array.isArray(gapsIdentified) ? gapsIdentified : []),
          ].filter((value): value is string => typeof value === "string" && value.length > 0)

          return searchableFields.some((field) => field.toLowerCase().includes(query))
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => {
          const status = (row.original.status || "-").toUpperCase()
          const style = STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE
          return (
            <Badge className={`${style} px-2 py-1 text-xs font-medium`}>
              {status.replace(/_/g, " ")}
            </Badge>
          )
        },
      },
      {
        id: "confidence",
        header: "Confidence",
        enableSorting: true,
        accessorFn: (row) => getConfidenceSortValue(row),
        sortingFn: (a, b) => getConfidenceSortValue(a.original) - getConfidenceSortValue(b.original),
        cell: ({ row }) => {
          const meta = getConfidenceMeta(row.original.confidence_level)
          return (
            <Badge
              variant="outline"
              className={`px-2 py-1 text-xs font-medium ${meta.className}`}
            >
              {meta.label} confidence
            </Badge>
          )
        },
      },
      // Agreement column hidden - uncomment to restore
      // {
      //   id: "agreement",
      //   header: "Agreement",
      //   enableSorting: true,
      //   accessorFn: (row) => getAgreementSortValue(row),
      //   sortingFn: (a, b) => getAgreementSortValue(a.original) - getAgreementSortValue(b.original),
      //   cell: ({ row }) => {
      //     const agreementMeta = getAgreementMeta(row.original.agreement_status)
      //     return (
      //       <Badge
      //         variant="outline"
      //         className={`px-2 py-1 text-xs font-medium ${agreementMeta.className}`}
      //       >
      //         {agreementMeta.label}
      //       </Badge>
      //     )
      //   },
      // },
      // Rationale column hidden - view in sidebar
      // {
      //   id: "rationale",
      //   header: "Rationale",
      //   cell: ({ row }) => (
      //     <p className="text-sm text-slate-600">
      //       {truncateText(row.original.evaluation_rationale, 160)}
      //     </p>
      //   ),
      // },
      // Evidence column hidden - view in sidebar
      // {
      //   id: "evidence",
      //   header: "Evidence",
      //   cell: ({ row }) => {
      //     const evidence = row.original.evidence_snippets?.filter(Boolean) ?? []
      //     if (!evidence.length) {
      //       return <span className="text-sm text-slate-500">-</span>
      //     }
      //     return (
      //       <p className="text-sm text-slate-600">
      //         {truncateText(evidence[0], 120)}
      //         {evidence.length > 1 ? (
      //           <span className="text-xs text-slate-500"> (+{evidence.length - 1} more)</span>
      //         ) : null}
      //       </p>
      //     )
      //   },
      // },
      {
        id: "findings",
        header: "Findings",
        cell: ({ row }) => {
          // For FAIL/FLAGGED show gaps, for PASS show recommendations as OFI
          const status = row.original.status?.toUpperCase()
          const isFailOrFlagged = status === "FAIL" || status === "FLAGGED"
          const items = isFailOrFlagged
            ? (row.original.gaps_identified?.filter(Boolean) ?? [])
            : (row.original.gaps_identified?.filter(Boolean) ?? []) // OFI comes from gaps for PASS
          if (!items.length) {
            return <span className="text-sm text-slate-500">-</span>
          }
          return (
            <p className="text-sm text-slate-600">
              {truncateText(items[0], 120)}
              {items.length > 1 ? (
                <span className="text-xs text-slate-500"> (+{items.length - 1} more)</span>
              ) : null}
            </p>
          )
        },
      },
      // Recommendations column hidden - view in sidebar
      // {
      //   id: "recommendations",
      //   header: "Recommendations",
      //   cell: ({ row }) => {
      //     const recs = row.original.recommendations?.filter(Boolean) ?? []
      //     if (!recs.length) {
      //       return <span className="text-sm text-slate-500">-</span>
      //     }
      //     return (
      //       <p className="text-sm text-slate-600">
      //         {truncateText(recs[0], 120)}
      //         {recs.length > 1 ? (
      //           <span className="text-xs text-slate-500"> (+{recs.length - 1} more)</span>
      //         ) : null}
      //       </p>
      //     )
      //   },
      // },
      {
        id: "humanFeedback",
        header: "Human Feedback",
        cell: ({ row }) => {
          const requirementId = row.original.requirement_id
          const entry = (requirementId ? feedbackMap[requirementId] : null) ??
            createDefaultFeedbackEntry()
          const isUp = entry.isHelpful === true
          const isDown = entry.isHelpful === false

          return (
            <div
              className="flex items-center gap-2"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <Button
                type="button"
                size="icon"
                variant={isUp ? "default" : "outline"}
                className="h-8 w-8"
                onClick={(event) => {
                  event.stopPropagation()
                  if (requirementId) {
                    void handleVote(requirementId, "up")
                  }
                }}
                disabled={!requirementId}
                aria-pressed={isUp}
                aria-label="Mark this evaluation as correct"
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={isDown ? "default" : "outline"}
                className="h-8 w-8"
                onClick={(event) => {
                  event.stopPropagation()
                  if (requirementId) {
                    void handleVote(requirementId, "down")
                  }
                }}
                disabled={!requirementId}
                aria-pressed={isDown}
                aria-label="Mark this evaluation as incorrect"
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
              {entry.isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : null}
            </div>
          )
        },
      },
      {
        id: "humanComment",
        header: "Comments",
        meta: {
          headerClassName: "min-w-[240px]",
          cellClassName: "min-w-[240px]",
        },
        cell: ({ row }) => {
          const requirementId = row.original.requirement_id
          const entry = (requirementId ? feedbackMap[requirementId] : null) ??
            createDefaultFeedbackEntry()
          const isEditing = editingCommentId === requirementId

          if (isEditing) {
            return (
              <div
                className="space-y-1"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <textarea
                  className="h-32 w-full resize-y rounded-md border border-slate-300 p-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Add context for this rating..."
                  defaultValue={entry.comment}
                  autoFocus
                  onBlur={(event) => {
                    if (requirementId) {
                      void handleCommentSave(requirementId, event.target.value)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && requirementId) {
                      setEditingCommentId(null)
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                />
                {entry.error ? (
                  <span className="text-xs text-red-600">{entry.error}</span>
                ) : entry.isSaving ? (
                  <span className="text-xs text-slate-500">Saving...</span>
                ) : null}
              </div>
            )
          }

          return (
            <div
              className="group cursor-pointer space-y-1"
              onClick={(event) => {
                event.stopPropagation()
                if (requirementId) {
                  handleCommentClick(requirementId)
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="min-h-[60px] rounded-md border border-slate-200 p-2 text-sm text-slate-700 group-hover:border-slate-300 group-hover:bg-slate-50">
                {entry.comment || (
                  <span className="text-slate-400">Click to add comment...</span>
                )}
              </div>
              {entry.error ? (
                <span className="text-xs text-red-600">{entry.error}</span>
              ) : null}
            </div>
          )
        },
      },
    ],
    [editingCommentId, feedbackMap, handleCommentClick, handleCommentSave, handleVote]
  )

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center space-x-3">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        <span className="text-sm text-slate-600">Loading evaluation results...</span>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-48 items-center justify-center space-x-2 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <span className="text-sm">{error ?? "Report not found"}</span>
      </div>
    )
  }

  const stats = report.summary_stats
  const totalEvaluated = stats.total_evaluated ?? report.requirements.length

  const passed = stats.passed ?? 0
  const failed = stats.failed ?? 0
  const flagged = (stats.flagged ?? 0) + (stats.partial ?? 0)
  const notApplicable = stats.not_applicable ?? 0

  const overallScore = Number.isFinite(report.overall_score) ? report.overall_score : 0

  const activeRequirement =
    selectedRequirementIndex !== null
      ? report.requirements[selectedRequirementIndex]
      : null
  const isFirstRequirement = selectedRequirementIndex !== null && selectedRequirementIndex <= 0
  const isLastRequirement =
    selectedRequirementIndex !== null && selectedRequirementIndex >= totalRequirements - 1
  const activeFeedbackEntry = activeRequirement
    ? feedbackMap[activeRequirement.requirement_id] ?? createDefaultFeedbackEntry()
    : createDefaultFeedbackEntry()
  const activeConfidenceMeta = activeRequirement
    ? getConfidenceMeta(activeRequirement.confidence_level)
    : DEFAULT_CONFIDENCE_META
  const activeAgreementMeta = activeRequirement
    ? getAgreementMeta(activeRequirement.agreement_status)
    : AGREEMENT_META.unknown

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-slate-900">Evaluation Results</h1>
              <p className="text-sm text-slate-600">{report.document_name}</p>
              <p className="text-xs text-slate-500">Evaluation ID: {report.evaluation_id}</p>
              <p className="text-xs text-slate-500">Generated on {new Date().toLocaleString()}</p>
            </div>
            <div className="text-right">
              <span className="block text-3xl font-semibold text-slate-900">
                {overallScore.toFixed(1)}%
              </span>
              <span className="text-sm text-slate-500">Overall score</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Total requirements</p>
              <p className="text-xl font-semibold text-slate-900">{totalEvaluated}</p>
            </div>
            <div className="rounded-md border bg-emerald-50 p-4">
              <p className="text-xs text-emerald-600">Passed</p>
              <p className="text-xl font-semibold text-emerald-700">{passed}</p>
            </div>
            <div className="rounded-md border bg-red-50 p-4">
              <p className="text-xs text-red-600">Failed</p>
              <p className="text-xl font-semibold text-red-700">{failed}</p>
            </div>
            <div className="rounded-md border bg-amber-50 p-4">
              <p className="text-xs text-amber-600">Flagged</p>
              <p className="text-xl font-semibold text-amber-700">{flagged}</p>
            </div>
            <div className="rounded-md border bg-slate-100 p-4">
              <p className="text-xs text-slate-600">Not applicable</p>
              <p className="text-xl font-semibold text-slate-700">{notApplicable}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "table" | "summary")}>
        <TabsList className="mb-4">
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 space-y-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Requirement breakdown</h2>
                  <p className="text-sm text-slate-600">
                    Each row represents the evaluation outcome for a single ISO 14971 requirement.
                  </p>
                </div>
                {feedbackLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading human feedback...</span>
                  </div>
                ) : null}
                {feedbackError ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                    {feedbackError}
                  </div>
                ) : null}
              </div>
              <DataTable
                columns={columns}
                data={report.requirements}
                filterPlaceholder="Filter requirements..."
                initialPageSize={25}
                toolbarSlot={
                  <Button
                    onClick={handleExport}
                    disabled={!report || report.requirements.length === 0}
                    size="sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export to Excel
                  </Button>
                }
                onRowClick={(row: Row<RequirementResult>) => {
                  const clickedIndex = report.requirements.findIndex(
                    (item: RequirementResult) => item.requirement_id === row.original.requirement_id
                  )
                  if (clickedIndex >= 0) {
                    setSelectedRequirementIndex(clickedIndex)
                  } else {
                    setSelectedRequirementIndex(row.index ?? 0)
                  }
                }}
                isRowClickable={() => true}
                rowClassName={() => "hover:bg-slate-50"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <SummaryView executiveSummary={report.executive_summary} />
        </TabsContent>
      </Tabs>

      {activeRequirement ? (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-slate-900/40"
            aria-hidden="true"
            onClick={closeDrawer}
          />
          <aside className="relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-slate-200 p-6">
              <div className="space-y-1">
                <p className="text-xs font-mono uppercase tracking-wide text-slate-500">
                  {activeRequirement.requirement_id || "Requirement"}
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeRequirement.title || "Untitled requirement"}
                </h2>
                {activeRequirement.requirement_clause ? (
                  <span className="text-xs font-semibold text-slate-600">
                    Clause {activeRequirement.requirement_clause}
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={`${
                      STATUS_STYLES[(activeRequirement.status || "").toUpperCase()] ??
                      DEFAULT_STATUS_STYLE
                    } px-2 py-1 text-xs font-medium`}
                  >
                    {(activeRequirement.status || "").replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`px-2 py-1 text-xs font-medium ${activeConfidenceMeta.className}`}
                  >
                    {activeConfidenceMeta.label} confidence
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`px-2 py-1 text-xs font-medium ${activeAgreementMeta.className}`}
                  >
                    {activeAgreementMeta.label}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">
                  {(selectedRequirementIndex ?? 0) + 1} of {totalRequirements}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => goToRequirement((selectedRequirementIndex ?? 0) - 1)}
                    disabled={isFirstRequirement}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => goToRequirement((selectedRequirementIndex ?? 0) + 1)}
                    disabled={isLastRequirement}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={closeDrawer}
                    aria-label="Close details"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </header>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Human feedback</h3>
                  {activeFeedbackEntry.isSaving ? (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant={activeFeedbackEntry.isHelpful === true ? "default" : "outline"}
                    className="h-8 w-8"
                    onClick={() =>
                      activeRequirement?.requirement_id
                        ? handleVote(activeRequirement.requirement_id, "up")
                        : undefined
                    }
                    disabled={!activeRequirement?.requirement_id}
                    aria-pressed={activeFeedbackEntry.isHelpful === true}
                    aria-label="Mark this evaluation as correct"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant={activeFeedbackEntry.isHelpful === false ? "default" : "outline"}
                    className="h-8 w-8"
                    onClick={() =>
                      activeRequirement?.requirement_id
                        ? handleVote(activeRequirement.requirement_id, "down")
                        : undefined
                    }
                    disabled={!activeRequirement?.requirement_id}
                    aria-pressed={activeFeedbackEntry.isHelpful === false}
                    aria-label="Mark this evaluation as incorrect"
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
                {editingCommentId === activeRequirement?.requirement_id ? (
                  <div className="space-y-1">
                    <textarea
                      className="h-32 w-full resize-y rounded-md border border-slate-300 p-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Add context for this rating..."
                      defaultValue={activeFeedbackEntry.comment}
                      autoFocus
                      onBlur={(event) => {
                        if (activeRequirement?.requirement_id) {
                          void handleCommentSave(activeRequirement.requirement_id, event.target.value)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEditingCommentId(null)
                        }
                      }}
                    />
                    {activeFeedbackEntry.error ? (
                      <span className="text-xs text-red-600">{activeFeedbackEntry.error}</span>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="group cursor-pointer space-y-1"
                    onClick={() => {
                      if (activeRequirement?.requirement_id) {
                        handleCommentClick(activeRequirement.requirement_id)
                      }
                    }}
                  >
                    <div className="min-h-[80px] rounded-md border border-slate-200 p-2 text-sm text-slate-700 group-hover:border-slate-300 group-hover:bg-slate-50">
                      {activeFeedbackEntry.comment || (
                        <span className="text-slate-400">Click to add comment...</span>
                      )}
                    </div>
                    {activeFeedbackEntry.error ? (
                      <span className="text-xs text-red-600">{activeFeedbackEntry.error}</span>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Evaluation rationale</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {activeRequirement.evaluation_rationale || "No rationale provided."}
                </p>
              </section>

              {/* Show Gaps section only for FAIL/FLAGGED status */}
              {(activeRequirement.status === "FAIL" || activeRequirement.status === "FLAGGED") && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-red-700">Gaps</h3>
                  {activeRequirement.gaps_identified?.filter(Boolean).length ? (
                    <ul className="space-y-2 text-sm text-slate-700">
                      {activeRequirement.gaps_identified
                        .filter(Boolean)
                        .map((item: string, index: number) => (
                          <li
                            key={index}
                            className="rounded-md border border-red-200 bg-red-50 p-3"
                          >
                            {item}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No gaps documented.</p>
                  )}
                </section>
              )}

              {/* Show OFI section only for PASS status - uses gaps_identified field */}
              {activeRequirement.status === "PASS" && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-amber-700">Opportunities for Improvement</h3>
                  {activeRequirement.gaps_identified?.filter(Boolean).length ? (
                    <ul className="space-y-2 text-sm text-slate-700">
                      {activeRequirement.gaps_identified
                        .filter(Boolean)
                        .map((item: string, index: number) => (
                          <li
                            key={index}
                            className="rounded-md border border-amber-200 bg-amber-50 p-3"
                          >
                            {item}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No improvements suggested - requirement is fully satisfied.</p>
                  )}
                </section>
              )}

              {/* Recommendations section - always shown */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-blue-700">Recommendations</h3>
                {activeRequirement.recommendations?.filter(Boolean).length ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeRequirement.recommendations
                      .filter(Boolean)
                      .map((item: string, index: number) => (
                        <li
                          key={index}
                          className="rounded-md border border-blue-200 bg-blue-50 p-3"
                        >
                          {item}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No recommendations provided.</p>
                )}
              </section>

              {/* Evidence section moved to the bottom */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
                {activeRequirement.evidence_snippets?.filter(Boolean).length ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeRequirement.evidence_snippets
                      .filter(Boolean)
                      .map((item: string, index: number) => (
                        <li
                          key={index}
                          className="rounded-md border border-slate-200 bg-slate-50 p-3"
                        >
                          {item}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No evidence captured.</p>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
