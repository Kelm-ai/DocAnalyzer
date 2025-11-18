import { EvaluationStatus } from "@/components/evaluation/EvaluationStatus"

export function Evaluations() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Evaluation Status</h2>
        <p className="text-muted-foreground mt-2">
          Monitor the progress of your document evaluations in real-time
        </p>
      </div>
      <EvaluationStatus />
    </div>
  )
}