import { useState } from "react"
import { HelpCircle, AlertTriangle, FileText, Files } from "lucide-react"
import { DocumentUploader } from "@/components/upload/DocumentUploader"
import { MultiDocumentUploader } from "@/components/upload/MultiDocumentUploader"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type UploadMode = "single" | "multi"

export function Upload() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<UploadMode>("single")

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-bold tracking-tight">Document Upload</h2>
          <button
            onClick={() => setHelpOpen(true)}
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
        <p className="text-muted-foreground mt-2">
          Assess uploaded documents against your selected evaluation framework
        </p>
      </div>

      <Card className="mb-6 border-sc-gold/30 bg-sc-gold-light">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-sc-gold-dark flex-shrink-0 mt-0.5" />
            <div className="text-sm text-foreground">
              <p className="font-medium mb-2">Human verification is REQUIRED prior to use of any outputs from this tool.</p>
              <ul className="space-y-1 text-sc-gold-dark">
                <li>The tool only evaluates what is given to it and cannot infer correctness.</li>
                <li>Final interpretation belongs to a qualified subject matter expert.</li>
                <li>The tool cannot make regulatory, legal, or compliance determinations.</li>
                <li>The tool may produce errors or omissions.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Mode Toggle */}
      <div className="mb-6 flex gap-2">
        <Button
          variant={uploadMode === "single" ? "default" : "outline"}
          onClick={() => setUploadMode("single")}
          className="flex items-center gap-2"
        >
          <FileText className="h-4 w-4" />
          Single Document
        </Button>
        <Button
          variant={uploadMode === "multi" ? "default" : "outline"}
          onClick={() => setUploadMode("multi")}
          className="flex items-center gap-2"
        >
          <Files className="h-4 w-4" />
          Multi-Document
        </Button>
      </div>

      {uploadMode === "single" ? (
        <DocumentUploader />
      ) : (
        <MultiDocumentUploader />
      )}

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How to Use"
        description="Step-by-step guide for document evaluation"
        size="md"
        footer={
          <Button onClick={() => setHelpOpen(false)}>Got it</Button>
        }
      >
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-foreground mb-2">Upload Modes</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-2">
              <li><span className="font-medium">Single Document:</span> Upload one document for evaluation</li>
              <li><span className="font-medium">Multi-Document:</span> Upload a primary document with supporting evidence (SOPs, policies, templates)</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Process</h4>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-2">
              <li>Select upload mode (Single or Multi-Document)</li>
              <li>Add your primary SOP (PDF) using drag and drop or the "Select Files" button</li>
              <li>For Multi-Document: add supporting documents as evidence context</li>
              <li>Click "Start Upload & Evaluation" to begin processing</li>
              <li>When complete, click "View Results" for the assessment</li>
            </ol>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Multi-Document Benefits</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Supporting documents provide context when the primary document references external materials:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Training policies referenced in your procedure</li>
              <li>Work instructions or templates mentioned</li>
              <li>Related SOPs for cross-reference verification</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Understanding Results</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Results show total requirements and assessment status for each:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><span className="font-medium text-status-pass">Passed:</span> Evidence of requirement text being present</li>
              <li><span className="font-medium text-status-fail">Failed:</span> Little to no evidence of requirement text being present</li>
              <li><span className="font-medium text-status-flagged">Flagged:</span> Requirement text may be present, but further verification required</li>
              <li><span className="font-medium text-muted-foreground">Not Applicable:</span> Requirement does not apply</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-foreground mb-2">Additional Features</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Each requirement shows status, confidence, and findings</li>
              <li>Export results to Excel using the "Export to Excel" button</li>
              <li>A summary page provides a simplified readout</li>
              <li>Human feedback can be provided to improve future assessments</li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  )
}