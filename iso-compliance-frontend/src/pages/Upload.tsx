import { DocumentUploader } from "@/components/upload/DocumentUploader"

export function Upload() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Document Upload</h2>
        <p className="text-muted-foreground mt-2">
          Upload your medical device documentation to evaluate compliance with ISO 14971:2019 requirements
        </p>
      </div>
      <DocumentUploader />
    </div>
  )
}