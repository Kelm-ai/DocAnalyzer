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
from typing import List, Dict, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Azure imports
from azure.storage.blob import BlobServiceClient
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential

# Local imports
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from simple_direct_evaluator import DirectEvaluator

# Try to import original pipeline (may fail due to Azure dependencies)
try:
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scripts'))
    from iso_compliance_pipeline import CompliancePipeline, Config
    AZURE_PIPELINE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Azure pipeline not available: {e}")
    CompliancePipeline = None
    Config = None
    AZURE_PIPELINE_AVAILABLE = False

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
pipeline: CompliancePipeline = None
direct_evaluator: DirectEvaluator = None

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
    requirements_partial: Optional[int] = None
    requirements_na: Optional[int] = None
    error_message: Optional[str] = None

class RequirementResult(BaseModel):
    requirement_id: str
    title: str
    status: str
    confidence_score: float
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


@app.on_event("startup")
async def startup_event():
    """Initialize pipeline on startup"""
    global pipeline, direct_evaluator
    try:
        # Always initialize direct evaluator
        direct_evaluator = DirectEvaluator()
        logger.info("Direct evaluator initialized successfully")
        
        # Try to initialize Azure pipeline if available
        if AZURE_PIPELINE_AVAILABLE:
            config = Config()
            pipeline = CompliancePipeline()
            logger.info("Azure pipeline initialized successfully")
        else:
            logger.info("Azure pipeline not available - running in simplified mode")
            
    except Exception as e:
        logger.error(f"Failed to initialize evaluators: {e}")
        raise


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "ISO 14971 Compliance API is running", "status": "healthy"}


@app.post("/api/upload/simple")
async def upload_document_simple(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Upload document and start simplified evaluation (bypassing Azure)
    """
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported for simplified evaluation")
        
        # Save file locally
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        
        file_path = upload_dir / file.filename
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        logger.info(f"Saved {file.filename} locally for direct evaluation")
        
        # Create document evaluation record
        evaluation_data = {
            'document_name': file.filename,
            'status': 'in_progress',
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = direct_evaluator.supabase.table('document_evaluations').insert(evaluation_data).execute()
        evaluation_id = result.data[0]['id']
        
        # Start background evaluation with direct evaluator
        background_tasks.add_task(run_direct_evaluation, evaluation_id, str(file_path))
        
        return {
            "evaluation_id": evaluation_id,
            "filename": file.filename,
            "status": "in_progress",
            "message": "Document uploaded successfully. Direct evaluation started.",
            "method": "direct_evaluator"
        }
        
    except Exception as e:
        logger.error(f"Simple upload error: {e}")
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
        
        result = pipeline.supabase.table('document_evaluations').insert(evaluation_data).execute()
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


async def run_direct_evaluation(evaluation_id: str, file_path: str):
    """Background task to run direct document evaluation"""
    try:
        logger.info(f"Starting direct evaluation for {file_path}")
        
        # Run evaluation with direct evaluator
        results = await direct_evaluator.evaluate_document(file_path, evaluation_id)
        
        logger.info(f"Direct evaluation completed for {file_path}")
        logger.info(f"Results: {results['overall_score']:.1f}% score")
        
        # Clean up uploaded file
        try:
            os.remove(file_path)
            logger.info(f"Cleaned up file: {file_path}")
        except Exception as e:
            logger.warning(f"Could not clean up file {file_path}: {e}")
        
    except Exception as e:
        logger.error(f"Direct evaluation error: {e}")
        # Update with error status
        direct_evaluator.supabase.table('document_evaluations').update({
            'status': 'error',
            'error_message': str(e),
            'completed_at': datetime.utcnow().isoformat()
        }).eq('id', evaluation_id).execute()


async def run_evaluation(evaluation_id: str, blob_name: str):
    """Background task to run document evaluation"""
    try:
        logger.info(f"Starting evaluation for {blob_name}")
        
        # Keep status as in_progress while processing
        # Note: Database only allows: pending, in_progress, completed, error
        # The record already has 'in_progress' status, so no need to update here
        
        # Run evaluation with progress tracking
        await pipeline.evaluate_document(blob_name, evaluation_id)
        
        logger.info(f"Evaluation completed for {blob_name}")
        
    except Exception as e:
        logger.error(f"Evaluation error: {e}")
        # Update with error status
        pipeline.supabase.table('document_evaluations').update({
            'status': 'error',
            'error_message': str(e),
            'completed_at': datetime.utcnow().isoformat()
        }).eq('id', evaluation_id).execute()


@app.get("/api/evaluations", response_model=List[EvaluationStatus])
async def list_evaluations():
    """Get all document evaluations"""
    try:
        result = pipeline.supabase.table('document_evaluations') \
            .select("*") \
            .order('created_at', desc=True) \
            .execute()
        
        evaluations = []
        for row in result.data:
            evaluations.append(EvaluationStatus(
                id=row['id'],
                status=row['status'],
                document_name=row['document_name'],
                created_at=row['created_at'],
                completed_at=row.get('completed_at'),
                overall_compliance_score=row.get('overall_compliance_score'),
                requirements_passed=row.get('requirements_passed'),
                requirements_failed=row.get('requirements_failed'),
                requirements_partial=row.get('requirements_partial'),
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
        result = pipeline.supabase.table('document_evaluations') \
            .select("*") \
            .eq('id', evaluation_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        
        row = result.data
        return EvaluationStatus(
            id=row['id'],
            status=row['status'],
            document_name=row['document_name'],
            created_at=row['created_at'],
            completed_at=row.get('completed_at'),
            overall_compliance_score=row.get('overall_compliance_score'),
            requirements_passed=row.get('requirements_passed'),
            requirements_failed=row.get('requirements_failed'),
            requirements_partial=row.get('requirements_partial'),
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
        result = pipeline.supabase.table('requirement_evaluations') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="No results found")
        
        requirements = []
        for row in result.data:
            requirements.append(RequirementResult(
                requirement_id=row['requirement_id'],
                title=row.get('title', ''),
                status=row['status'],
                confidence_score=row.get('confidence_score', 0),
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
        eval_result = pipeline.supabase.table('document_evaluations') \
            .select("*") \
            .eq('id', evaluation_id) \
            .single() \
            .execute()
        
        if not eval_result.data:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        
        # Get compliance report
        report_result = pipeline.supabase.table('compliance_reports') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .single() \
            .execute()
        
        # Get requirement results
        req_result = pipeline.supabase.table('requirement_evaluations') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        eval_data = eval_result.data
        report_data = report_result.data if report_result.data else {}
        
        requirements = []
        for row in req_result.data:
            requirements.append(RequirementResult(
                requirement_id=row['requirement_id'],
                title=row.get('title', ''),
                status=row['status'],
                confidence_score=row.get('confidence_score', 0),
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
        pipeline.supabase.table('requirement_evaluations') \
            .delete() \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        # Delete compliance reports
        pipeline.supabase.table('compliance_reports') \
            .delete() \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        # Delete document evaluation
        pipeline.supabase.table('document_evaluations') \
            .delete() \
            .eq('id', evaluation_id) \
            .execute()
        
        return {"message": "Evaluation deleted successfully"}
        
    except Exception as e:
        logger.error(f"Delete evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )