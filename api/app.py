#!/usr/bin/env python3
"""
FastAPI application for ISO 14971 Compliance Pipeline
Provides REST endpoints for document upload, evaluation, and results
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Any, Literal
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Azure imports
from azure.storage.blob import BlobServiceClient
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential

# Local imports
import sys

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
TEST_EVALUATION_DIR = ROOT_DIR / "test_evaluation"

# Load environment variables (root .env first, then fallback to local)
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")

for path in (ROOT_DIR, SCRIPTS_DIR, TEST_EVALUATION_DIR, BASE_DIR):
    str_path = str(path)
    if str_path not in sys.path:
        sys.path.append(str_path)

EVALUATION_PIPELINE = os.getenv("EVALUATION_PIPELINE", "vision").lower()

# Vision evaluator (optional)
try:
    from vision_responses_evaluator import VisionResponsesEvaluator  # type: ignore
    VISION_PIPELINE_AVAILABLE = True
except ImportError as vision_import_error:
    logger.warning(f"Vision evaluator not available: {vision_import_error}")
    VisionResponsesEvaluator = None  # type: ignore
    VISION_PIPELINE_AVAILABLE = False

# Azure pipeline has been archived; keep placeholders for backwards compatibility
CompliancePipeline = None
Config = None
AZURE_PIPELINE_AVAILABLE = False

# Try to import Document Intelligence service (may fail if dependencies missing)
try:
    from document_intelligence_service import DocumentIntelligenceService
    DOCUMENT_INTELLIGENCE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Document Intelligence service not available: {e}")
    DocumentIntelligenceService = None
    DOCUMENT_INTELLIGENCE_AVAILABLE = False

# Initialize FastAPI app
app = FastAPI(
    title="ISO 14971 Compliance API",
    description="REST API for automated ISO 14971 compliance evaluation",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global pipeline instances
pipeline: Optional[CompliancePipeline] = None
vision_evaluator: Optional[VisionResponsesEvaluator] = None
document_intelligence_service: Optional[DocumentIntelligenceService] = None


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    """Simple health check for deploy environments."""
    return {
        "status": "ok",
        "pipeline": get_active_pipeline_name(),
        "model": get_active_model_name(),
        "timestamp": datetime.utcnow().isoformat(),
    }


def get_supabase_client():
    """Get Supabase client from the active pipeline."""
    if pipeline is not None:
        return pipeline.supabase
    if vision_evaluator is not None and vision_evaluator.supabase is not None:
        return vision_evaluator.supabase
    raise HTTPException(status_code=500, detail="No Supabase client available")


def get_active_pipeline_name() -> str:
    if pipeline is not None:
        return "azure_pipeline"
    if vision_evaluator is not None:
        return "vision_responses"
    return "unconfigured"


def get_active_model_name() -> Optional[str]:
    if pipeline is not None:
        return getattr(pipeline, "model", None)
    if vision_evaluator is not None:
        return getattr(vision_evaluator, "model", None)
    return None


def _ensure_list(value: Optional[Any]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


CONFIDENCE_ORDER = ("low", "medium", "high")
CONFIDENCE_TO_SCORE = {
    "low": 0.3,
    "medium": 0.6,
    "high": 0.9,
}


def _normalize_confidence_level(value: Optional[Any]) -> str:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in CONFIDENCE_ORDER:
            return lowered
    return "low"


def _confidence_score_from_level(level: str) -> float:
    return CONFIDENCE_TO_SCORE.get(level.lower(), 0.0)


def _score_to_confidence_level(score: Optional[Any]) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        return "low"
    if value >= 0.8:
        return "high"
    if value >= 0.5:
        return "medium"
    return "low"


def _confidence_level_from_row(row: Dict[str, Any]) -> str:
    existing = row.get('confidence_level')
    if isinstance(existing, str) and existing.strip().lower() in CONFIDENCE_ORDER:
        return existing.strip().lower()
    return _score_to_confidence_level(row.get('confidence_score'))


def _is_unique_violation(error: Any) -> bool:
    text = str(error).lower()
    return "duplicate key value violates unique constraint" in text or "duplicate" in text


def _is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def _extract_clause(requirement_id: str) -> str:
    if not requirement_id:
        return "Unknown"
    if '-' in requirement_id:
        try:
            return requirement_id.split('-')[1].split('.')[0]
        except IndexError:
            return "Unknown"
    return "Unknown"


def create_vision_compliance_report(evaluation_id: str, results: List[Dict[str, Any]], summary: Dict[str, Any]) -> None:
    supabase = get_supabase_client()

    by_clause: Dict[str, Dict[str, int]] = {}
    for record in results:
        clause = _extract_clause(str(record.get('requirement_id', '')))
        status = str(record.get('status', '')).upper()
        clause_bucket = by_clause.setdefault(clause, {'pass': 0, 'fail': 0, 'flagged': 0, 'na': 0})
        if status == 'PASS':
            clause_bucket['pass'] += 1
        elif status == 'FAIL':
            clause_bucket['fail'] += 1
        elif status == 'FLAGGED':
            clause_bucket['flagged'] += 1
        elif status == 'NOT_APPLICABLE':
            clause_bucket['na'] += 1

    high_risk = [
        record.get('requirement_id')
        for record in results
        if str(record.get('status')).upper() == 'FAIL' and '4.' in str(record.get('requirement_id', ''))
    ]

    key_gaps: List[str] = []
    for record in results:
        key_gaps.extend(_ensure_list(record.get('gaps')))

    status_counts = summary.get('status_counts', {})
    total = summary.get('total_requirements', len(results))

    summary_stats = {
        'total': total,
        'total_evaluated': total,
        'passed': status_counts.get('PASS', 0),
        'failed': status_counts.get('FAIL', 0),
        'flagged': status_counts.get('FLAGGED', 0),
        'not_applicable': status_counts.get('NOT_APPLICABLE', 0),
        'errors': status_counts.get('ERROR', 0),
        'score': summary.get('compliance_score', 0),
    }

    report_payload = {
        'document_evaluation_id': evaluation_id,
        'report_type': 'full',
        'summary_stats': summary_stats,
        'high_risk_findings': high_risk,
        'key_gaps': list(dict.fromkeys(key_gaps))[:20],  # preserve order, max 20
        'report_format': 'json',
        'generated_at': datetime.utcnow().isoformat(),
    }

    supabase.table('compliance_reports').insert(report_payload).execute()


def persist_vision_results(evaluation_id: str, summary: Dict[str, Any]) -> None:
    supabase = get_supabase_client()
    evaluation_summary = summary.get('evaluation_summary', {})
    status_counts = evaluation_summary.get('status_counts', {})
    total_requirements = evaluation_summary.get('total_requirements', 0)
    compliance_score = evaluation_summary.get('compliance_score', 0)

    document_update = {
        'status': 'completed',
        'completed_at': datetime.utcnow().isoformat(),
        'total_requirements': total_requirements,
        'requirements_passed': status_counts.get('PASS', 0),
        'requirements_failed': status_counts.get('FAIL', 0),
        'requirements_flagged': status_counts.get('FLAGGED', 0),
        'requirements_na': status_counts.get('NOT_APPLICABLE', 0),
        'overall_compliance_score': round(float(compliance_score or 0), 2),
        'updated_at': datetime.utcnow().isoformat(),
    }

    try:
        supabase.table('document_evaluations').update(document_update).eq('id', evaluation_id).execute()
    except Exception as update_error:
        message = str(update_error)
        retried = False
        if 'requirements_flagged' in message:
            document_update.pop('requirements_flagged', None)
            document_update['requirements_partial'] = status_counts.get('FLAGGED', 0)
            retried = True
        if retried:
            supabase.table('document_evaluations').update(document_update).eq('id', evaluation_id).execute()
        else:
            raise

    # Clear existing requirement evaluations for idempotent re-runs
    supabase.table('requirement_evaluations').delete().eq('document_evaluation_id', evaluation_id).execute()

    requirement_records: List[Dict[str, Any]] = []
    for result in summary.get('requirements_results', []):
        status = str(result.get('status', 'ERROR')).upper()
        confidence_level = _normalize_confidence_level(result.get('confidence'))
        record = {
            'document_evaluation_id': evaluation_id,
            'requirement_id': result.get('requirement_id'),
            'status': status,
            'confidence_level': confidence_level,
            'evidence_snippets': _ensure_list(result.get('evidence')),
            'evaluation_rationale': str(result.get('rationale', '')),
            'gaps_identified': _ensure_list(result.get('gaps')),
            'recommendations': _ensure_list(result.get('recommendations')),
            'tokens_used': int(result.get('tokens_used', 0) or 0),
        }
        requirement_records.append(record)

    if requirement_records:
        try:
            supabase.table('requirement_evaluations').insert(requirement_records).execute()
        except Exception as insert_error:
            message = str(insert_error).lower()
            if 'confidence_level' in message:
                fallback_records = []
                for record in requirement_records:
                    level = record.get('confidence_level', 'low')
                    fallback = dict(record)
                    fallback.pop('confidence_level', None)
                    fallback['confidence_score'] = _confidence_score_from_level(level)
                    fallback_records.append(fallback)
                supabase.table('requirement_evaluations').insert(fallback_records).execute()
            else:
                raise

    # Replace existing compliance report
    supabase.table('compliance_reports').delete().eq('document_evaluation_id', evaluation_id).execute()
    create_vision_compliance_report(evaluation_id, requirement_records, {
        'status_counts': status_counts,
        'total_requirements': total_requirements,
        'compliance_score': compliance_score,
    })

# Pydantic models
class EvaluationStatus(BaseModel):
    id: str
    status: str
    document_name: str
    progress: Optional[int] = 0
    created_at: str
    completed_at: Optional[str] = None
    overall_compliance_score: Optional[float] = None
    requirements_passed: Optional[int] = None
    requirements_failed: Optional[int] = None
    requirements_flagged: Optional[int] = None
    requirements_partial: Optional[int] = None
    requirements_na: Optional[int] = None
    error_message: Optional[str] = None

class RequirementResult(BaseModel):
    requirement_id: str
    title: str
    status: str
    confidence_level: Literal["low", "medium", "high"]
    confidence_score: Optional[float] = None  # Derived from confidence_level for backwards compatibility
    evidence_snippets: List[str]
    evaluation_rationale: str
    gaps_identified: List[str]
    recommendations: List[str]

class ComplianceReport(BaseModel):
    evaluation_id: str
    document_name: str
    overall_score: float
    summary_stats: Dict
    requirements: List[RequirementResult]
    high_risk_findings: List[str]
    key_gaps: List[str]


class DocumentMarkdownResponse(BaseModel):
    filename: str
    page_count: int
    markdown_content: str
    pages: List[str]
    metadata: Dict[str, Any]
    supabase_id: Optional[str] = None


class ISORequirementResponse(BaseModel):
    id: str
    clause: str
    title: str
    requirement_text: str
    acceptance_criteria: Optional[str] = None
    expected_artifacts: Optional[str] = None
    guidance_notes: Optional[str] = None
    evaluation_type: Optional[str] = None


class ISORequirementCreate(BaseModel):
    clause: str
    title: str
    requirement_text: str
    acceptance_criteria: Optional[str] = None
    expected_artifacts: Optional[str] = None
    guidance_notes: Optional[str] = None
    evaluation_type: Optional[str] = None


class ISORequirementUpdate(BaseModel):
    clause: Optional[str] = None
    title: Optional[str] = None
    requirement_text: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    expected_artifacts: Optional[str] = None
    guidance_notes: Optional[str] = None
    evaluation_type: Optional[str] = None


class RequirementFeedbackCreate(BaseModel):
    requirement_id: str
    is_helpful: Optional[bool] = None
    comment: Optional[str] = None


class RequirementFeedbackResponse(BaseModel):
    evaluation_id: str
    requirement_id: str
    is_helpful: Optional[bool] = None
    comment: Optional[str] = None
    created_at: str
    updated_at: str


@app.on_event("startup")
async def startup_event():
    """Initialize pipeline and supporting services on startup"""
    global pipeline, vision_evaluator, document_intelligence_service

    if EVALUATION_PIPELINE == "direct":
        logger.error("Direct evaluation pipeline has been disabled. Set EVALUATION_PIPELINE=vision.")
        raise RuntimeError("Direct evaluation pipeline has been disabled. Configure EVALUATION_PIPELINE=vision.")

    try:
        pipeline = None
        vision_evaluator = None

        if EVALUATION_PIPELINE == "vision":
            if not VISION_PIPELINE_AVAILABLE or VisionResponsesEvaluator is None:
                raise RuntimeError("Vision evaluator is not available but EVALUATION_PIPELINE=vision was requested")
            vision_evaluator = VisionResponsesEvaluator()
            if getattr(vision_evaluator, "supabase", None) is None:
                raise RuntimeError("Vision evaluator requires Supabase credentials; none were provided")
            logger.info("Vision evaluator initialized successfully")
        elif EVALUATION_PIPELINE == "azure":
            if AZURE_PIPELINE_AVAILABLE and CompliancePipeline is not None:
                config = Config()
                pipeline = CompliancePipeline()
                logger.info("Azure pipeline initialized successfully")
            else:
                raise RuntimeError("Azure pipeline is not available but EVALUATION_PIPELINE=azure was requested")
        else:
            raise RuntimeError(f"Unsupported EVALUATION_PIPELINE setting: {EVALUATION_PIPELINE}")

        if DOCUMENT_INTELLIGENCE_AVAILABLE:
            try:
                document_intelligence_service = DocumentIntelligenceService()
                logger.info("Document Intelligence service initialized successfully")
            except Exception as doc_error:
                document_intelligence_service = None
                logger.warning(f"Document Intelligence service initialization failed: {doc_error}")
        else:
            logger.info("Document Intelligence service dependencies not available")

    except Exception as e:
        logger.error(f"Failed to initialize evaluators: {e}")
        raise


@app.get("/")
async def root():
    """Health check endpoint"""
    if pipeline is not None:
        mode = "azure_pipeline"
    elif vision_evaluator is not None:
        mode = "vision_responses"
    else:
        mode = "unconfigured"

    supabase_status = "Available" if (
        (pipeline is not None)
        or (vision_evaluator is not None and vision_evaluator.supabase is not None)
    ) else "Unavailable"
    doc_intel_status = "Available" if document_intelligence_service is not None else "Unavailable"
    return {
        "message": "ISO 14971 Compliance API is running",
        "status": "healthy",
        "mode": mode,
        "supabase": supabase_status,
        "azure_available": AZURE_PIPELINE_AVAILABLE,
        "document_intelligence": doc_intel_status,
        "configured_pipeline": EVALUATION_PIPELINE,
        "vision_available": VISION_PIPELINE_AVAILABLE,
    }


@app.post("/api/upload/simple")
async def upload_document_simple(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """Legacy simplified upload endpoint (disabled)."""
    logger.warning("/api/upload/simple was called but the direct evaluator has been disabled")
    raise HTTPException(status_code=503, detail="Direct evaluator pipeline has been disabled. Use the vision pipeline instead.")


@app.post("/api/document-intelligence/markdown", response_model=DocumentMarkdownResponse)
async def convert_document_to_markdown(
    file: UploadFile = File(...),
    output_format: str = Query("markdown", pattern="^(markdown|text)$"),
    sanitize: bool = Query(True, description="Clean Azure output (HTML removal, comment stripping)"),
    convert_tables: bool = Query(True, description="Convert HTML tables to markdown tables"),
    strip_comments: bool = Query(True, description="Remove HTML comments from the output"),
    store_in_supabase: bool = Query(False, description="Persist the processed markdown to Supabase")
):
    """Convert an uploaded document to markdown using Azure Document Intelligence"""
    if document_intelligence_service is None:
        raise HTTPException(status_code=503, detail="Document Intelligence service is not configured")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        result = await document_intelligence_service.extract_markdown_with_page_splitting(
            document_bytes=file_bytes,
            filename=file.filename,
            output_format=output_format,
            sanitize=sanitize,
            convert_tables=convert_tables,
            strip_comments=strip_comments
        )

        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error') or "Document analysis failed")

        supabase_id: Optional[str] = None
        metadata = dict(result.get('metadata') or {})

        if store_in_supabase:
            try:
                supabase = get_supabase_client()
                record = {
                    'filename': file.filename,
                    'markdown_content': result.get('markdown_content'),
                    'page_count': result.get('page_count'),
                    'extraction_metadata': metadata,
                    'processed_at': datetime.utcnow().isoformat(),
                    'status': 'processed'
                }
                supabase_result = supabase.table('processed_documents').insert(record).execute()
                if supabase_result.data:
                    supabase_id = supabase_result.data[0]['id']
            except Exception as store_error:
                logger.error(f"Failed to store processed document: {store_error}")
                raise HTTPException(status_code=500, detail=f"Failed to store processed document: {store_error}")

        metadata = metadata.copy()
        storage_meta = metadata.setdefault('storage', {})
        storage_meta['stored_in_supabase'] = bool(supabase_id)
        if supabase_id is not None:
            storage_meta['record_id'] = supabase_id

        return DocumentMarkdownResponse(
            filename=file.filename,
            page_count=result.get('page_count', 0),
            markdown_content=result.get('markdown_content') or "",
            pages=result.get('pages', []),
            metadata=metadata,
            supabase_id=supabase_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document intelligence conversion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Upload document and start evaluation process
    """
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        if not file.filename.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        # Upload to Azure Storage
        blob_service_client = BlobServiceClient.from_connection_string(
            os.getenv('AZURE_STORAGE_CONNECTION_STRING')
        )
        
        blob_client = blob_service_client.get_blob_client(
            container="sc-documents",
            blob=unique_filename
        )
        
        # Upload file
        content = await file.read()
        blob_client.upload_blob(content, overwrite=True)
        
        logger.info(f"Uploaded {file.filename} as {unique_filename}")
        
        # Create document evaluation record
        evaluation_data = {
            'document_name': file.filename,
            'status': 'in_progress',
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = get_supabase_client().table('document_evaluations').insert(evaluation_data).execute()
        evaluation_id = result.data[0]['id']
        
        # Start background evaluation
        background_tasks.add_task(run_evaluation, evaluation_id, unique_filename)
        
        return {
            "evaluation_id": evaluation_id,
            "filename": file.filename,
            "status": "in_progress",
            "message": "Document uploaded successfully. Evaluation started."
        }
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



async def run_evaluation(evaluation_id: str, blob_name: str):
    """Background task to run document evaluation"""
    try:
        logger.info(f"Starting evaluation for {blob_name}")
        try:
            import openai
            logger.info(
                "OpenAI SDK in use: %s (%s)",
                getattr(openai, "__version__", "unknown"),
                getattr(openai, "__file__", "unknown"),
            )
        except Exception as version_error:
            logger.warning(f"Unable to read OpenAI SDK metadata: {version_error}")

        # Keep status as in_progress while processing
        # Note: Database only allows: pending, in_progress, completed, error
        # The record already has 'in_progress' status, so no need to update here

        # Run evaluation - use the Azure pipeline when available, otherwise fall back to the configured evaluator
        if pipeline is not None:
            # Use Azure pipeline
            await pipeline.evaluate_document(blob_name, evaluation_id)
        else:
            # Download blob to temp file and evaluate with configured pipeline
            from azure.storage.blob import BlobServiceClient
            import tempfile

            blob_service_client = BlobServiceClient.from_connection_string(
                os.getenv('AZURE_STORAGE_CONNECTION_STRING')
            )
            blob_client = blob_service_client.get_blob_client(
                container="sc-documents",
                blob=blob_name
            )

            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(blob_name)[1]) as temp_file:
                blob_data = blob_client.download_blob()
                temp_file.write(blob_data.readall())
                temp_file_path = temp_file.name

            try:
                logger.info("Active pipeline: %s", get_active_pipeline_name())
                if vision_evaluator is None or EVALUATION_PIPELINE != "vision":
                    raise RuntimeError("Vision evaluator pipeline is not configured")
                summary = await vision_evaluator.evaluate_document(temp_file_path)
                persist_vision_results(evaluation_id, summary)
            finally:
                try:
                    os.remove(temp_file_path)
                except FileNotFoundError:
                    pass

        logger.info(f"Evaluation completed for {blob_name}")

    except Exception as e:
        logger.error(f"Evaluation error: {e}")
        # Update with error status
        get_supabase_client().table('document_evaluations').update({
            'status': 'failed',
            'error_message': str(e),
            'completed_at': datetime.utcnow().isoformat()
        }).eq('id', evaluation_id).execute()


@app.get("/api/requirements", response_model=List[ISORequirementResponse])
async def list_iso_requirements():
    """Return ISO requirements from Supabase."""
    supabase = get_supabase_client()
    try:
        response = supabase.table('iso_requirements') \
            .select('*') \
            .order('clause') \
            .execute()
    except Exception as error:
        logger.error(f"Failed to fetch ISO requirements: {error}")
        raise HTTPException(status_code=500, detail="Failed to load requirements")

    data = getattr(response, 'data', []) or []

    requirements: List[ISORequirementResponse] = []
    for row in data:
        requirement_id = row.get('id')
        clause = row.get('clause')
        title = row.get('title')
        requirement_text = row.get('requirement_text')

        if not requirement_id or not clause or not title or not requirement_text:
            logger.warning("Skipping malformed requirement row: %s", row)
            continue

        requirements.append(ISORequirementResponse(
            id=str(requirement_id),
            clause=str(clause),
            title=str(title),
            requirement_text=str(requirement_text),
            acceptance_criteria=row.get('acceptance_criteria'),
            expected_artifacts=row.get('expected_artifacts'),
            guidance_notes=row.get('guidance_notes'),
            evaluation_type=row.get('evaluation_type'),
        ))

    return requirements


@app.post("/api/requirements", response_model=ISORequirementResponse, status_code=201)
async def create_iso_requirement(payload: ISORequirementCreate):
    """Create a new ISO requirement in Supabase."""
    clause = payload.clause.strip()
    title = payload.title.strip()
    requirement_text = payload.requirement_text.strip()

    if not clause:
        raise HTTPException(status_code=400, detail="Clause is required")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not requirement_text:
        raise HTTPException(status_code=400, detail="Requirement text is required")

    requirement_id = str(uuid.uuid4())
    record = {
        'id': requirement_id,
        'clause': clause,
        'title': title,
        'requirement_text': requirement_text,
        'acceptance_criteria': _normalize_optional_text(payload.acceptance_criteria),
        'expected_artifacts': _normalize_optional_text(payload.expected_artifacts),
        'guidance_notes': _normalize_optional_text(payload.guidance_notes),
        'evaluation_type': _normalize_optional_text(payload.evaluation_type),
        'updated_at': datetime.utcnow().isoformat(),
    }

    supabase = get_supabase_client()
    try:
        response = supabase.table('iso_requirements').insert(record).execute()
    except Exception as error:
        logger.error(f"Failed to insert ISO requirement: {error}")
        if _is_unique_violation(error):
            raise HTTPException(status_code=409, detail="A requirement with the same clause or title already exists")
        raise HTTPException(status_code=500, detail="Failed to create requirement")

    if getattr(response, 'error', None):
        logger.error("Supabase error during requirement insert: %s", response.error)
        if _is_unique_violation(response.error):
            raise HTTPException(status_code=409, detail="A requirement with the same clause or title already exists")
        raise HTTPException(status_code=500, detail="Failed to create requirement")

    data = getattr(response, 'data', None)
    saved = data[0] if data else record

    return ISORequirementResponse(
        id=str(saved.get('id', requirement_id)),
        clause=str(saved.get('clause', clause)),
        title=str(saved.get('title', title)),
        requirement_text=str(saved.get('requirement_text', requirement_text)),
        acceptance_criteria=saved.get('acceptance_criteria'),
        expected_artifacts=saved.get('expected_artifacts'),
        guidance_notes=saved.get('guidance_notes'),
        evaluation_type=saved.get('evaluation_type'),
    )


