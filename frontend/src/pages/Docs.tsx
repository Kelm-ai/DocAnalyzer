import { AlertTriangle } from "lucide-react"

export function Docs() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Work Instruction</h2>
        <p className="text-muted-foreground mt-2">
          Instructions for using the Document AI Assessment Tool
        </p>
      </div>

      <div className="space-y-10">
        {/* Purpose */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Purpose</h3>
          <div className="text-sm text-muted-foreground space-y-3">
            <p>
              This tool assesses uploaded documents against
              requirements from the selected evaluation framework. It is intended for an initial assessment;
              results may be incorporated into a final assessment including human review and feedback.
            </p>
            <p>
              This tool intends to assess each requirement against two LLMs (e.g. Gemini, Anthropic, etc).
              In the event one LLM is not available, a single LLM will be utilized.
            </p>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Scope */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Scope</h3>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-2">In Scope:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Assessment of regulatory documents against configured evaluation frameworks</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-2">Out of Scope:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Combination product-specific or drug elements</li>
              </ul>
            </div>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Definitions */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Definitions</h3>
          <div className="text-sm divide-y divide-border/40">
            <div className="py-3 grid grid-cols-3 gap-4">
              <dt className="font-medium text-foreground">AI Tool</dt>
              <dd className="col-span-2 text-muted-foreground">
                A software system that performs tasks using machine learning, natural language
                processing, or other algorithmic decision-making methods.
              </dd>
            </div>
            <div className="py-3 grid grid-cols-3 gap-4">
              <dt className="font-medium text-foreground">SOP</dt>
              <dd className="col-span-2 text-muted-foreground">
                Standard Operating Procedure. A controlled document that specifies the required
                steps for performing an operation in a consistent, compliant, and repeatable manner.
              </dd>
            </div>
            <div className="py-3 grid grid-cols-3 gap-4">
              <dt className="font-medium text-foreground">Human-in-the-Loop (HITL)</dt>
              <dd className="col-span-2 text-muted-foreground">
                A risk control mechanism where human oversight is required to validate AI outputs,
                make final decisions, or supervise high-risk operations.
              </dd>
            </div>
            <div className="py-3 grid grid-cols-3 gap-4">
              <dt className="font-medium text-foreground">Large Language Model (LLM)</dt>
              <dd className="col-span-2 text-muted-foreground">
                An AI model that learns patterns from huge datasets (books, internet text) to process,
                understand, and create text, code, and other content.
              </dd>
            </div>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Process Flow */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-1">Process Flow</h3>
          <p className="text-sm text-muted-foreground mb-4">Step-by-step guide to using the tool</p>
          <ol className="space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">1</span>
              <div>
                <p className="font-medium text-foreground">Open the Tool</p>
                <p>Navigate to the Upload tab.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">2</span>
              <div>
                <p className="font-medium text-foreground">Upload Your SOP</p>
                <p>Add your SOP in PDF format using drag and drop or the "Select Files" button.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">3</span>
              <div>
                <p className="font-medium text-foreground">Start Evaluation</p>
                <p>Once uploaded, the SOP will appear in the upload queue. Click "Start Upload & Evaluation" to begin processing. This may take a few minutes.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">4</span>
              <div>
                <p className="font-medium text-foreground">View Results</p>
                <p>When the status updates to "Complete", click "View Results" for the assessment.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">5</span>
              <div>
                <p className="font-medium text-foreground">Review Assessment</p>
                <p>Results show total requirements and assessment status. Each requirement displays status, confidence, and findings. A summary page provides a simplified readout.</p>
              </div>
            </li>
          </ol>
        </section>

        <hr className="border-border/40" />

        {/* Assessment Status */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-1">Assessment Status</h3>
          <p className="text-sm text-muted-foreground mb-4">Understanding the evaluation results</p>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3 items-start">
              <span className="inline-block w-24 flex-shrink-0 font-medium text-status-pass">Passed</span>
              <span className="text-muted-foreground">Evidence of requirement text being present in the document.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-24 flex-shrink-0 font-medium text-status-fail">Failed</span>
              <span className="text-muted-foreground">Little to no evidence of requirement text being present.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-24 flex-shrink-0 font-medium text-status-flagged">Flagged</span>
              <span className="text-muted-foreground">Requirement text may be present, but further HITL verification is required.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-24 flex-shrink-0 font-medium text-status-na">Not Applicable</span>
              <span className="text-muted-foreground">The requirement does not apply to this document.</span>
            </div>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Confidence Level */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-1">Confidence Level</h3>
          <p className="text-sm text-muted-foreground mb-4">Understanding assessment confidence</p>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3 items-start">
              <span className="inline-block w-32 flex-shrink-0 font-medium text-status-pass">High</span>
              <span className="text-muted-foreground">Models aligned, assessment is robust.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-32 flex-shrink-0 font-medium text-status-flagged">Medium</span>
              <span className="text-muted-foreground">Models aligned, but assessment may have alternate interpretation or not be fully corroborated. Human verification is recommended.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-32 flex-shrink-0 font-medium text-status-fail">Low</span>
              <span className="text-muted-foreground">Models not aligned; assessment may be fragmented or questionable. Human verification is required.</span>
            </div>
            <div className="flex gap-3 items-start">
              <span className="inline-block w-32 flex-shrink-0 font-medium text-status-na">Single Provider</span>
              <span className="text-muted-foreground">Assessment performed by 1 model instead of standard 2 models.</span>
            </div>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Additional Features */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Additional Features</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Requirements Tab</p>
              <p>View the requirements for the selected framework. Each requirement has a title, reference, and evaluation criteria with examples.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Export to Excel</p>
              <p>Export assessment results to Excel for further analysis or documentation.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Human Feedback</p>
              <p>Provide feedback on assessments to support improvements for future evaluations.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Summary Page</p>
              <p>A simplified readout of the overall assessment results.</p>
            </div>
          </div>
        </section>

        <hr className="border-border/40" />

        {/* Boundaries & Limitations */}
        <section className="rounded-xl border border-sc-gold/30 bg-sc-gold-light px-6 py-5">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-4">
            <AlertTriangle className="h-5 w-5 text-sc-gold-dark" />
            Boundaries & Limitations
          </h3>
          <div className="text-sm text-foreground space-y-4">
            <div>
              <p className="font-medium mb-2">1. Human verification (HITL) is REQUIRED prior to use of any outputs from this tool.</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-sc-gold-dark">
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
              <ul className="list-disc list-inside space-y-1 ml-4 text-sc-gold-dark">
                <li>It is not intended to verify technical accuracy of procedure contents.</li>
                <li>Results are intended for initial assessment and should be incorporated into a final assessment with human review.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium mb-2">3. Single document assessment only.</p>
              <ul className="list-disc list-inside space-y-1 ml-4 text-sc-gold-dark">
                <li>The tool can assess one document at a time.</li>
                <li>If a procedure is split into multiple documents, combine them (e.g., merge PDFs) before uploading for a complete assessment.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
