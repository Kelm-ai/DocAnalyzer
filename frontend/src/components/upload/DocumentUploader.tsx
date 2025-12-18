import { useState, useCallback, useEffect } from "react"
import { Upload, File, X, AlertCircle, CheckCircle, Play, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { api, APIError, type Framework } from "@/lib/api"
import type { EvaluationStatus as EvaluationStatusData } from "@/lib/api"
import { useNavigate } from "react-router-dom"

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  status: "pending" | "uploading" | "processing" | "success" | "error"
  progress: number
  error?: string
  evaluationId?: string
  file?: File
  evaluationProgress?: {
    percent: number
    completed: number
    total: number
    message: string
    batchNumber?: number
    batchTotal?: number
    batchSize?: number
  }
}

export function DocumentUploader() {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("")
  const [frameworksLoading, setFrameworksLoading] = useState(true)
  const [frameworksError, setFrameworksError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Load frameworks on mount
  useEffect(() => {
    let isMounted = true
    const loadFrameworks = async () => {
      try {
        setFrameworksLoading(true)
        setFrameworksError(null)
        const data = await api.getFrameworks(true) // Only active frameworks
        if (isMounted) {
          setFrameworks(data)
          // Auto-select the first framework if only one exists
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files)
    processFiles(droppedFiles)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      processFiles(selectedFiles)
    }
  }

  const processFiles = (fileList: File[]) => {
    const newFiles: UploadedFile[] = fileList.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      status: "pending" as const,
      progress: 0,
      file: file
    }))

    setFiles(prev => [...prev, ...newFiles])
  }

  const uploadFile = async (fileId: string) => {
    const fileData = files.find(f => f.id === fileId)
    if (!fileData?.file) return

    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: "uploading", progress: 30 } : f
      ))

      // Upload to backend with selected framework
      const result = await api.uploadDocument(fileData.file, selectedFrameworkId)

      // Update with success and evaluation ID
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: "processing", 
          progress: 100, 
          evaluationId: result.evaluation_id 
        } : f
      ))

      // Start polling for status updates
      await api.pollEvaluationStatus(
        result.evaluation_id,
        (status: EvaluationStatusData) => {
          setFiles(prev => prev.map(f => {
            if (f.id !== fileId) {
              return f
            }

            const previousProgress = f.evaluationProgress
            const nextMetadata = status.metadata
            const computedStatus =
              status.status === "completed" ? "success" :
              status.status === "error" || status.status === "failed" ? "error" :
              "processing"

            return {
              ...f,
              status: computedStatus,
              error: status.error_message,
              evaluationProgress: nextMetadata ? {
                percent: nextMetadata.progress_percent ?? previousProgress?.percent ?? 0,
                completed: nextMetadata.completed_requirements ?? previousProgress?.completed ?? 0,
                total: nextMetadata.total_requirements ?? previousProgress?.total ?? 38,
                message: nextMetadata.status_message || previousProgress?.message || "Processing...",
                batchNumber: nextMetadata.batch_number ?? previousProgress?.batchNumber,
                batchTotal: nextMetadata.batch_total ?? previousProgress?.batchTotal,
                batchSize: nextMetadata.batch_size ?? previousProgress?.batchSize,
              } : undefined
            }
          }))
        },
        {
          intervalMs: 5000,
          maxIdleIntervals: 120,
          maxTotalMs: 30 * 60 * 1000,
        }
      )

    } catch (error) {
      console.error("Upload error:", error)
      const errorMessage = error instanceof APIError ? error.message : "Upload failed"

      setFiles((prev) => prev.map((f) =>
        f.id === fileId ? {
          ...f,
          status: "error",
          error: errorMessage,
        } : f
      ))
    }
  }

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const viewResults = (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (file?.evaluationId) {
      navigate(`/results/${file.evaluationId}`)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Document for Evaluation</CardTitle>
          <CardDescription>
            {selectedFramework
              ? `Upload documentation to evaluate against ${selectedFramework.name} requirements`
              : "Select a framework and upload documentation for compliance evaluation"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Framework Selector */}
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
                No active frameworks available. Please configure a framework first.
              </div>
            ) : (
              <div className="relative">
                <select
                  id="framework-select"
                  value={selectedFrameworkId}
                  onChange={(e) => setSelectedFrameworkId(e.target.value)}
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
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border",
              "hover:border-primary hover:bg-primary/5"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Drag and drop your files here
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse
            </p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf"
              onChange={handleFileSelect}
            />
            <Button asChild>
              <label htmlFor="file-upload" className="cursor-pointer">
                Select Files
              </label>
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Supported formats: PDF (Max 50MB)
            </p>
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Queue</CardTitle>
            <CardDescription>
              {files.filter(f => f.status === "success").length} of {files.length} files processed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {files.map(file => (
                <div key={file.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start space-x-3">
                      <File className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {file.status === "pending" && (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      {file.status === "uploading" && (
                        <Badge variant="default">Uploading</Badge>
                      )}
                      {file.status === "processing" && (
                        <Badge variant="warning">Processing</Badge>
                      )}
                      {file.status === "success" && (
                        <Badge variant="success" className="flex items-center space-x-1">
                          <CheckCircle className="h-3 w-3" />
                          <span>Complete</span>
                        </Badge>
                      )}
                      {file.status === "error" && (
                        <Badge variant="destructive" className="flex items-center space-x-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>Error</span>
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {(file.status === "uploading" || file.status === "processing") && (
                    <div className="space-y-2">
                      <Progress 
                        value={file.status === "processing" && file.evaluationProgress 
                          ? file.evaluationProgress.percent 
                          : file.progress} 
                        className="h-2" 
                      />
                      <div className="flex items-center justify-between text-xs">
                        <p className="text-muted-foreground">
                          {file.status === "uploading"
                            ? "Uploading to Azure Storage..."
                            : file.evaluationProgress?.message || `Evaluating against ${selectedFramework?.name || "framework"} requirements...`}
                        </p>
                        {file.status === "processing" && file.evaluationProgress && (
                          <p className="text-muted-foreground font-mono">
                            {file.evaluationProgress.completed}/{file.evaluationProgress.total} ({file.evaluationProgress.percent}%)
                            {file.evaluationProgress.batchNumber && file.evaluationProgress.batchTotal && (
                              <> · Batch {file.evaluationProgress.batchNumber}/{file.evaluationProgress.batchTotal}</>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {file.error && (
                    <div className="mt-2 text-xs text-destructive">
                      {file.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-6 flex justify-between">
              {files.some(f => f.status === "pending") && (
                <Button
                  size="lg"
                  disabled={!selectedFrameworkId}
                  onClick={() => {
                    files.filter(f => f.status === "pending").forEach(f => {
                      uploadFile(f.id)
                    })
                  }}
                  title={!selectedFrameworkId ? "Please select a framework first" : undefined}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Start Upload & Evaluation
                </Button>
              )}
              
              {files.some(f => f.status === "success") && (
                <Button 
                  size="lg" 
                  variant="secondary"
                  onClick={() => {
                    const successFile = files.find(f => f.status === "success")
                    if (successFile) viewResults(successFile.id)
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  View Results
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