@app.put("/api/requirements/{requirement_id}", response_model=ISORequirementResponse)
async def update_iso_requirement(requirement_id: str, payload: ISORequirementUpdate):
    """Update an existing ISO requirement in Supabase."""
    updates: Dict[str, Any] = {}

    if payload.clause is not None:
        clause = payload.clause.strip()
        if not clause:
            raise HTTPException(status_code=400, detail="Clause is required")
        updates['clause'] = clause

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
        updates['title'] = title

    if payload.requirement_text is not None:
        requirement_text = payload.requirement_text.strip()
        if not requirement_text:
            raise HTTPException(status_code=400, detail="Requirement text is required")
        updates['requirement_text'] = requirement_text

    if payload.acceptance_criteria is not None:
        updates['acceptance_criteria'] = _normalize_optional_text(payload.acceptance_criteria)

    if payload.expected_artifacts is not None:
        updates['expected_artifacts'] = _normalize_optional_text(payload.expected_artifacts)

    if payload.guidance_notes is not None:
        updates['guidance_notes'] = _normalize_optional_text(payload.guidance_notes)

    if payload.evaluation_type is not None:
        updates['evaluation_type'] = _normalize_optional_text(payload.evaluation_type)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    updates['updated_at'] = datetime.utcnow().isoformat()

    supabase = get_supabase_client()

    # Ensure requirement exists before attempting update
    try:
        existing = supabase.table('iso_requirements').select('id').eq('id', requirement_id).single().execute()
    except Exception as error:
        logger.error(f"Failed to fetch ISO requirement {requirement_id}: {error}")
        raise HTTPException(status_code=500, detail="Failed to update requirement")

    if not getattr(existing, 'data', None):
        raise HTTPException(status_code=404, detail="Requirement not found")

    try:
        response = supabase.table('iso_requirements').update(updates).eq('id', requirement_id).execute()
    except Exception as error:
        logger.error(f"Failed to update ISO requirement {requirement_id}: {error}")
        if _is_unique_violation(error):
            raise HTTPException(status_code=409, detail="A requirement with the same clause or title already exists")
        raise HTTPException(status_code=500, detail="Failed to update requirement")

    data = getattr(response, 'data', []) or []
    saved = data[0] if data else None
    if saved is None:
        raise HTTPException(status_code=500, detail="Failed to load updated requirement")

    return ISORequirementResponse(
        id=str(saved.get('id', requirement_id)),
        clause=str(saved.get('clause', updates.get('clause', ''))),
        title=str(saved.get('title', updates.get('title', ''))),
        requirement_text=str(saved.get('requirement_text', updates.get('requirement_text', ''))),
        acceptance_criteria=saved.get('acceptance_criteria'),
        expected_artifacts=saved.get('expected_artifacts'),
        guidance_notes=saved.get('guidance_notes'),
        evaluation_type=saved.get('evaluation_type'),
    )


