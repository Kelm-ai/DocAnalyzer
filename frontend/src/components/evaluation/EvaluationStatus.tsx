import { useEffect, useRef, useState } from "react"
import { FileSearch, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { api } from "@/lib/api"
import type { EvaluationStatus as EvaluationStatusType } from "@/lib/api"
import { useNavigate } from "react-router-dom"

export function EvaluationStatus() {
  const [evaluations, setEvaluations] = useState<EvaluationStatusType[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  const navigate = useNavigate()

  // Load evaluations from API
  const loadEvaluations = async (options: { forceLoading?: boolean; trackRefresh?: boolean } = {}) => {
    const { forceLoading = false, trackRefresh = false } = options
    const shouldShowLoading = forceLoading || !hasLoadedRef.current

    if (shouldShowLoading) {
      setLoading(true)
    }

    if (trackRefresh) {
      setIsRefreshing(true)
    }

    try {
      const data = await api.getEvaluations()
      setEvaluations(data)
      setError(null)
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true
      }
    } catch (err) {
      console.error('Failed to load evaluations:', err)
      setError('Failed to load evaluations')
    } finally {
      if (shouldShowLoading) {
        setLoading(false)
      }

      if (trackRefresh) {
        setIsRefreshing(false)
      }
    }
  }

  useEffect(() => {
    loadEvaluations({ forceLoading: true })

    // Refresh every 10 seconds
    const interval = setInterval(() => loadEvaluations(), 10000)
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />
      case "in_progress":
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "completed":
        return <CheckCircle className="h-4 w-4" />
      case "failed":
      case "error":
        return <AlertCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "success" | "destructive" | "warning" => {
    switch (status) {
      case "pending":
        return "secondary"
      case "in_progress":
        return "warning"
      case "completed":
        return "success"
      case "failed":
      case "error":
        return "destructive"
      default:
        return "default"
    }
  }

  const getTodayCompleted = () => {
    const today = new Date().toDateString()
    return evaluations.filter(e => 
      e.status === "completed" && 
      e.completed_at &&
      new Date(e.completed_at).toDateString() === today
    ).length
  }

  const formatDateTime = (timestamp?: string | null) => {
    if (!timestamp) {
      return "-"
    }

    const date = new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const columns: ColumnDef<EvaluationStatusType>[] = [
      {
        id: "title",
        header: "Document",
        accessorFn: (row) => row.document_name,
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-gray-900">{row.original.document_name}</p>
            <p className="text-xs text-muted-foreground">
              Started {formatDateTime(row.original.created_at)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: {
          headerClassName: "w-[130px]",
          cellClassName: "w-[130px]",
        },
        cell: ({ row }) => (
          <Badge
            variant={getStatusVariant(row.original.status)}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
          >
            {getStatusIcon(row.original.status)}
            <span>{row.original.status.replace(/_/g, " ")}</span>
          </Badge>
        ),
      },
      {
        id: "progress",
        header: "Progress",
        meta: {
          headerClassName: "w-[260px]",
          cellClassName: "w-[260px]",
        },
        cell: ({ row }) => {
          const evaluation = row.original
          if (evaluation.status === "in_progress") {
            const percent = evaluation.metadata?.progress_percent ?? 0
            const completed = evaluation.metadata?.completed_requirements ?? 0
            const total =
              evaluation.metadata?.total_requirements ??
              evaluation.total_requirements ??
              (evaluation.requirements_passed ?? 0) +
                (evaluation.requirements_failed ?? 0) +
                (evaluation.requirements_flagged ?? evaluation.requirements_partial ?? 0) +
                (evaluation.requirements_na ?? 0)
            return (
              <div className="space-y-1 min-w-[110px]">
                <Progress value={percent} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {completed}/{total} requirements
                </p>
              </div>
            )
          }

          if (evaluation.status === "pending") {
            return <span className="text-sm text-muted-foreground">Queued</span>
          }

          if (evaluation.status === "completed") {
            return <span className="text-sm text-muted-foreground">Complete</span>
          }

          if (evaluation.status === "error" || evaluation.status === "failed") {
            return (
              <span className="text-sm text-destructive">
                {evaluation.error_message || "Failed"}
              </span>
            )
          }

          return <span className="text-sm text-muted-foreground">-</span>
        },
      },
      {
        id: "completed",
        header: "Completed",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.completed_at)}
          </span>
        ),
      },
      {
        accessorKey: "overall_compliance_score",
        header: "Score",
        cell: ({ row }) => {
          const score = row.original.overall_compliance_score
          if (typeof score === "number") {
            return (
              <span className="text-sm font-medium">
                {score.toFixed(1)}%
              </span>
            )
          }
          return <span className="text-sm text-muted-foreground">-</span>
        },
      },
      {
        id: "outcomes",
        header: "Outcomes",
        meta: {
          headerClassName: "min-w-[220px]",
          cellClassName: "min-w-[220px]",
        },
        cell: ({ row }) => {
          const { requirements_passed, requirements_failed, requirements_na } = row.original
          const flagged = row.original.requirements_flagged ?? row.original.requirements_partial ?? 0
          return (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                <span>Passed</span>
                <span className="font-semibold">{requirements_passed ?? 0}</span>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                <span>Failed</span>
                <span className="font-semibold">{requirements_failed ?? 0}</span>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <span>Flagged</span>
                <span className="font-semibold">{flagged}</span>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <span>N/A</span>
                <span className="font-semibold">{requirements_na ?? 0}</span>
              </div>
            </div>
          )
        },
      },
    ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading evaluations...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <span className="ml-2 text-destructive">{error}</span>
        <Button onClick={loadEvaluations} variant="outline" className="ml-4">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Evaluations</CardTitle>
            <FileSearch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {evaluations.filter(e => e.status === "in_progress").length}
            </div>
            <p className="text-xs text-muted-foreground">Currently processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queued</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {evaluations.filter(e => e.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground">Ready to process</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getTodayCompleted()}</div>
            <p className="text-xs text-muted-foreground">Successfully evaluated</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evaluation Queue</CardTitle>
          <CardDescription>
            Real-time status of document evaluations. Click a completed row to view detailed results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={evaluations}
            filterPlaceholder="Search evaluations..."
            initialPageSize={25}
            toolbarSlot={
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadEvaluations({ trackRefresh: true })}
                disabled={isRefreshing}
              >
                {isRefreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Refresh
              </Button>
            }
            onRowClick={(row: Row<EvaluationStatusType>) => {
              const evaluation = row.original
              if (evaluation.status === "completed") {
                navigate(`/results/${evaluation.id}`)
              }
            }}
            isRowClickable={(row) => row.original.status === "completed"}
            rowClassName={(row) =>
              row.original.status === "completed"
                ? "hover:bg-muted/60"
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
