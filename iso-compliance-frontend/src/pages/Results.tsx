import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/data-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { api } from "@/lib/api"
import type { ComplianceReport, RequirementResult } from "@/lib/api"
import { CheckCircle2, XCircle, AlertCircle, Minus, MoreHorizontal, Loader2, Download, FileText, Clock, Zap, Search, TrendingUp, Eye, ChevronDown, ChevronRight, BarChart3, Target } from "lucide-react"

const getStatusIcon = (status?: string) => {
  switch (status) {
    case "PASS":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />
    case "FAIL":
      return <XCircle className="h-4 w-4 text-red-600" />
    case "PARTIAL":
      return <AlertCircle className="h-4 w-4 text-yellow-600" />
    case "NOT_APPLICABLE":
      return <Minus className="h-4 w-4 text-gray-400" />
    default:
      return null
  }
}

const getStatusBadge = (status?: string) => {
  switch (status) {
    case "PASS":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Pass</Badge>
    case "FAIL":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">Fail</Badge>
    case "PARTIAL":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Partial</Badge>
    case "NOT_APPLICABLE":
      return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">N/A</Badge>
    default:
      return <Badge className="bg-gray-100 text-gray-800">Pending</Badge>
  }
}

const ExpandableRow = ({ requirement }: { requirement: RequirementResult }) => {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-6 w-6 p-0"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {requirement.requirement_id}
            </span>
            <div className="flex items-center space-x-2">
              {getStatusIcon(requirement.status)}
              {getStatusBadge(requirement.status)}
            </div>
          </div>
          <div className="ml-9">
            <h4 className="font-medium text-sm">{requirement.title}</h4>
            {requirement.evaluation_rationale && (
              <p className="text-sm text-muted-foreground mt-1">
                {requirement.evaluation_rationale.length > 150 
                  ? `${requirement.evaluation_rationale.substring(0, 150)}...`
                  : requirement.evaluation_rationale
                }
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          {requirement.confidence_score !== undefined && (
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-3 w-3" />
              <span>{Math.round(requirement.confidence_score)}%</span>
            </div>
          )}
          
          <div className="flex items-center space-x-1">
            <Search className="h-3 w-3" />
            <span>{requirement.evidence_snippets?.length || 0}</span>
          </div>
          
          {requirement.evaluation_duration_ms && (
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>{Math.round(requirement.evaluation_duration_ms / 1000)}s</span>
            </div>
          )}
          
          {requirement.tokens_used && (
            <div className="flex items-center space-x-1">
              <Zap className="h-3 w-3" />
              <span>{requirement.tokens_used}</span>
            </div>
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="ml-9 space-y-4 pt-3 border-t">
          {requirement.gaps_identified && requirement.gaps_identified.length > 0 && (
            <div>
              <h5 className="font-medium text-sm text-red-700 mb-2 flex items-center space-x-1">
                <AlertCircle className="h-4 w-4" />
                <span>Gaps Identified ({requirement.gaps_identified.length})</span>
              </h5>
              <ul className="space-y-1">
                {requirement.gaps_identified.map((gap, index) => (
                  <li key={index} className="text-sm text-red-600 pl-2 border-l-2 border-red-200">
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {requirement.recommendations && requirement.recommendations.length > 0 && (
            <div>
              <h5 className="font-medium text-sm text-blue-700 mb-2 flex items-center space-x-1">
                <CheckCircle2 className="h-4 w-4" />
                <span>Recommendations ({requirement.recommendations.length})</span>
              </h5>
              <ul className="space-y-1">
                {requirement.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-blue-600 pl-2 border-l-2 border-blue-200">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {requirement.evidence_snippets && requirement.evidence_snippets.length > 0 && (
            <div>
              <h5 className="font-medium text-sm text-green-700 mb-2 flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>Evidence Found ({requirement.evidence_snippets.length})</span>
              </h5>
              <div className="space-y-2">
                {requirement.evidence_snippets.slice(0, 3).map((snippet, index) => (
                  <div key={index} className="text-sm bg-green-50 p-2 rounded border-l-2 border-green-200">
                    {snippet.length > 200 ? `${snippet.substring(0, 200)}...` : snippet}
                  </div>
                ))}
                {requirement.evidence_snippets.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{requirement.evidence_snippets.length - 3} more evidence pieces
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const columns: ColumnDef<RequirementResult>[] = [
  {
    accessorKey: "requirement_id",
    header: "ID",
    cell: ({ row }) => (
      <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
        {row.getValue("requirement_id")}
      </div>
    ),
  },
  {
    accessorKey: "title",
    header: "Requirement",
    cell: ({ row }) => (
      <div className="max-w-[400px]">
        <div className="font-medium text-sm mb-1">{row.getValue("title")}</div>
        {row.original.evaluation_rationale && (
          <div className="text-xs text-muted-foreground">
            {row.original.evaluation_rationale.substring(0, 120)}...
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        {getStatusIcon(row.getValue("status"))}
        {getStatusBadge(row.getValue("status"))}
      </div>
    ),
  },
  {
    accessorKey: "confidence_score",
    header: "Confidence",
    cell: ({ row }) => {
      const confidence = row.getValue("confidence_score") as number
      if (!confidence && confidence !== 0) return <span className="text-muted-foreground">-</span>
      
      return (
        <div className="flex items-center space-x-2 min-w-[100px]">
          <Progress value={confidence} className="w-16 h-2" />
          <span className="text-xs font-medium">
            {Math.round(confidence)}%
          </span>
        </div>
      )
    },
  },
  {
    header: "Evidence Quality",
    cell: ({ row }) => {
      const snippets = row.original.evidence_snippets || []
      const searchResults = row.original.search_results || []
      const confidence = row.original.confidence_score || 0
      
      let quality = "Poor"
      let color = "text-red-600"
      
      if (confidence > 80 && snippets.length >= 3) {
        quality = "Excellent"
        color = "text-green-600"
      } else if (confidence > 60 && snippets.length >= 2) {
        quality = "Good"
        color = "text-blue-600"
      } else if (confidence > 40 || snippets.length >= 1) {
        quality = "Fair"
        color = "text-yellow-600"
      }
      
      return (
        <div className="flex items-center space-x-2">
          <div className={`text-xs font-medium ${color}`}>{quality}</div>
          <div className="text-xs text-muted-foreground">
            ({snippets.length} pieces)
          </div>
        </div>
      )
    },
  },
  {
    header: "Gaps & Issues",
    cell: ({ row }) => {
      const gaps = row.original.gaps_identified || []
      return (
        <div className="max-w-[200px]">
          {gaps.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-1">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600">{gaps.length} issues</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {gaps[0]?.substring(0, 100)}...
              </div>
            </div>
          ) : (
            <span className="text-xs text-green-600">✓ No issues</span>
          )}
        </div>
      )
    },
  },
  {
    header: "Recommendations",
    cell: ({ row }) => {
      const recommendations = row.original.recommendations || []
      return (
        <div className="max-w-[200px]">
          {recommendations.length > 0 ? (
            <div className="space-y-1">
              <div className="text-sm font-medium text-blue-600">
                {recommendations.length} actions
              </div>
              <div className="text-xs text-muted-foreground">
                {recommendations[0]?.substring(0, 100)}...
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      )
    },
  },
  {
    header: "Performance",
    cell: ({ row }) => {
      const duration = row.original.evaluation_duration_ms
      const tokens = row.original.tokens_used
      
      return (
        <div className="text-xs text-muted-foreground space-y-1">
          {duration && (
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>{Math.round(duration / 1000)}s</span>
            </div>
          )}
          {tokens && (
            <div className="flex items-center space-x-1">
              <Zap className="h-3 w-3" />
              <span>{tokens}</span>
            </div>
          )}
        </div>
      )
    },
  },
]

export function Results() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadReport = async () => {
      if (!evaluationId) {
        setError("No evaluation ID provided")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const data = await api.getComplianceReport(evaluationId)
        setReport(data)
        setError(null)
      } catch (err) {
        console.error('Failed to load compliance report:', err)
        setError('Failed to load compliance report')
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [evaluationId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading compliance report...</span>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center h-48">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <span className="ml-2 text-destructive">{error || "Report not found"}</span>
      </div>
    )
  }

  const stats = report.summary_stats

  return (
    <div className="space-y-8">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 -mx-6 px-6 py-8 rounded-lg border">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">ISO 14971 Compliance Report</h1>
                <p className="text-blue-600 font-medium">{report.document_name}</p>
              </div>
            </div>
            <p className="text-slate-600 max-w-2xl">
              Comprehensive evaluation against 38 ISO 14971:2019 requirements for medical device risk management
            </p>
            <div className="flex items-center space-x-4 mt-3 text-sm text-slate-500">
              <span>Generated: {new Date().toLocaleDateString()}</span>
              <span>•</span>
              <span>ID: {report.evaluation_id.split('-')[0]}</span>
              <span>•</span>
              <span>{stats.total_evaluated} requirements evaluated</span>
            </div>
          </div>
          
          <div className="flex flex-col items-end space-y-4">
            <div className="text-center bg-white p-4 rounded-xl border shadow-sm min-w-[120px]">
              <div className={`text-4xl font-bold mb-1 ${
                report.overall_score >= 80 ? 'text-green-600' :
                report.overall_score >= 60 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {report.overall_score.toFixed(1)}%
              </div>
              <p className="text-slate-600 text-sm font-medium">Overall Score</p>
            </div>
            
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button variant="outline" size="sm">
                <Eye className="h-4 w-4 mr-2" />
                View Source
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-800">Requirements Passed</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{stats.passed}</div>
            <p className="text-xs text-green-600 font-medium">
              {Math.round((stats.passed / stats.total_evaluated) * 100)}% success rate
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-800">Requirements Failed</CardTitle>
            <XCircle className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">{stats.failed}</div>
            <p className="text-xs text-red-600 font-medium">
              Need immediate attention
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-yellow-800">Partial Compliance</CardTitle>
            <AlertCircle className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-700">{stats.partial}</div>
            <p className="text-xs text-yellow-600 font-medium">
              Require improvements
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">Not Applicable</CardTitle>
            <Minus className="h-5 w-5 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">{stats.not_applicable}</div>
            <p className="text-xs text-gray-500 font-medium">
              Outside scope
            </p>
          </CardContent>
        </Card>
      </div>

      {/* High Risk Findings */}
      {report.high_risk_findings.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span>Critical Compliance Failures</span>
              <Badge variant="destructive">{report.high_risk_findings.length}</Badge>
            </CardTitle>
            <CardDescription>
              Requirements with failed evaluations that require immediate remediation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.high_risk_findings.map((findingId, index) => {
                const failedReq = report.requirements.find(r => r.requirement_id === findingId && r.status === 'FAIL')
                return (
                  <div key={index} className="bg-white border border-red-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-start space-x-3">
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 space-y-3">
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="font-mono text-sm bg-red-100 text-red-800 px-2 py-1 rounded">
                              {findingId}
                            </span>
                            <Badge variant="destructive">CRITICAL</Badge>
                          </div>
                          <h4 className="font-semibold text-red-900">
                            {failedReq?.title || "Requirement not found"}
                          </h4>
                        </div>
                        
                        {failedReq?.evaluation_rationale && (
                          <div className="bg-red-50 p-3 rounded border-l-4 border-red-400">
                            <h5 className="font-medium text-red-800 text-sm mb-1">Why it failed:</h5>
                            <p className="text-red-700 text-sm">{failedReq.evaluation_rationale}</p>
                          </div>
                        )}
                        
                        {failedReq?.gaps_identified && failedReq.gaps_identified.length > 0 && (
                          <div>
                            <h5 className="font-medium text-red-800 text-sm mb-2">Specific gaps identified:</h5>
                            <ul className="space-y-1">
                              {failedReq.gaps_identified.map((gap, gapIndex) => (
                                <li key={gapIndex} className="text-red-700 text-sm flex items-start space-x-2">
                                  <span className="text-red-400 mt-1.5">•</span>
                                  <span>{gap}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {failedReq?.recommendations && failedReq.recommendations.length > 0 && (
                          <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                            <h5 className="font-medium text-blue-800 text-sm mb-2">Recommended actions:</h5>
                            <ul className="space-y-1">
                              {failedReq.recommendations.map((rec, recIndex) => (
                                <li key={recIndex} className="text-blue-700 text-sm flex items-start space-x-2">
                                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground pt-2 border-t">
                          <div className="flex items-center space-x-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>Confidence: {Math.round(failedReq?.confidence_score || 0)}%</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Search className="h-3 w-3" />
                            <span>Evidence: {failedReq?.evidence_snippets?.length || 0} pieces</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Gaps */}
      {report.key_gaps.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <span>Key Compliance Gaps</span>
            </CardTitle>
            <CardDescription>
              Most common issues identified across requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {report.key_gaps.map((gap, index) => (
                <div key={index} className="flex items-center space-x-2 p-2 bg-yellow-50 rounded">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">{gap}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Analytics */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <span>Processing Analytics</span>
          </CardTitle>
          <CardDescription>
            Performance metrics and RAG setup details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Average Processing Time</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">
                {report.requirements.filter(r => r.evaluation_duration_ms).length > 0
                  ? Math.round(
                      report.requirements
                        .filter(r => r.evaluation_duration_ms)
                        .reduce((sum, r) => sum + (r.evaluation_duration_ms || 0), 0) /
                      report.requirements.filter(r => r.evaluation_duration_ms).length / 1000
                    )
                  : 0}s
              </div>
              <p className="text-xs text-muted-foreground">per requirement</p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Total Tokens Used</span>
              </div>
              <div className="text-2xl font-bold text-green-700">
                {report.requirements
                  .reduce((sum, r) => sum + (r.tokens_used || 0), 0)
                  .toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">across all evaluations</p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border">
              <div className="flex items-center space-x-2 mb-2">
                <Target className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Evidence Quality</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">
                {Math.round(
                  report.requirements.reduce((sum, r) => sum + (r.confidence_score || 0), 0) /
                  report.requirements.length
                )}%
              </div>
              <p className="text-xs text-muted-foreground">average confidence</p>
            </div>
          </div>

          {/* RAG Setup Description */}
          <div className="bg-white p-4 rounded-lg border">
            <h4 className="font-medium mb-3 flex items-center space-x-2">
              <Search className="h-4 w-4 text-indigo-600" />
              <span>RAG Configuration</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div><strong>Search Strategy:</strong> Azure AI Search with semantic ranking</div>
                <div><strong>Top-K Results:</strong> 10 most relevant chunks per requirement</div>
                <div><strong>Reranker:</strong> Cross-encoder scoring for relevance</div>
                <div><strong>Embedding Model:</strong> text-embedding-3-large</div>
              </div>
              <div className="space-y-2">
                <div><strong>LLM:</strong> GPT-4o for requirement evaluation</div>
                <div><strong>Context Window:</strong> 128k tokens with smart truncation</div>
                <div><strong>Page Tracking:</strong> Preserved for evidence traceability</div>
                <div><strong>Multi-modal:</strong> Text + images via Document Intelligence</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements Table */}
      <Card>
        <CardHeader>
          <CardTitle>ISO 14971 Requirements Evaluation</CardTitle>
          <CardDescription>
            Detailed compliance assessment for each requirement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={report.requirements} />
        </CardContent>
      </Card>
    </div>
  )
}