@app.delete("/api/requirements/{requirement_id}", status_code=204)
async def delete_iso_requirement(requirement_id: str):
    """Delete an ISO requirement from Supabase."""
    supabase = get_supabase_client()

    # Ensure requirement exists to return proper 404
    try:
        existing = supabase.table('iso_requirements').select('id').eq('id', requirement_id).single().execute()
    except Exception as error:
        logger.error(f"Failed to fetch ISO requirement {requirement_id}: {error}")
        raise HTTPException(status_code=500, detail="Failed to delete requirement")

    if not getattr(existing, 'data', None):
        raise HTTPException(status_code=404, detail="Requirement not found")

    try:
        supabase.table('iso_requirements').delete().eq('id', requirement_id).execute()
    except Exception as error:
        logger.error(f"Failed to delete ISO requirement {requirement_id}: {error}")
        raise HTTPException(status_code=500, detail="Failed to delete requirement")

    return Response(status_code=204)


@app.get("/api/evaluations", response_model=List[EvaluationStatus])
async def list_evaluations():
    """Get all document evaluations"""
    try:
        result = get_supabase_client().table('document_evaluations') \
            .select("*") \
            .order('created_at', desc=True) \
            .execute()
        
        evaluations = []
        for row in result.data:
            flagged = row.get('requirements_flagged')
            if flagged is None:
                flagged = row.get('requirements_partial')
            partial = row.get('requirements_partial')
            if partial is None and flagged is not None:
                partial = flagged
            evaluations.append(EvaluationStatus(
                id=row['id'],
                status=row['status'],
                document_name=row['document_name'],
                created_at=row['created_at'],
                completed_at=row.get('completed_at'),
                overall_compliance_score=row.get('overall_compliance_score'),
                requirements_passed=row.get('requirements_passed'),
                requirements_failed=row.get('requirements_failed'),
                requirements_flagged=flagged,
                requirements_partial=partial,
                requirements_na=row.get('requirements_na'),
                error_message=row.get('error_message')
            ))
        
        return evaluations
        
    except Exception as e:
        logger.error(f"List evaluations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluations/{evaluation_id}", response_model=EvaluationStatus)
