import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import type { ColumnDef, Row } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { ComplianceReport, RequirementResult } from "@/lib/api"
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
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

function formatPercent(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "—"
  }
  const normalized = score > 1 ? score : score * 100
  return `${Math.round(normalized)}%`
}

function truncateText(value: string | null | undefined, length = 140): string {
  if (!value) {
    return "—"
  }
  if (value.length <= length) {
    return value
  }
  return `${value.slice(0, length).trimEnd()}…`
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

  const columns: ColumnDef<RequirementResult>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Requirement",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-900">
              {row.original.title || "Untitled requirement"}
            </div>
            <div className="text-xs font-mono text-slate-500">
              {row.original.requirement_id || "—"}
            </div>
          </div>
        ),
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
        accessorFn: (row) => row.confidence_score ?? -1,
        sortingFn: (a, b) => {
          const left = a.original.confidence_score ?? -1
          const right = b.original.confidence_score ?? -1
          return left - right
        },
        cell: ({ row }) => (
          <span className="text-sm text-slate-900">
            {formatPercent(row.original.confidence_score)}
          </span>
        ),
      },
      {
        id: "rationale",
        header: "Rationale",
        cell: ({ row }) => (
          <p className="text-sm text-slate-600">
            {truncateText(row.original.evaluation_rationale, 160)}
          </p>
        ),
      },
      {
        id: "evidence",
        header: "Evidence",
        cell: ({ row }) => {
          const evidence = row.original.evidence_snippets?.filter(Boolean) ?? []
          if (!evidence.length) {
            return <span className="text-sm text-slate-500">—</span>
          }
          return (
            <p className="text-sm text-slate-600">
              {truncateText(evidence[0], 120)}
              {evidence.length > 1 ? (
                <span className="text-xs text-slate-500"> (+{evidence.length - 1} more)</span>
              ) : null}
            </p>
          )
        },
      },
      {
        id: "gaps",
        header: "Gaps",
        cell: ({ row }) => {
          const gaps = row.original.gaps_identified?.filter(Boolean) ?? []
          if (!gaps.length) {
            return <span className="text-sm text-slate-500">—</span>
          }
          return (
            <p className="text-sm text-slate-600">
              {truncateText(gaps[0], 120)}
              {gaps.length > 1 ? (
                <span className="text-xs text-slate-500"> (+{gaps.length - 1} more)</span>
              ) : null}
            </p>
          )
        },
      },
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
                  <span className="text-xs text-slate-500">Saving…</span>
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
        <span className="text-sm text-slate-600">Loading evaluation results…</span>
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

  const stats = report.summary_stats ?? {}
  const totalEvaluated =
    (typeof stats.total_evaluated === "number" ? stats.total_evaluated : undefined) ??
    (typeof stats.total === "number" ? stats.total : undefined) ??
    report.requirements.length

  const passed = (typeof stats.passed === "number" ? stats.passed : undefined) ?? 0
  const failed = (typeof stats.failed === "number" ? stats.failed : undefined) ?? 0
  const flagged =
    (typeof stats.flagged === "number" ? stats.flagged : undefined) ??
    (typeof stats.partial === "number" ? stats.partial : undefined) ?? 0
  const notApplicable =
    (typeof stats.not_applicable === "number" ? stats.not_applicable : undefined) ??
    (typeof stats.na === "number" ? stats.na : undefined) ?? 0

  const rawScore =
    (typeof report.overall_score === "number" ? report.overall_score : undefined) ??
    (typeof stats.score === "number" ? stats.score : undefined) ??
    0
  const overallScore = Number.isFinite(rawScore) ? rawScore : 0

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
                <span>Loading human feedback…</span>
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
            tableContainerClassName="max-h-[480px] overflow-y-auto"
          />
        </CardContent>
      </Card>

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
                <div className="flex items-center gap-2">
                  <Badge
                    className={`${
                      STATUS_STYLES[(activeRequirement.status || "").toUpperCase()] ??
                      DEFAULT_STATUS_STYLE
                    } px-2 py-1 text-xs font-medium`}
                  >
                    {(activeRequirement.status || "").replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    Confidence {formatPercent(activeRequirement.confidence_score)}
                  </span>
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
                      Saving…
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

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
                {activeRequirement.evidence_snippets?.length ? (
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

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Gaps</h3>
                {activeRequirement.gaps_identified?.length ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeRequirement.gaps_identified
                      .filter(Boolean)
                      .map((item: string, index: number) => (
                        <li
                          key={index}
                          className="rounded-md border border-slate-200 bg-rose-50/80 p-3"
                        >
                          {item}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No gaps were identified.</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Recommendations</h3>
                {activeRequirement.recommendations?.length ? (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {activeRequirement.recommendations
                      .filter(Boolean)
                      .map((item: string, index: number) => (
                        <li
                          key={index}
                          className="rounded-md border border-slate-200 bg-blue-50 p-3"
                        >
                          {item}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No recommendations provided.</p>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
