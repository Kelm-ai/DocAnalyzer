# ISO 14971 Compliance Pipeline

## 🎯 Overview
Automated compliance evaluation pipeline for ISO 14971:2019 medical device risk management documentation.

## ✅ Completed Setup

### 1. **Azure Infrastructure**
- **Azure AI Search**: `kelmsearch` service with `iso-analysis` index
  - Document Intelligence for text/image extraction
  - GPT-4o-mini for image verbalization  
  - Text-embedding-3-large for semantic search
  - Intelligent chunking (2000 chars, 200 overlap)
- **Azure Storage**: `kelmstorage` 
  - `sc-documents` container for source documents
  - `sc-processed` container for processed files
  - `sc-images` container for extracted images
- **Azure OpenAI**: `kelmrfpai.openai.azure.com`
  - GPT-4o deployment for evaluation
  - text-embedding-3-large for embeddings

### 2. **Supabase Database** 
- **Project**: `iso-compliance` (qtuxwngyiilpntbungul)
- **Tables Created**:
  - `iso_requirements` - 38 ISO 14971 requirements loaded
  - `document_evaluations` - Track evaluation sessions
  - `requirement_evaluations` - Individual requirement assessments
  - `compliance_reports` - Generated compliance reports
  - `evaluation_audit_log` - Audit trail
- **Views**:
  - `evaluation_summary` - Quick evaluation overview
  - `requirement_compliance_rates` - Requirement pass rates

### 3. **ISO 14971 Requirements**
- All 38 requirements from ISO 14971:2019 loaded
- Includes clauses 4.1 through 10.3
- TR 24971 guidance included
- Complete with:
  - Requirement text
  - Acceptance criteria
  - Expected artifacts
  - Guidance notes

## 🚀 How to Use

### Prerequisites
1. Update `.env` file with your Azure keys:
   ```
   AZURE_OPENAI_KEY=your_key
   AZURE_SEARCH_KEY=your_key
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running an Evaluation

```python
from iso_compliance_pipeline import CompliancePipeline
import asyncio

async def evaluate():
    pipeline = CompliancePipeline()
    
    # Evaluate a document already indexed in Azure Search
    evaluation_id = await pipeline.evaluate_document(
        document_name="Your_Document_Name.pdf"
    )
    
    print(f"Evaluation ID: {evaluation_id}")

# Run
asyncio.run(evaluate())
```

### Checking Results

```python
# Using Supabase MCP
mcp__supabase__execute_sql(
    project_id="qtuxwngyiilpntbungul",
    query="""
    SELECT 
        document_name,
        overall_compliance_score,
        requirements_passed,
        requirements_failed
    FROM document_evaluations
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    """
)
```

## 📊 Pipeline Flow

1. **Document Upload** → Azure Storage (`sc-documents`)
2. **Indexing** → Azure AI Search processes and chunks document
3. **Evaluation Trigger** → Start evaluation via API
4. **For Each Requirement**:
   - Search for relevant evidence in document
   - Evaluate with GPT-4o against acceptance criteria
   - Store results in Supabase
5. **Report Generation** → Compliance report with gaps and recommendations

## 🔑 Key Features

- **Multi-modal Understanding**: Text and image analysis
- **Semantic Search**: Find relevant evidence using embeddings
- **LLM Evaluation**: GPT-4o assesses compliance
- **Structured Reports**: JSON reports with citations
- **Audit Trail**: Complete tracking of evaluations
- **Gap Analysis**: Identifies missing documentation

## 📈 Next Steps

1. **Build API Layer** - FastAPI endpoints for:
   - `/evaluate` - Trigger evaluation
   - `/status/{id}` - Check progress
   - `/report/{id}` - Get report

2. **Create UI Dashboard** - Visualization of:
   - Compliance scores
   - Requirement coverage
   - Gap analysis
   - Trending over time

3. **Add Batch Processing** - Evaluate multiple documents

4. **Enhance Reporting** - Generate:
   - PDF reports
   - Executive summaries
   - Remediation plans

## 🔗 Connection Details

- **Supabase URL**: https://qtuxwngyiilpntbungul.supabase.co
- **Azure Search Index**: iso-analysis
- **Azure OpenAI Model**: gpt-4o

## 📝 Notes

- Documents must be indexed in Azure Search first
- Evaluation takes ~2-5 minutes per document
- Results are stored permanently in Supabase
- All evaluations include confidence scores and rationale