async def get_evaluation_status(evaluation_id: str):
    """Get status of specific evaluation"""
    try:
        result = get_supabase_client().table('document_evaluations') \
            .select("*") \
            .eq('id', evaluation_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        
        row = result.data
        flagged = row.get('requirements_flagged')
        if flagged is None:
            flagged = row.get('requirements_partial')
        partial = row.get('requirements_partial')
        if partial is None and flagged is not None:
            partial = flagged
        return EvaluationStatus(
            id=row['id'],
            status=row['status'],
            document_name=row['document_name'],
            created_at=row['created_at'],
            completed_at=row.get('completed_at'),
            overall_compliance_score=row.get('overall_compliance_score'),
            requirements_passed=row.get('requirements_passed'),
            requirements_failed=row.get('requirements_failed'),
            requirements_flagged=flagged,
            requirements_partial=partial,
            requirements_na=row.get('requirements_na'),
            error_message=row.get('error_message')
        )
        
    except Exception as e:
        logger.error(f"Get evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluations/{evaluation_id}/results")
async def get_evaluation_results(evaluation_id: str):
    """Get detailed evaluation results"""
    try:
        # Get requirement evaluations
        result = get_supabase_client().table('requirement_evaluations') \
            .select("*, iso_requirements(title, clause)") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="No results found")
        
        requirements = []
        for row in result.data:
            iso_requirement = row.get('iso_requirements') or {}
            level = _confidence_level_from_row(row)
            score_value = row.get('confidence_score')
            if score_value is None:
                score_value = _confidence_score_from_level(level)
            requirements.append(RequirementResult(
                requirement_id=row['requirement_id'],
                title=row.get('title') or iso_requirement.get('title', ''),
                status=row['status'],
                confidence_level=level,
                confidence_score=score_value,
                evidence_snippets=row.get('evidence_snippets', []),
                evaluation_rationale=row.get('evaluation_rationale', ''),
                gaps_identified=row.get('gaps_identified', []),
                recommendations=row.get('recommendations', [])
            ))
        
        return {"requirements": requirements}
        
    except Exception as e:
        logger.error(f"Get results error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluations/{evaluation_id}/report", response_model=ComplianceReport)
