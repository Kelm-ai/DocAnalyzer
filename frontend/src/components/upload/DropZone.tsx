import { useState, useCallback } from "react"
import { Upload, File, X, AlertCircle, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type FileStatus = "pending" | "uploading" | "summarizing" | "ready" | "error"

export interface DropZoneFile {
  id: string
  file: File
  status: FileStatus
  error?: string
}

interface DropZoneProps {
  accept?: string
  maxFiles?: number
  maxSizeMB?: number
  multiple?: boolean
  files: DropZoneFile[]
  onFilesChange: (files: DropZoneFile[]) => void
  disabled?: boolean
  label?: string
  description?: string
  className?: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function DropZone({
  accept = ".pdf",
  maxFiles = 1,
  maxSizeMB = 50,
  multiple = false,
  files,
  onFilesChange,
  disabled = false,
  label = "Drag and drop files here",
  description,
  className,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const validateAndAddFiles = useCallback((fileList: File[]) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    const acceptedExtensions = accept.split(",").map(ext => ext.trim().toLowerCase())

    const newFiles: DropZoneFile[] = []

    for (const file of fileList) {
      // Check max files limit
      if (files.length + newFiles.length >= maxFiles) {
        break
      }

      // Check file extension
      const ext = "." + file.name.split(".").pop()?.toLowerCase()
      if (!acceptedExtensions.some(accepted => ext === accepted || accepted === ".*")) {
        continue
      }

      // Check file size
      if (file.size > maxSizeBytes) {
        newFiles.push({
          id: generateId(),
          file,
          status: "error",
          error: `File exceeds ${maxSizeMB}MB limit`,
        })
        continue
      }

      newFiles.push({
        id: generateId(),
        file,
        status: "pending",
      })
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles])
    }
  }, [files, maxFiles, maxSizeMB, accept, onFilesChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    validateAndAddFiles(droppedFiles)
  }, [disabled, validateAndAddFiles])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && !disabled) {
      const selectedFiles = Array.from(e.target.files)
      validateAndAddFiles(selectedFiles)
    }
    // Reset input so same file can be selected again
    e.target.value = ""
  }

  const removeFile = (fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId))
  }

  const inputId = `file-upload-${generateId()}`

  const getStatusBadge = (status: FileStatus, error?: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>
      case "uploading":
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading
          </Badge>
        )
      case "summarizing":
        return (
          <Badge variant="warning" className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Summarizing
          </Badge>
        )
      case "ready":
        return (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Ready
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Error
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border",
          !disabled && "hover:border-primary hover:bg-primary/5 cursor-pointer",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && document.getElementById(inputId)?.click()}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <h4 className="text-sm font-medium mb-1">{label}</h4>
        {description && (
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
        )}
        <input
          type="file"
          id={inputId}
          className="hidden"
          multiple={multiple}
          accept={accept}
          onChange={handleFileSelect}
          disabled={disabled}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            document.getElementById(inputId)?.click()
          }}
        >
          Select Files
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          {accept === ".pdf" ? "PDF files only" : `Supported: ${accept}`}
          {maxSizeMB && ` (Max ${maxSizeMB}MB)`}
          {maxFiles > 1 && ` - Up to ${maxFiles} files`}
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(fileItem => (
            <div
              key={fileItem.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{fileItem.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(fileItem.file.size)}
                  </p>
                  {fileItem.error && (
                    <p className="text-xs text-destructive">{fileItem.error}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {getStatusBadge(fileItem.status, fileItem.error)}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeFile(fileItem.id)}
                  disabled={fileItem.status === "uploading" || fileItem.status === "summarizing"}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
