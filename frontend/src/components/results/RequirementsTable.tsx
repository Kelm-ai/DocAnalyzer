import React, { useState, useMemo, useCallback } from "react"
import * as XLSX from "xlsx"
import { ChevronDown, ChevronRight, Search, Download, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { RequirementEvaluation } from "@/lib/types"
import { mockRequirements } from "@/lib/mockData"

type ConfidenceLevel = NonNullable<RequirementEvaluation["confidence_level"]>

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

const CONFIDENCE_BADGE_CLASSES: Record<ConfidenceLevel, string> = {
  low: "bg-slate-100 text-slate-600 border border-slate-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-emerald-50 text-emerald-700 border border-emerald-200",
}

const getConfidenceLabel = (level?: RequirementEvaluation["confidence_level"]) => {
  if (!level) {
    return "Unknown"
  }
  return CONFIDENCE_LABELS[level]
}

const getConfidenceBadgeClass = (level?: RequirementEvaluation["confidence_level"]) => {
  if (!level) {
    return "bg-slate-100 text-slate-600 border border-slate-200"
  }
  return CONFIDENCE_BADGE_CLASSES[level]
}

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
      const search = searchTerm.toLowerCase()
      const matchesSearch = search === "" || 
        req.title.toLowerCase().includes(search) ||
        req.id.toLowerCase().includes(search) ||
        (req.evaluation_type ?? "").toLowerCase().includes(search)
      
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

  const handleExport = useCallback(() => {
    if (filteredRequirements.length === 0) {
      return
    }

    const exportRows = filteredRequirements.map((req) => {
      return {
        ID: req.id,
        Clause: req.clause,
        Order: req.display_order ?? "",
        Title: req.title,
        "Evaluation Type": req.evaluation_type ?? "",
        Status: req.status ?? "PENDING",
        "Confidence Level": getConfidenceLabel(req.confidence_level),
        Rationale: req.evaluation_rationale ?? "",
        "Evidence Snippets": req.evidence_snippets?.join("\n") ?? "",
        Gaps: req.gaps?.join("\n") ?? "",
        Recommendations: req.recommendations?.join("\n") ?? ""
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluation")

    const timestamp = new Date().toISOString().split("T")[0]
    const filename = `iso14971-evaluation-${timestamp}.xlsx`
    XLSX.writeFile(workbook, filename)
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
            <Button onClick={handleExport} disabled={filteredRequirements.length === 0}>
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
                      <th className="text-left p-3 font-medium">Order</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Confidence</th>
                      <th className="text-left p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByClause).map(([clause, reqs]) => {
                      return (
                        <React.Fragment key={clause}>
                          <tr className="border-b bg-muted/20">
                            <td colSpan={8} className="p-2 font-semibold">
                              Clause {clause}
                            </td>
                          </tr>
                          {reqs.map((req) => {
                            const hasConfidenceData = Boolean(req.confidence_level)

                            return (
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
                            <td className="p-3 text-sm">{req.display_order ?? "—"}</td>
                            <td className="p-3 text-sm font-medium">{req.title}</td>
                            <td className="p-3">{getStatusBadge(req.status)}</td>
                            <td className="p-3">
                              {hasConfidenceData ? (
                                <Badge
                                  variant="outline"
                                  className={`px-2 py-0.5 text-xs font-medium ${getConfidenceBadgeClass(req.confidence_level)}`}
                                >
                                  {getConfidenceLabel(req.confidence_level)} confidence
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
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
                                    <td colSpan={8} className="p-4">
                                      <div className="space-y-4">
                                        <div>
                                          <h5 className="font-semibold text-sm mb-1">Requirement</h5>
                                          <p className="text-sm text-muted-foreground">{req.title}</p>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <div>
                                            <h5 className="font-semibold text-sm mb-1">Clause</h5>
                                            <p className="text-sm text-muted-foreground">{req.clause}</p>
                                          </div>
                                          <div>
                                            <h5 className="font-semibold text-sm mb-1">Order</h5>
                                            <p className="text-sm text-muted-foreground">{req.display_order ?? "—"}</p>
                                          </div>
                                        </div>

                                        {req.evaluation_type ? (
                                          <div>
                                            <h5 className="font-semibold text-sm mb-1">Evaluation Type</h5>
                                            <p className="text-sm text-muted-foreground">{req.evaluation_type}</p>
                                          </div>
                                        ) : null}

                                        {req.evaluation_rationale ? (
                                          <div>
                                            <h5 className="font-semibold text-sm mb-1">Rationale</h5>
                                            <p className="text-sm text-muted-foreground">{req.evaluation_rationale}</p>
                                          </div>
                                        ) : null}

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
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
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