async def get_compliance_report(evaluation_id: str):
    """Get comprehensive compliance report"""
    try:
        # Get evaluation summary
        eval_result = get_supabase_client().table('document_evaluations') \
            .select("*") \
            .eq('id', evaluation_id) \
            .single() \
            .execute()
        
        if not eval_result.data:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        
        # Get compliance report
        report_result = get_supabase_client().table('compliance_reports') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .single() \
            .execute()
        
        # Get requirement results
        req_result = get_supabase_client().table('requirement_evaluations') \
            .select("*, iso_requirements(title, clause)") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        eval_data = eval_result.data
        report_data = report_result.data if report_result.data else {}
        
        requirements = []
        for row in req_result.data:
            iso_requirement = row.get('iso_requirements') or {}
            level = _confidence_level_from_row(row)
            score_value = row.get('confidence_score')
            if score_value is None:
                score_value = _confidence_score_from_level(level)
            requirements.append(RequirementResult(
                requirement_id=row['requirement_id'],
                title=row.get('title') or iso_requirement.get('title', ''),
                status=row['status'],
                confidence_level=level,
                confidence_score=score_value,
                evidence_snippets=row.get('evidence_snippets', []),
                evaluation_rationale=row.get('evaluation_rationale', ''),
                gaps_identified=row.get('gaps_identified', []),
                recommendations=row.get('recommendations', [])
            ))
        
        return ComplianceReport(
            evaluation_id=evaluation_id,
            document_name=eval_data['document_name'],
            overall_score=eval_data.get('overall_compliance_score', 0),
            summary_stats=report_data.get('summary_stats', {}),
            requirements=requirements,
            high_risk_findings=report_data.get('high_risk_findings', []),
            key_gaps=report_data.get('key_gaps', [])
        )
        
    except Exception as e:
        logger.error(f"Get report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/evaluations/{evaluation_id}")
