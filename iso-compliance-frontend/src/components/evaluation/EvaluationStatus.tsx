import { useState, useEffect } from "react"
import { FileSearch, Clock, CheckCircle, AlertCircle, Loader2, Eye } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { EvaluationStatus as EvaluationStatusType } from "@/lib/api"
import { useNavigate } from "react-router-dom"

export function EvaluationStatus() {
  const [evaluations, setEvaluations] = useState<EvaluationStatusType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Load evaluations from API
  const loadEvaluations = async () => {
    try {
      setLoading(true)
      const data = await api.getEvaluations()
      setEvaluations(data)
      setError(null)
    } catch (err) {
      console.error('Failed to load evaluations:', err)
      setError('Failed to load evaluations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvaluations()
    
    // Refresh every 10 seconds
    const interval = setInterval(loadEvaluations, 10000)
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
      case "error":
        return "destructive"
      default:
        return "default"
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const getTodayCompleted = () => {
    const today = new Date().toDateString()
    return evaluations.filter(e => 
      e.status === "completed" && 
      e.completed_at &&
      new Date(e.completed_at).toDateString() === today
    ).length
  }

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
            Real-time status of document evaluations against ISO 14971 requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evaluations.length === 0 ? (
            <div className="text-center py-8">
              <FileSearch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No evaluations found</p>
              <p className="text-xs text-muted-foreground">Upload a document to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {evaluations.map(evaluation => (
                <div key={evaluation.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-semibold">{evaluation.document_name}</h4>
                        <Badge variant={getStatusVariant(evaluation.status)}>
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(evaluation.status)}
                            <span className="ml-1">{evaluation.status.replace("_", " ")}</span>
                          </span>
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Started at {formatTime(evaluation.created_at)}
                        {evaluation.completed_at && (
                          <> • Completed at {formatTime(evaluation.completed_at)}</>
                        )}
                      </p>
                    </div>
                    {evaluation.status === "completed" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate(`/results/${evaluation.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Results
                      </Button>
                    )}
                  </div>

                  {evaluation.status === "in_progress" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {evaluation.metadata?.status_message || "Evaluating against 38 ISO 14971 requirements"}
                        </span>
                        <span className="text-muted-foreground">
                          {evaluation.metadata?.progress_percent !== undefined 
                            ? `${evaluation.metadata.progress_percent}%` 
                            : "Processing..."}
                        </span>
                      </div>
                      <Progress 
                        value={evaluation.metadata?.progress_percent || 0} 
                        className="h-2" 
                      />
                      {evaluation.metadata?.completed_requirements !== undefined && (
                        <p className="text-xs text-muted-foreground text-center">
                          {evaluation.metadata.completed_requirements}/{evaluation.metadata.total_requirements} requirements evaluated
                        </p>
                      )}
                    </div>
                  )}

                  {evaluation.status === "completed" && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {evaluation.requirements_passed || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Passed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">
                          {evaluation.requirements_failed || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-yellow-600">
                          {evaluation.requirements_partial || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Partial</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-400">
                          {evaluation.requirements_na || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">N/A</p>
                      </div>
                    </div>
                  )}

                  {evaluation.overall_compliance_score !== undefined && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Overall Compliance Score</span>
                        <Badge variant={evaluation.overall_compliance_score >= 75 ? "success" : 
                                     evaluation.overall_compliance_score >= 50 ? "warning" : "destructive"}>
                          {evaluation.overall_compliance_score.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  )}

                  {(evaluation.status === "pending" || evaluation.status === "in_progress") && (
                    <p className="text-sm text-muted-foreground">
                      {evaluation.status === "pending" ? "Document uploaded, queued for evaluation" : "Document uploaded, ready for evaluation"}
                    </p>
                  )}

                  {evaluation.status === "error" && evaluation.error_message && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                      {evaluation.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}