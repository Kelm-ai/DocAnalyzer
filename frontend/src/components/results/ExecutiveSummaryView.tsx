import { AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ExecutiveSummary } from "@/lib/api"

const sectionBox =
  "rounded-xl border border-border/60 bg-background p-6"
const sectionShadow = { boxShadow: "0 1px 4px rgba(90, 74, 63, 0.08)" } as const

export function ExecutiveSummaryView({
  executiveSummary,
}: {
  executiveSummary?: ExecutiveSummary
}) {
  if (!executiveSummary) {
    return (
      <div className={sectionBox} style={sectionShadow}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-medium text-foreground">No Summary Available</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Executive summary is not available for this evaluation. This may be because the
            evaluation was run before this feature was added.
          </p>
        </div>
      </div>
    )
  }

  const { overview, critical_gaps, opportunities_for_improvement } = executiveSummary

  return (
    <div className="space-y-6">
      {/* Executive Overview */}
      <div className={sectionBox} style={sectionShadow}>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Executive Overview</h2>
        <p className="text-foreground leading-relaxed">{overview}</p>
      </div>

      {/* Critical Gaps */}
      {critical_gaps && critical_gaps.length > 0 ? (
        <div
          className="rounded-xl border border-status-fail/20 bg-background p-6"
          style={sectionShadow}
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-status-fail" />
            <h2 className="text-lg font-semibold text-foreground">
              Critical Gaps ({critical_gaps.length})
            </h2>
          </div>
          <div className="space-y-4">
            {critical_gaps.map((item, index) => (
              <div
                key={`gap-${index}`}
                className="rounded-lg border border-status-fail/10 bg-status-fail-bg/50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-status-fail-bg text-status-fail border border-status-fail/20">
                    Clause {item.clause}
                  </Badge>
                  <span className="font-medium text-foreground">{item.title}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">Finding: </span>
                    <span className="text-muted-foreground">{item.finding}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Recommendation: </span>
                    <span className="text-muted-foreground">{item.recommendation}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border border-sc/20 bg-background p-6"
          style={sectionShadow}
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-status-pass" />
            <h2 className="text-lg font-semibold text-foreground">Critical Gaps</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">No critical gaps identified.</p>
        </div>
      )}

      {/* Opportunities for Improvement */}
      {opportunities_for_improvement && opportunities_for_improvement.length > 0 && (
        <div
          className="rounded-xl border border-status-flagged/20 bg-background p-6"
          style={sectionShadow}
        >
          <div className="mb-4 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-status-flagged" />
            <h2 className="text-lg font-semibold text-foreground">
              Opportunities for Improvement ({opportunities_for_improvement.length})
            </h2>
          </div>
          <div className="space-y-4">
            {opportunities_for_improvement.map((item, index) => (
              <div
                key={`ofi-${index}`}
                className="rounded-lg border border-status-flagged/10 bg-status-flagged-bg/50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="bg-status-flagged-bg text-status-flagged border border-status-flagged/20">
                    Clause {item.clause}
                  </Badge>
                  <span className="font-medium text-foreground">{item.title}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">Finding: </span>
                    <span className="text-muted-foreground">{item.finding}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Recommendation: </span>
                    <span className="text-muted-foreground">{item.recommendation}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
