#!/usr/bin/env python3
"""
FastAPI application for ISO 14971 Compliance Pipeline
Provides REST endpoints for document upload, evaluation, and results
"""

import os
import json
import uuid
import asyncio
import tempfile
from datetime import datetime
from typing import List, Dict, Optional, Any, Literal
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import summary generator
try:
    from api.summary_generator import generate_executive_summary_sync
except ImportError:
    from summary_generator import generate_executive_summary_sync

# Import evaluation queue and rate limiter
try:
    from api.evaluation_queue import get_evaluation_queue, EvaluationQueue, QueueConfig
    from api.rate_limiter import get_rate_limiter
except ImportError:
    from evaluation_queue import get_evaluation_queue, EvaluationQueue, QueueConfig
    from rate_limiter import get_rate_limiter

# Local imports
import sys

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
TEST_EVALUATION_DIR = ROOT_DIR / "test_evaluation"

# Load environment variables (root .env first, then fallback to local)
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BASE_DIR / ".env")


def _split_env_list(raw: Optional[str]) -> List[str]:
    """Split comma/space separated env vars into clean origin entries."""
    if not raw:
        return []
    items = []
    for part in raw.replace(" ", ",").split(","):
        cleaned = part.strip().rstrip("/")
        if cleaned:
            items.append(cleaned)
    return items


def _get_allowed_origins() -> List[str]:
    """Build CORS origins list from defaults + environment overrides."""
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    allow_all = os.getenv("CORS_ALLOW_ALL", "false").lower() in {"1", "true", "yes"}
    if allow_all:
        logger.info("CORS_ALLOW_ALL enabled - allowing all origins")
        return ["*"]

    configured_origins: List[str] = []
    for key in ("FRONTEND_URL", "CORS_ALLOW_ORIGINS"):
        configured_origins.extend(_split_env_list(os.getenv(key)))

    # Preserve ordering but remove duplicates
    seen = set()
    merged: List[str] = []
    for origin in default_origins + configured_origins:
        if origin and origin not in seen:
            seen.add(origin)
            merged.append(origin)

    logger.info("Allowed CORS origins: %s", merged)
    return merged or default_origins

# Ensure API dir is first to resolve vision_responses_evaluator before test fixtures
for path in (BASE_DIR, ROOT_DIR, SCRIPTS_DIR, TEST_EVALUATION_DIR):
    str_path = str(path)
    if str_path not in sys.path:
        sys.path.append(str_path)

raw_pipeline = os.getenv("EVALUATION_PIPELINE", "vision").lower()
if raw_pipeline == "azure":
    logger.warning("EVALUATION_PIPELINE=azure is no longer supported – defaulting to vision pipeline")
EVALUATION_PIPELINE = "vision" if raw_pipeline == "azure" else raw_pipeline

# Feature flag: Set ADMIN_MODE=true to enable requirement management (create/update/delete)
ADMIN_MODE = os.getenv("ADMIN_MODE", "false").lower() in {"1", "true", "yes"}

# Vision evaluator (optional)
try:
    from vision_responses_evaluator import VisionResponsesEvaluator, DualVisionComparator  # type: ignore
    VISION_PIPELINE_AVAILABLE = True
