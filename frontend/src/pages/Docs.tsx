import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

export function Docs() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Documentation</h2>
        <p className="text-muted-foreground mt-2">
          Instructions for using the Risk Management SOP AI Assessment Tool
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Purpose</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            <p>
              This tool assesses uploaded Standard Operating Procedures (SOPs) against a list of
              clauses extracted from ISO 14971:2019. It is intended for an initial assessment;
              results may be incorporated into a final assessment including human review and feedback.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-900 mb-2">In Scope:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Assessment of Standard Operating Procedures against ISO 14971:2019</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-2">Out of Scope:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Assessment against any other standard, regulation, or guidance</li>
                <li>Combination product-specific or drug elements</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Definitions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="divide-y divide-gray-100">
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="font-medium text-gray-900">AI Tool</dt>
                <dd className="col-span-2 text-gray-600">
                  A software system that performs tasks using machine learning, natural language
                  processing, or other algorithmic decision-making methods.
                </dd>
              </div>
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="font-medium text-gray-900">SOP</dt>
                <dd className="col-span-2 text-gray-600">
                  Standard Operating Procedure. A controlled document that specifies the required
                  steps for performing an operation in a consistent, compliant, and repeatable manner.
                </dd>
              </div>
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="font-medium text-gray-900">Human-in-the-Loop (HITL)</dt>
                <dd className="col-span-2 text-gray-600">
                  A risk control mechanism where human oversight is required to validate AI outputs,
                  make final decisions, or supervise high-risk operations.
                </dd>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Process Flow</CardTitle>
            <CardDescription>Step-by-step guide to using the tool</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            <ol className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">1</span>
                <div>
                  <p className="font-medium text-gray-900">Open the Tool</p>
                  <p>Navigate to the Upload tab.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">2</span>
                <div>
                  <p className="font-medium text-gray-900">Upload Your SOP</p>
                  <p>Add your SOP in PDF or Word format using drag and drop or the "Select Files" button.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">3</span>
                <div>
                  <p className="font-medium text-gray-900">Start Evaluation</p>
                  <p>Once uploaded, the SOP will appear in the upload queue. Click "Start Upload & Evaluation" to begin processing. This may take a few minutes.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">4</span>
                <div>
                  <p className="font-medium text-gray-900">View Results</p>
                  <p>When the status updates to "Complete", click "View Results" for the assessment.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">5</span>
                <div>
                  <p className="font-medium text-gray-900">Review Assessment</p>
                  <p>Results show total requirements and assessment status. Each requirement displays status, confidence, and findings. A summary page provides a simplified readout.</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessment Status</CardTitle>
            <CardDescription>Understanding the evaluation results</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="inline-block w-24 flex-shrink-0 font-medium text-green-700">Passed</span>
                <span className="text-gray-600">Evidence of requirement text being present in the document.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="inline-block w-24 flex-shrink-0 font-medium text-red-700">Failed</span>
                <span className="text-gray-600">Little to no evidence of requirement text being present.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="inline-block w-24 flex-shrink-0 font-medium text-yellow-700">Flagged</span>
                <span className="text-gray-600">Requirement text may be present, but further HITL verification is required.</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="inline-block w-24 flex-shrink-0 font-medium text-gray-500">Not Applicable</span>
                <span className="text-gray-600">The requirement does not apply to this document.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-900 mb-1">Requirements Tab</p>
              <p>View all clauses extracted from ISO 14971:2019. Each clause has a title, clause number, and requirement text with criteria and examples.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">Export to Excel</p>
              <p>Export assessment results to Excel for further analysis or documentation.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">Human Feedback</p>
              <p>Provide feedback on assessments to support improvements for future evaluations.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900 mb-1">Summary Page</p>
              <p>A simplified readout of the overall assessment results.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Boundaries & Limitations
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-900 space-y-4">
            <div>
              <p className="font-medium mb-2">1. Human verification (HITL) is REQUIRED prior to use of any outputs from this tool.</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-amber-800">
                <li>The tool only evaluates what is given to it and cannot infer correctness.</li>
                <li>The tool cannot understand context outside the requirements provided.</li>
                <li>Final interpretation belongs to a qualified subject matter expert.</li>
                <li>The tool cannot make regulatory, legal, or compliance determinations.</li>
                <li>The tool cannot determine whether a procedure is technically possible.</li>
                <li>The tool may produce errors or omissions.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">2. The tool assesses presence or absence of elements only.</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-amber-800">
                <li>It is not intended to verify technical accuracy of procedure contents.</li>
                <li>Results are intended for initial assessment and should be incorporated into a final assessment with human review.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">3. Single document assessment only.</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-amber-800">
                <li>The tool can assess one document at a time.</li>
                <li>If a procedure is split into multiple documents, combine them (e.g., merge PDFs) before uploading for a complete assessment.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