async def delete_evaluation(evaluation_id: str):
    """Delete an evaluation and its results"""
    try:
        # Delete requirement evaluations
        get_supabase_client().table('requirement_evaluations') \
            .delete() \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()

        # Delete compliance reports
        get_supabase_client().table('compliance_reports') \
            .delete() \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()

        # Delete document evaluation
        get_supabase_client().table('document_evaluations') \
            .delete() \
            .eq('id', evaluation_id) \
            .execute()

        return {"message": "Evaluation deleted successfully"}

    except Exception as e:
        logger.error(f"Delete evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluations/{evaluation_id}/feedback", response_model=List[RequirementFeedbackResponse])
async def get_requirement_feedback(evaluation_id: str):
    """Get all feedback for an evaluation"""
    # Validate evaluation_id is a valid UUID
    if not _is_valid_uuid(evaluation_id):
        raise HTTPException(status_code=400, detail="Invalid evaluation_id format. Must be a valid UUID.")

    try:
        result = get_supabase_client().table('requirement_evaluations') \
            .select("requirement_id, is_helpful, feedback_comment, feedback_updated_at, created_at") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()

        # Return empty array if no results
        if not result.data:
            return []

        feedback_records = []
        for row in result.data:
            feedback_records.append(RequirementFeedbackResponse(
                evaluation_id=evaluation_id,
                requirement_id=row['requirement_id'],
                is_helpful=row.get('is_helpful'),
                comment=row.get('feedback_comment'),
                created_at=row['created_at'],
                updated_at=row.get('feedback_updated_at') or row['created_at']
            ))

        return feedback_records

    except Exception as e:
        logger.error(f"Get feedback error: {e}")
        raise HTTPException(status_code=500, detail={"detail": str(e)})


