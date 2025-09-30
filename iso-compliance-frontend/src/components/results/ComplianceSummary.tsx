import { AlertTriangle, CheckCircle2, XCircle, AlertCircle, TrendingUp, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { mockDocumentEvaluation } from "@/lib/mockData"
import type { RequirementEvaluation } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ComplianceSummary() {
  const evaluation = mockDocumentEvaluation
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getScoreBackground = (score: number) => {
    if (score >= 80) return "bg-green-100"
    if (score >= 60) return "bg-yellow-100"
    return "bg-red-100"
  }

  const getComplianceLevel = (score: number) => {
    if (score >= 90) return { level: "Excellent", color: "success" }
    if (score >= 80) return { level: "Good", color: "success" }
    if (score >= 70) return { level: "Satisfactory", color: "warning" }
    if (score >= 60) return { level: "Needs Improvement", color: "warning" }
    return { level: "Critical", color: "destructive" }
  }

  const complianceLevel = getComplianceLevel(evaluation.overall_compliance_score)

  const highRiskFindings = [
    "Missing formal competency matrix for risk management team",
    "Incomplete training documentation for 3 team members",
    "No role-based competency profiles defined"
  ]

  const keyRecommendations = [
    {
      priority: "High",
      action: "Develop comprehensive competency matrix",
      timeline: "Within 2 weeks"
    },
    {
      priority: "High",
      action: "Complete training documentation for all team members",
      timeline: "Within 1 week"
    },
    {
      priority: "Medium",
      action: "Create formal resource allocation document",
      timeline: "Within 1 month"
    }
  ]

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Compliance Overview</CardTitle>
              <CardDescription>
                {evaluation.document_name} • Evaluated on {new Date(evaluation.completed_at!).toLocaleDateString()}
              </CardDescription>
            </div>
            <Badge variant={complianceLevel.color as "default" | "secondary" | "destructive" | "outline"} className="text-lg px-3 py-1">
              {complianceLevel.level}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Score Display */}
            <div className="flex flex-col items-center justify-center p-6">
              <div className={cn(
                "relative w-40 h-40 rounded-full flex items-center justify-center",
                getScoreBackground(evaluation.overall_compliance_score)
              )}>
                <div className="text-center">
                  <div className={cn("text-4xl font-bold", getScoreColor(evaluation.overall_compliance_score))}>
                    {evaluation.overall_compliance_score.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Compliance Score
                  </div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Based on ISO 14971:2019 requirements
                </p>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center p-4 border rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-green-600 mb-2" />
                <div className="text-2xl font-bold">{evaluation.requirements_passed}</div>
                <div className="text-sm text-muted-foreground">Passed</div>
              </div>
              <div className="flex flex-col items-center p-4 border rounded-lg">
                <XCircle className="h-8 w-8 text-red-600 mb-2" />
                <div className="text-2xl font-bold">{evaluation.requirements_failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="flex flex-col items-center p-4 border rounded-lg">
                <AlertCircle className="h-8 w-8 text-yellow-600 mb-2" />
                <div className="text-2xl font-bold">{evaluation.requirements_flagged ?? evaluation.requirements_partial ?? 0}</div>
                <div className="text-sm text-muted-foreground">Flagged</div>
              </div>
              <div className="flex flex-col items-center p-4 border rounded-lg">
                <FileText className="h-8 w-8 text-gray-400 mb-2" />
                <div className="text-2xl font-bold">{evaluation.requirements_na}</div>
                <div className="text-sm text-muted-foreground">N/A</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance by Clause */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance by Clause</CardTitle>
          <CardDescription>
            Performance breakdown across ISO 14971 clauses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
    {["4.1", "4.2", "4.3", "5.1", "5.2", "6.1"].map((clause) => {
              const clauseReqs = evaluation.evaluations.filter(
                (item: RequirementEvaluation) => item.clause === clause
              )
              const passed = clauseReqs.filter((item) => item.status === "PASS").length
              const total = clauseReqs.filter((item) => item.status !== "NOT_APPLICABLE").length
              const percentage = total > 0 ? (passed / total) * 100 : 0
              
              return (
                <div key={clause} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Clause {clause}</span>
                    <span className="text-muted-foreground">{percentage.toFixed(0)}%</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* High Risk Findings */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <CardTitle>High Risk Findings</CardTitle>
            </div>
            <CardDescription>
              Critical gaps requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {highRiskFindings.map((finding, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 flex-shrink-0" />
                  <span className="text-sm">{finding}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Key Recommendations */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <CardTitle>Key Recommendations</CardTitle>
            </div>
            <CardDescription>
              Prioritized actions to improve compliance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {keyRecommendations.map((rec, i) => (
                <div key={i} className="border-l-2 border-blue-600 pl-3 py-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Badge 
                      variant={rec.priority === "High" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {rec.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{rec.timeline}</span>
                  </div>
                  <p className="text-sm">{rec.action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="flex-1">
              Generate Full Report
            </Button>
            <Button size="lg" variant="outline" className="flex-1">
              Schedule Review Meeting
            </Button>
            <Button size="lg" variant="outline" className="flex-1">
              Export to PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