except ImportError as vision_import_error:
    logger.warning(f"Vision evaluator not available: {vision_import_error}")
    VisionResponsesEvaluator = None  # type: ignore
    DualVisionComparator = None  # type: ignore
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
ALLOWED_CORS_ORIGINS = _get_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global pipeline instances
pipeline: Optional[CompliancePipeline] = None
vision_evaluator: Optional[VisionResponsesEvaluator] = None
document_intelligence_service: Optional[DocumentIntelligenceService] = None
evaluation_queue: Optional[EvaluationQueue] = None


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    """Simple health check for deploy environments."""
    return {
        "status": "ok",
        "pipeline": get_active_pipeline_name(),
        "model": get_active_model_name(),
        "vision_provider": get_active_provider_name(),
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


def get_active_provider_name() -> Optional[str]:
    if vision_evaluator is not None:
        return getattr(vision_evaluator, "provider", None)
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


def create_vision_compliance_report(
    evaluation_id: str,
    results: List[Dict[str, Any]],
    summary: Dict[str, Any],
    executive_summary: Optional[Dict[str, Any]] = None
) -> None:
    supabase = get_supabase_client()

    # Fetch all requirements to get clause information
    requirements_response = supabase.table('iso_requirements').select('id, clause').execute()
    requirement_clauses = {str(req['id']): req.get('clause', 'Unknown') for req in requirements_response.data}

    by_clause: Dict[str, Dict[str, int]] = {}
    for record in results:
        requirement_id = str(record.get('requirement_id', ''))
        clause = requirement_clauses.get(requirement_id, 'Unknown')
        # Extract the main clause number (e.g., "4.1" -> "4")
        if clause and clause != 'Unknown' and '.' in clause:
            clause = clause.split('.')[0]
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
        if str(record.get('status')).upper() == 'FAIL' and requirement_clauses.get(str(record.get('requirement_id', '')), '').startswith('4.')
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
    agreement_map = summary.get('agreement_by_requirement')
    if agreement_map:
        summary_stats['agreement_by_requirement'] = agreement_map

    report_payload = {
        'document_evaluation_id': evaluation_id,
        'report_type': 'full',
        'summary_stats': summary_stats,
        'high_risk_findings': high_risk,
        'key_gaps': list(dict.fromkeys(key_gaps))[:20],  # preserve order, max 20
        'report_format': 'json',
        'generated_at': datetime.utcnow().isoformat(),
    }

    # Add executive summary if provided
    if executive_summary:
        report_payload['executive_summary'] = executive_summary

    supabase.table('compliance_reports').insert(report_payload).execute()


def persist_vision_results(evaluation_id: str, summary: Dict[str, Any]) -> None:
    supabase = get_supabase_client()
    evaluation_summary = summary.get('evaluation_summary', {})
    status_counts = evaluation_summary.get('status_counts', {})
    total_requirements = evaluation_summary.get('total_requirements', 0)
    compliance_score = evaluation_summary.get('compliance_score', 0)
    agreement_map = summary.get('agreement_by_requirement', {})

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

    # Generate executive summary
    document_name = summary.get('document_info', {}).get('file_name', 'Unknown Document')
    executive_summary = None
    try:
        # Build requirements data for summary generator
        requirements_for_summary = []
        for result in summary.get('requirements_results', []):
            requirements_for_summary.append({
                'requirement_clause': result.get('requirement_clause') or result.get('clause'),
                'title': result.get('requirement_title') or result.get('title', ''),
                'status': str(result.get('status', 'Unknown')).upper(),
                'gaps_identified': _ensure_list(result.get('gaps')),
                'recommendations': _ensure_list(result.get('recommendations')),
            })

        executive_summary = generate_executive_summary_sync(
            document_name=document_name,
            requirements_results=requirements_for_summary,
            overall_score=float(compliance_score or 0)
        )
        if executive_summary:
            logger.info(f"Executive summary generated for evaluation {evaluation_id}")
        else:
            logger.warning(f"Executive summary generation returned None for evaluation {evaluation_id}")
    except Exception as summary_error:
        logger.error(f"Failed to generate executive summary: {summary_error}")
        # Continue without executive summary - it's not critical

    # Replace existing compliance report
    supabase.table('compliance_reports').delete().eq('document_evaluation_id', evaluation_id).execute()
    create_vision_compliance_report(evaluation_id, requirement_records, {
        'status_counts': status_counts,
        'total_requirements': total_requirements,
        'compliance_score': compliance_score,
        'agreement_by_requirement': agreement_map,
    }, executive_summary=executive_summary)

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
    total_requirements: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None

class RequirementResult(BaseModel):
    requirement_id: str
    requirement_clause: Optional[str] = None
    title: str
    status: str
    confidence_level: Literal["low", "medium", "high"]
    confidence_score: Optional[float] = None  # Derived from confidence_level for backwards compatibility
    evidence_snippets: List[str]
    evaluation_rationale: str
    gaps_identified: List[str]
    recommendations: List[str]
    agreement_status: Optional[str] = None

class ComplianceReport(BaseModel):
    evaluation_id: str
    document_name: str
    overall_score: float
    summary_stats: Dict
    requirements: List[RequirementResult]
    high_risk_findings: List[str]
    key_gaps: List[str]
    executive_summary: Optional[Dict[str, Any]] = None


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
    requirement_text: Optional[str] = None
    display_order: int = 0
    evaluation_type: Optional[str] = None


class ISORequirementCreate(BaseModel):
    clause: str
    title: str
    requirement_text: Optional[str] = None
    display_order: Optional[int] = None
    evaluation_type: Optional[str] = None


class ISORequirementUpdate(BaseModel):
    clause: Optional[str] = None
    title: Optional[str] = None
    requirement_text: Optional[str] = None
    display_order: Optional[int] = None
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
    global pipeline, vision_evaluator, document_intelligence_service, evaluation_queue

    if EVALUATION_PIPELINE == "direct":
        logger.error("Direct evaluation pipeline has been disabled. Set EVALUATION_PIPELINE=vision.")
        raise RuntimeError("Direct evaluation pipeline has been disabled. Configure EVALUATION_PIPELINE=vision.")

    try:
        pipeline = None
        vision_evaluator = None

        if EVALUATION_PIPELINE == "vision":
            if not VISION_PIPELINE_AVAILABLE or VisionResponsesEvaluator is None:
                raise RuntimeError("Vision evaluator is not available but EVALUATION_PIPELINE=vision was requested")
            use_dual = os.getenv("VISION_COMPARE_BOTH", "").lower() in {"1", "true", "yes"} or os.getenv("VISION_PROVIDER", "").lower() in {"dual", "both"}
            if use_dual:
                if DualVisionComparator is None:
                    raise RuntimeError("DualVisionComparator is unavailable")
                vision_evaluator = DualVisionComparator()
                logger.info(
                    "Dual vision evaluator initialized (providers=openai+gemini, models=%s)",
                    getattr(vision_evaluator, "model", None),
                )
            else:
                vision_evaluator = VisionResponsesEvaluator()
            if getattr(vision_evaluator, "supabase", None) is None:
                raise RuntimeError("Vision evaluator requires Supabase credentials; none were provided")
            logger.info(
                "Vision evaluator initialized successfully (provider=%s, model=%s)",
                getattr(vision_evaluator, "provider", "openai"),
                getattr(vision_evaluator, "model", None),
            )
        elif EVALUATION_PIPELINE == "azure":
            if AZURE_PIPELINE_AVAILABLE and CompliancePipeline is not None:
                config = Config()
                pipeline = CompliancePipeline()
                logger.info("Azure pipeline initialized successfully")
            else:
                raise RuntimeError("Azure pipeline is not available but EVALUATION_PIPELINE=azure was requested")
        else:
            raise RuntimeError(f"Unsupported EVALUATION_PIPELINE setting: {EVALUATION_PIPELINE}")

        document_intelligence_service = None
        if DOCUMENT_INTELLIGENCE_AVAILABLE:
            logger.info("Document Intelligence service disabled (Azure integration retired)")
        else:
            logger.info("Document Intelligence service dependencies not available")

        # Initialize evaluation queue
        queue_config = QueueConfig(
            max_concurrent=int(os.getenv("MAX_CONCURRENT_EVALUATIONS", "2")),
            max_queue_size=int(os.getenv("MAX_QUEUE_SIZE", "100")),
            processing_timeout_seconds=float(os.getenv("EVALUATION_TIMEOUT_SECONDS", "1800")),
        )
        evaluation_queue = get_evaluation_queue(queue_config)
        evaluation_queue.set_evaluation_callback(run_evaluation)
        await evaluation_queue.start()
        logger.info(
            "Evaluation queue initialized: max_concurrent=%d, max_queue_size=%d",
            queue_config.max_concurrent,
            queue_config.max_queue_size
        )

    except Exception as e:
        logger.error(f"Failed to initialize evaluators: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global evaluation_queue
    if evaluation_queue is not None:
        await evaluation_queue.stop()
        logger.info("Evaluation queue stopped")


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
        "vision_provider": get_active_provider_name(),
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
    """Legacy Azure Document Intelligence endpoint (disabled)"""
    if document_intelligence_service is None:
        raise HTTPException(status_code=503, detail="Document Intelligence service has been retired; use the vision pipeline instead")

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
    file: UploadFile = File(...)
):
    """
    Upload document and add to evaluation queue.
    Returns queue position if not immediately processing.
    """
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        if not file.filename.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # Store locally for the vision pipeline (ChatGPT file upload handled inside evaluator)
        file_extension = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Create document evaluation record with 'pending' status (queued)
        evaluation_data = {
            'document_name': file.filename,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }

        try:
            result = get_supabase_client().table('document_evaluations').insert(evaluation_data).execute()
        except Exception as insert_error:
            logger.error(f"Failed to create evaluation record: {insert_error}")
            try:
                os.remove(temp_file_path)
            except FileNotFoundError:
                pass
            raise HTTPException(status_code=500, detail="Unable to create evaluation record")

        evaluation_id = result.data[0]['id']

        # Add to evaluation queue instead of BackgroundTasks
        if evaluation_queue is None:
            raise HTTPException(status_code=503, detail="Evaluation queue not initialized")

        try:
            queue_item, position = await evaluation_queue.enqueue(
                evaluation_id=evaluation_id,
                file_path=temp_file_path,
                filename=file.filename
            )
        except ValueError as queue_error:
            # Queue is full - update status and return error
            get_supabase_client().table('document_evaluations').update({
                'status': 'error',
                'error_message': str(queue_error),
            }).eq('id', evaluation_id).execute()

            try:
                os.remove(temp_file_path)
            except FileNotFoundError:
                pass

            raise HTTPException(status_code=503, detail=str(queue_error))

        return {
            "evaluation_id": evaluation_id,
            "filename": file.filename,
            "status": "queued" if position > 0 else "processing",
            "queue_position": position,
            "message": (
                f"Document queued for evaluation. Position: {position}"
                if position > 0
                else "Document uploaded successfully. Evaluation started."
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



async def run_evaluation(evaluation_id: str, file_path: str, original_filename: Optional[str] = None):
    """Background task to run document evaluation"""
    try:
        display_name = original_filename or Path(file_path).name
        logger.info(f"Starting evaluation for {display_name} (path={file_path})")
        try:
            import openai
            logger.info(
                "OpenAI SDK in use: %s (%s)",
                getattr(openai, "__version__", "unknown"),
                getattr(openai, "__file__", "unknown"),
            )
        except Exception as version_error:
            logger.warning(f"Unable to read OpenAI SDK metadata: {version_error}")

        # Update status to in_progress (was 'pending' while queued)
        get_supabase_client().table('document_evaluations').update({
            'status': 'in_progress',
            'updated_at': datetime.utcnow().isoformat(),
        }).eq('id', evaluation_id).execute()

        # Run evaluation using the vision pipeline (uploads to ChatGPT's Files API internally)
        logger.info(
            "Active pipeline: %s (provider=%s)",
            get_active_pipeline_name(),
            get_active_provider_name(),
        )
        if vision_evaluator is None or EVALUATION_PIPELINE != "vision":
            raise RuntimeError("Vision evaluator pipeline is not configured")
        summary = await vision_evaluator.evaluate_document(file_path)
        persist_vision_results(evaluation_id, summary)

        logger.info(f"Evaluation completed for {display_name}")

    except Exception as e:
        logger.error(f"Evaluation error: {e}")
        # Update with error status
        get_supabase_client().table('document_evaluations').update({
            'status': 'failed',
            'error_message': str(e),
            'completed_at': datetime.utcnow().isoformat()
        }).eq('id', evaluation_id).execute()
    finally:
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass


@app.get("/api/requirements", response_model=List[ISORequirementResponse])
async def list_iso_requirements():
    """Return ISO requirements from Supabase."""
    supabase = get_supabase_client()
    try:
        response = supabase.table('iso_requirements') \
            .select('*') \
            .order('display_order') \
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

        clause_value = str(clause).strip() if clause is not None else ""
        title_value = str(title).strip() if title is not None else ""

        if not requirement_id or not clause_value or not title_value:
            logger.warning("Skipping malformed requirement row: %s", row)
            continue

        display_order_raw = row.get('display_order')
        try:
            display_order_value = int(display_order_raw) if display_order_raw is not None else 0
        except (TypeError, ValueError):
            display_order_value = 0

        requirements.append(ISORequirementResponse(
            id=str(requirement_id),
            clause=clause_value,
            title=title_value,
            requirement_text=row.get('requirement_text'),
            display_order=display_order_value,
            evaluation_type=row.get('evaluation_type'),
        ))

    return requirements


@app.post("/api/requirements", response_model=ISORequirementResponse, status_code=201)
async def create_iso_requirement(payload: ISORequirementCreate):
    """Create a new ISO requirement in Supabase."""
    if not ADMIN_MODE:
        raise HTTPException(status_code=403, detail="Requirement management is disabled")
    clause = payload.clause.strip()
    title = payload.title.strip()
    display_order = payload.display_order if payload.display_order is not None else None
    requirement_text = _normalize_optional_text(payload.requirement_text)

    if not clause:
        raise HTTPException(status_code=400, detail="Clause is required")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if display_order is not None and display_order < 0:
        raise HTTPException(status_code=400, detail="Order must be zero or a positive integer")

    resolved_order = display_order if display_order is not None else 0

    requirement_id = str(uuid.uuid4())
    record = {
        'id': requirement_id,
        'clause': clause,
        'title': title,
        'requirement_text': requirement_text,
        'display_order': display_order if display_order is not None else resolved_order,
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
        requirement_text=saved.get('requirement_text'),
        display_order=int(saved.get('display_order', record.get('display_order', 0)) or 0),
        evaluation_type=saved.get('evaluation_type'),
    )


@app.put("/api/requirements/{requirement_id}", response_model=ISORequirementResponse)
async def update_iso_requirement(requirement_id: str, payload: ISORequirementUpdate):
    """Update an existing ISO requirement in Supabase."""
    if not ADMIN_MODE:
        raise HTTPException(status_code=403, detail="Requirement management is disabled")
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
        updates['requirement_text'] = _normalize_optional_text(payload.requirement_text)

    if payload.display_order is not None:
        if payload.display_order < 0:
            raise HTTPException(status_code=400, detail="Order must be zero or a positive integer")
        updates['display_order'] = payload.display_order

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
        requirement_text=saved.get('requirement_text', updates.get('requirement_text')),
        display_order=int(saved.get('display_order', updates.get('display_order', 0)) or 0),
        evaluation_type=saved.get('evaluation_type'),
    )


@app.delete("/api/requirements/{requirement_id}", status_code=204)
async def delete_iso_requirement(requirement_id: str):
    """Delete an ISO requirement from Supabase."""
    if not ADMIN_MODE:
        raise HTTPException(status_code=403, detail="Requirement management is disabled")
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
        # Hide evaluations before Dec 16, 2025 (data preserved in DB but not displayed)
        result = get_supabase_client().table('document_evaluations') \
            .select("*") \
            .gte('created_at', '2025-12-16') \
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
                error_message=row.get('error_message'),
                total_requirements=row.get('total_requirements'),
                metadata=row.get('metadata'),
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
            error_message=row.get('error_message'),
            total_requirements=row.get('total_requirements'),
            metadata=row.get('metadata'),
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
                requirement_clause=iso_requirement.get('clause') or row.get('requirement_clause'),
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
        
        summary_stats_map = {}
        if isinstance(report_data.get('summary_stats'), dict):
            summary_stats_map = report_data.get('summary_stats') or {}
        agreement_map = summary_stats_map.get('agreement_by_requirement', {})

        requirements = []
        for row in req_result.data:
            iso_requirement = row.get('iso_requirements') or {}
            level = _confidence_level_from_row(row)
            score_value = row.get('confidence_score')
            if score_value is None:
                score_value = _confidence_score_from_level(level)
            requirements.append(RequirementResult(
                requirement_id=row['requirement_id'],
                requirement_clause=iso_requirement.get('clause') or row.get('requirement_clause'),
                title=row.get('title') or iso_requirement.get('title', ''),
                status=row['status'],
                confidence_level=level,
                confidence_score=score_value,
                evidence_snippets=row.get('evidence_snippets', []),
                evaluation_rationale=row.get('evaluation_rationale', ''),
                gaps_identified=row.get('gaps_identified', []),
                recommendations=row.get('recommendations', []),
                agreement_status=agreement_map.get(str(row['requirement_id'])) if isinstance(agreement_map, dict) else None,
            ))
        
        return ComplianceReport(
            evaluation_id=evaluation_id,
            document_name=eval_data['document_name'],
            overall_score=eval_data.get('overall_compliance_score', 0),
            summary_stats=report_data.get('summary_stats', {}),
            requirements=requirements,
            high_risk_findings=report_data.get('high_risk_findings', []),
            key_gaps=report_data.get('key_gaps', []),
            executive_summary=report_data.get('executive_summary')
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


# Queue status endpoints
@app.get("/api/queue/status")
async def get_queue_status() -> Dict[str, Any]:
    """Get current evaluation queue status."""
    if evaluation_queue is None:
        raise HTTPException(status_code=503, detail="Queue not initialized")

    queue_status = await evaluation_queue.get_status()
    rate_limiter_status = await get_rate_limiter().get_status()

    return {
        "queue": queue_status,
        "rate_limiter": rate_limiter_status,
    }


@app.get("/api/queue/position/{evaluation_id}")
async def get_queue_position(evaluation_id: str) -> Dict[str, Any]:
    """Get queue position for a specific evaluation."""
    if evaluation_queue is None:
        raise HTTPException(status_code=503, detail="Queue not initialized")

    item_status = await evaluation_queue.get_item_status(evaluation_id)

    if item_status is None:
        # Check if it exists in database
        try:
            result = get_supabase_client().table('document_evaluations') \
                .select('id, status') \
                .eq('id', evaluation_id) \
                .single() \
                .execute()

            if result.data:
                return {
                    "evaluation_id": evaluation_id,
                    "status": result.data['status'],
                    "queue_position": None,
                    "message": "Evaluation not in queue"
                }
        except Exception:
            pass

        raise HTTPException(status_code=404, detail="Evaluation not found")

    return {
        "evaluation_id": evaluation_id,
        **item_status,
    }


@app.delete("/api/queue/{evaluation_id}")
async def cancel_queued_evaluation(evaluation_id: str) -> Dict[str, str]:
    """Cancel a pending evaluation in the queue."""
    if evaluation_queue is None:
        raise HTTPException(status_code=503, detail="Queue not initialized")

    cancelled = await evaluation_queue.cancel(evaluation_id)

    if cancelled:
        # Update database status
        get_supabase_client().table('document_evaluations').update({
            'status': 'error',
            'error_message': 'Cancelled by user',
            'completed_at': datetime.utcnow().isoformat()
        }).eq('id', evaluation_id).execute()

        return {"message": "Evaluation cancelled"}

    raise HTTPException(
        status_code=400,
        detail="Cannot cancel - evaluation not in queue or already processing"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