@app.post("/api/evaluations/{evaluation_id}/feedback", response_model=RequirementFeedbackResponse)
async def upsert_requirement_feedback(evaluation_id: str, payload: RequirementFeedbackCreate):
    """Create or update feedback for a requirement"""
    # Validate evaluation_id is a valid UUID
    if not _is_valid_uuid(evaluation_id):
        raise HTTPException(status_code=400, detail="Invalid evaluation_id format. Must be a valid UUID.")

    # Validate requirement_id is present
    if not payload.requirement_id or not payload.requirement_id.strip():
        raise HTTPException(status_code=400, detail="requirement_id is required")

    # Check if evaluation exists
    try:
        eval_result = get_supabase_client().table('document_evaluations') \
            .select('id') \
            .eq('id', evaluation_id) \
            .execute()

        if not eval_result.data:
            raise HTTPException(status_code=404, detail="Evaluation not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking evaluation existence: {e}")
        raise HTTPException(status_code=500, detail={"detail": str(e)})

    # Normalize comment: trim and treat empty as null
    comment_value = _normalize_optional_text(payload.comment)

    # Prepare update data for feedback fields
    feedback_data = {
        'is_helpful': payload.is_helpful,
        'feedback_comment': comment_value,
        'feedback_updated_at': datetime.utcnow().isoformat(),
    }

    try:
        # Update the requirement_evaluations record
        result = get_supabase_client().table('requirement_evaluations') \
            .update(feedback_data) \
            .eq('document_evaluation_id', evaluation_id) \
            .eq('requirement_id', payload.requirement_id.strip()) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=500, detail={"detail": "Failed to save feedback"})

        saved = result.data[0]

        return RequirementFeedbackResponse(
            evaluation_id=evaluation_id,
            requirement_id=saved['requirement_id'],
            is_helpful=saved.get('is_helpful'),
            comment=saved.get('feedback_comment'),
            created_at=saved['created_at'],
            updated_at=saved.get('feedback_updated_at') or saved['created_at']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upsert feedback error: {e}")
        raise HTTPException(status_code=500, detail={"detail": str(e)})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
