import React, { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, Search, Download, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { RequirementEvaluation } from "@/lib/types"
import { mockRequirements } from "@/lib/mockData"

export function RequirementsTable() {
  const [requirements] = useState<RequirementEvaluation[]>(mockRequirements)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [clauseFilter, setClauseFilter] = useState<string>("all")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "PASS":
        return <Badge variant="success">✅ Pass</Badge>
      case "FAIL":
        return <Badge variant="destructive">❌ Fail</Badge>
      case "FLAGGED":
      case "PARTIAL":
        return <Badge variant="warning">⚠️ Flagged</Badge>
      case "NOT_APPLICABLE":
        return <Badge variant="secondary">➖ N/A</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }


  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const clauses = useMemo(() => {
    const uniqueClauses = new Set(requirements.map((requirement) => requirement.clause))
    return Array.from(uniqueClauses).sort()
  }, [requirements])

  const filteredRequirements = useMemo(() => {
    return requirements.filter((req) => {
      const matchesSearch = searchTerm === "" || 
        req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.requirement_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.id.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesStatus = statusFilter === "all" || req.status === statusFilter
      const matchesClause = clauseFilter === "all" || req.clause === clauseFilter
      
      return matchesSearch && matchesStatus && matchesClause
    })
  }, [requirements, searchTerm, statusFilter, clauseFilter])

  const groupedByClause = useMemo(() => {
    const grouped: Record<string, RequirementEvaluation[]> = {}
    filteredRequirements.forEach((req) => {
      if (!grouped[req.clause]) {
        grouped[req.clause] = []
      }
      grouped[req.clause].push(req)
    })
    return grouped
  }, [filteredRequirements])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ISO 14971 Requirements Evaluation</CardTitle>
              <CardDescription>
                Detailed compliance assessment for each requirement
              </CardDescription>
            </div>
            <Button>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search requirements..."
                    className="pl-8 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                  <option value="FLAGGED">Flagged</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="NOT_APPLICABLE">N/A</option>
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={clauseFilter}
                  onChange={(event) => setClauseFilter(event.target.value)}
                >
                  <option value="all">All Clauses</option>
                  {clauses.map(clause => (
                    <option key={clause} value={clause}>Clause {clause}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Table */}
            <div className="border rounded-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="w-10"></th>
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">Clause</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Confidence</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByClause).map(([clause, reqs]) => (
                      <React.Fragment key={clause}>
                        <tr className="border-b bg-muted/20">
                          <td colSpan={7} className="p-2 font-semibold">
                            Clause {clause}
                          </td>
                        </tr>
                        {reqs.map(req => (
                          <React.Fragment key={req.id}>
                            <tr className="border-b hover:bg-muted/10">
                              <td className="p-3">
                                <button
                                  onClick={() => toggleRow(req.id)}
                                  className="p-1"
                                >
                                  {expandedRows.has(req.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                              <td className="p-3 text-sm font-mono">{req.id}</td>
                              <td className="p-3 text-sm">{req.clause}</td>
                              <td className="p-3 text-sm font-medium">{req.title}</td>
                              <td className="p-3">{getStatusBadge(req.status)}</td>
                              <td className="p-3">
                                {req.confidence && (
                                  <div className="flex items-center space-x-2">
                                    <Progress
                                      value={req.confidence * 100}
                                      className="w-20 h-2"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {Math.round(req.confidence * 100)}%
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3">
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                            {expandedRows.has(req.id) && (
                              <tr className="border-b bg-muted/5">
                                <td colSpan={7} className="p-4">
                                  <div className="space-y-4">
                                    <div>
                                      <h5 className="font-semibold text-sm mb-1">Requirement</h5>
                                      <p className="text-sm text-muted-foreground">{req.requirement_text}</p>
                                    </div>
                                    
                                    <div>
                                      <h5 className="font-semibold text-sm mb-1">Acceptance Criteria</h5>
                                      <p className="text-sm text-muted-foreground">{req.acceptance_criteria}</p>
                                    </div>

                                    {req.evidence_snippets && req.evidence_snippets.length > 0 && (
                                      <div>
                                        <h5 className="font-semibold text-sm mb-1">Evidence Found</h5>
                                        <ul className="list-disc list-inside space-y-1">
                                      {req.evidence_snippets.map((snippet: string, index: number) => (
                                        <li key={index} className="text-sm text-muted-foreground">{snippet}</li>
                                      ))}
                                        </ul>
                                      </div>
                                    )}

                                    {req.gaps && req.gaps.length > 0 && (
                                      <div>
                                        <h5 className="font-semibold text-sm mb-1 text-red-600">Gaps Identified</h5>
                                        <ul className="list-disc list-inside space-y-1">
                                          {req.gaps.map((gap: string, index: number) => (
                                            <li key={index} className="text-sm text-muted-foreground">{gap}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {req.recommendations && req.recommendations.length > 0 && (
                                      <div>
                                        <h5 className="font-semibold text-sm mb-1 text-blue-600">Recommendations</h5>
                                        <ul className="list-disc list-inside space-y-1">
                                          {req.recommendations.map((rec: string, index: number) => (
                                            <li key={index} className="text-sm text-muted-foreground">{rec}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Showing {filteredRequirements.length} of {requirements.length} requirements
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
