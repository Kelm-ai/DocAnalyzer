import { useState, useEffect, useCallback } from "react"
import { Upload, Play, ChevronDown, FileText, Files } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { api, type Framework, type EvaluationStatus as EvaluationStatusData } from "@/lib/api"
import { useNavigate } from "react-router-dom"
import { DropZone, type DropZoneFile, type FileStatus } from "./DropZone"

interface MultiDocumentUploaderProps {
  onUploadComplete?: (evaluationId: string) => void
}

type UploadPhase = "idle" | "uploading" | "summarizing" | "processing" | "complete" | "error"

export function MultiDocumentUploader({ onUploadComplete }: MultiDocumentUploaderProps) {
  const [primaryFiles, setPrimaryFiles] = useState<DropZoneFile[]>([])
  const [supportingFiles, setSupportingFiles] = useState<DropZoneFile[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("")
  const [frameworksLoading, setFrameworksLoading] = useState(true)
  const [frameworksError, setFrameworksError] = useState<string | null>(null)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle")
  const [evaluationId, setEvaluationId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [evaluationProgress, setEvaluationProgress] = useState<{
    percent: number
    completed: number
    total: number
    message: string
    etaSeconds?: number
    batchNumber?: number
    batchTotal?: number
  } | null>(null)

  const navigate = useNavigate()

  // Load frameworks on mount
  useEffect(() => {
    let isMounted = true
    const loadFrameworks = async () => {
      try {
        setFrameworksLoading(true)
        setFrameworksError(null)
        const data = await api.getFrameworks(true)
        if (isMounted) {
          setFrameworks(data)
          if (data.length === 1) {
            setSelectedFrameworkId(data[0].id)
          }
        }
      } catch (err) {
        if (isMounted) {
          setFrameworksError(err instanceof Error ? err.message : "Failed to load frameworks")
        }
      } finally {
        if (isMounted) {
          setFrameworksLoading(false)
        }
      }
    }
    void loadFrameworks()
    return () => { isMounted = false }
  }, [])

  const selectedFramework = frameworks.find(f => f.id === selectedFrameworkId)

  const formatEta = (seconds: number) => {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  const canUpload =
    primaryFiles.length === 1 &&
    primaryFiles[0].status === "pending" &&
    selectedFrameworkId &&
    uploadPhase === "idle" &&
    supportingFiles.every(f => f.status === "pending" || f.status === "error")

  const handleStartUpload = useCallback(async () => {
    if (!canUpload) return

    const primaryFile = primaryFiles[0]
    const validSupportingFiles = supportingFiles.filter(f => f.status === "pending")

    setUploadPhase("uploading")
    setUploadError(null)

    // Update file statuses to uploading
    setPrimaryFiles(files => files.map(f => ({ ...f, status: "uploading" as FileStatus })))
    setSupportingFiles(files => files.map(f =>
      f.status === "pending" ? { ...f, status: "uploading" as FileStatus } : f
    ))

    try {
      const result = await api.uploadDocumentsMulti(
        primaryFile.file,
        validSupportingFiles.map(f => f.file),
        selectedFrameworkId
      )

      setEvaluationId(result.evaluation_id)

      // Update statuses based on response
      if (result.summaries_status === "pending") {
        setUploadPhase("summarizing")
        setSupportingFiles(files => files.map(f =>
          f.status === "uploading" ? { ...f, status: "summarizing" as FileStatus } : f
        ))
      } else {
        setUploadPhase("processing")
      }

      setPrimaryFiles(files => files.map(f => ({ ...f, status: "ready" as FileStatus })))

      // Start polling for evaluation status
      await api.pollEvaluationStatus(
        result.evaluation_id,
        (status: EvaluationStatusData) => {
          const meta = status.metadata

          // Check if summaries are done
          if (status.summaries_status === "completed" || status.summaries_status === "not_required") {
            setSupportingFiles(files => files.map(f =>
              f.status === "summarizing" ? { ...f, status: "ready" as FileStatus } : f
            ))
          }

          // Update phase based on status
          if (status.status === "completed") {
            setUploadPhase("complete")
            onUploadComplete?.(result.evaluation_id)
          } else if (status.status === "error" || status.status === "failed") {
            setUploadPhase("error")
            setUploadError(status.error_message || "Evaluation failed")
          } else if (status.status === "in_progress") {
            setUploadPhase("processing")
          }

          // Update progress
          if (meta) {
            setEvaluationProgress({
              percent: meta.progress_percent ?? 0,
              completed: meta.completed_requirements ?? 0,
              total: meta.total_requirements ?? 0,
              message: meta.status_message || "Processing...",
              etaSeconds: meta.estimated_seconds_remaining,
              batchNumber: meta.batch_number,
              batchTotal: meta.batch_total,
            })
          }
        },
        {
          intervalMs: 5000,
          maxIdleIntervals: 120,
          maxTotalMs: 30 * 60 * 1000,
        }
      )
    } catch (error) {
      console.error("Upload error:", error)
      setUploadPhase("error")
      setUploadError(error instanceof Error ? error.message : "Upload failed")
      setPrimaryFiles(files => files.map(f => ({ ...f, status: "error" as FileStatus, error: "Upload failed" })))
      setSupportingFiles(files => files.map(f =>
        f.status === "uploading" || f.status === "summarizing"
          ? { ...f, status: "error" as FileStatus, error: "Upload failed" }
          : f
      ))
    }
  }, [canUpload, primaryFiles, supportingFiles, selectedFrameworkId, onUploadComplete])

  const viewResults = () => {
    if (evaluationId) {
      navigate(`/results/${evaluationId}`)
    }
  }

  const reset = () => {
    setPrimaryFiles([])
    setSupportingFiles([])
    setUploadPhase("idle")
    setEvaluationId(null)
    setUploadError(null)
    setEvaluationProgress(null)
  }

  const getPhaseDisplay = () => {
    switch (uploadPhase) {
      case "uploading":
        return { label: "Uploading documents...", color: "bg-sc" }
      case "summarizing":
        return { label: "Generating summaries for supporting documents...", color: "bg-sc-gold" }
      case "processing":
        return { label: "Evaluating document against requirements...", color: "bg-sc" }
      case "complete":
        return { label: "Evaluation complete!", color: "bg-status-pass" }
      case "error":
        return { label: "Error occurred", color: "bg-status-fail" }
      default:
        return null
    }
  }

  const phaseDisplay = getPhaseDisplay()

  return (
    <div className="space-y-6">
      {/* Framework Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Multi-Document Evaluation</CardTitle>
          <CardDescription>
            Upload a primary document and supporting evidence for compliance evaluation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label htmlFor="framework-select" className="text-sm font-medium">
              Evaluation Framework
            </label>
            {frameworksLoading ? (
              <div className="text-sm text-muted-foreground">Loading frameworks...</div>
            ) : frameworksError ? (
              <div className="text-sm text-destructive">{frameworksError}</div>
            ) : frameworks.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No active frameworks available.
              </div>
            ) : (
              <div className="relative">
                <select
                  id="framework-select"
                  value={selectedFrameworkId}
                  onChange={(e) => setSelectedFrameworkId(e.target.value)}
                  disabled={uploadPhase !== "idle"}
                  className={cn(
                    "w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "appearance-none cursor-pointer",
                    !selectedFrameworkId && "text-muted-foreground"
                  )}
                >
                  <option value="">Select a framework...</option>
                  {frameworks.map(framework => (
                    <option key={framework.id} value={framework.id}>
                      {framework.name}{framework.standard_reference ? ` (${framework.standard_reference})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            )}
            {selectedFramework?.description && (
              <p className="text-xs text-muted-foreground">{selectedFramework.description}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Primary Document Drop Zone */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Primary Document</CardTitle>
              <CardDescription>
                The main document to evaluate against requirements
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DropZone
            accept=".pdf"
            maxFiles={1}
            maxSizeMB={50}
            multiple={false}
            files={primaryFiles}
            onFilesChange={setPrimaryFiles}
            disabled={uploadPhase !== "idle"}
            label="Drop your primary document here"
            description="This is the document that will be evaluated (e.g., SOP, Policy, Plan)"
          />
        </CardContent>
      </Card>

      {/* Supporting Documents Drop Zone */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Files className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Supporting Documents</CardTitle>
              <CardDescription>
                Additional evidence and context (optional, up to 10 documents)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DropZone
            accept=".pdf"
            maxFiles={10}
            maxSizeMB={50}
            multiple={true}
            files={supportingFiles}
            onFilesChange={setSupportingFiles}
            disabled={uploadPhase !== "idle"}
            label="Drop supporting documents here"
            description="SOPs, work instructions, templates, or other referenced documents"
          />
        </CardContent>
      </Card>

      {/* Progress & Actions */}
      {(uploadPhase !== "idle" || (primaryFiles.length > 0 && primaryFiles[0].status === "pending")) && (
        <Card>
          <CardContent className="pt-6">
            {/* Phase Display */}
            {phaseDisplay && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{phaseDisplay.label}</span>
                  {evaluationProgress && uploadPhase === "processing" && (
                    <span className="text-sm text-muted-foreground">
                      {evaluationProgress.completed}/{evaluationProgress.total}
                      {evaluationProgress.batchNumber && evaluationProgress.batchTotal && (
                        <> (Batch {evaluationProgress.batchNumber}/{evaluationProgress.batchTotal})</>
                      )}
                    </span>
                  )}
                </div>
                {uploadPhase === "processing" && evaluationProgress && (
                  <div className="space-y-2">
                    <Progress value={evaluationProgress.percent} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{evaluationProgress.message}</span>
                      {evaluationProgress.etaSeconds != null && (
                        <span>~{formatEta(evaluationProgress.etaSeconds)} remaining</span>
                      )}
                    </div>
                  </div>
                )}
                {(uploadPhase === "uploading" || uploadPhase === "summarizing") && (
                  <Progress value={undefined} className="h-2" />
                )}
              </div>
            )}

            {/* Error Display */}
            {uploadError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{uploadError}</p>
              </div>
            )}

            {/* Summary Info */}
            {supportingFiles.length > 0 && uploadPhase !== "idle" && (
              <div className="mb-4 p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <span className="font-medium">{supportingFiles.length}</span> supporting document(s)
                  {uploadPhase === "summarizing" && " being summarized for context..."}
                  {uploadPhase === "processing" && " included as context"}
                  {uploadPhase === "complete" && " were included in evaluation"}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {uploadPhase === "idle" && canUpload && (
                <Button size="lg" onClick={handleStartUpload}>
                  <Upload className="h-4 w-4 mr-2" />
                  Start Upload & Evaluation
                </Button>
              )}

              {uploadPhase === "complete" && (
                <>
                  <Button size="lg" onClick={viewResults}>
                    <Play className="h-4 w-4 mr-2" />
                    View Results
                  </Button>
                  <Button size="lg" variant="outline" onClick={reset}>
                    Start New Evaluation
                  </Button>
                </>
              )}

              {uploadPhase === "error" && (
                <Button size="lg" variant="outline" onClick={reset}>
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
