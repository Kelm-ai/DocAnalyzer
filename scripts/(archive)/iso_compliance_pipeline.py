#!/usr/bin/env python3
"""
ISO 14971 Compliance Evaluation Pipeline
Main orchestration service that connects Azure Search results with LLM evaluation
"""

import os
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass
import logging

from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential
from openai import AzureOpenAI
from supabase import create_client, Client
from dotenv import load_dotenv
from document_intelligence_service import DocumentIntelligenceService, DocumentIntelligenceConfig

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO')),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

CONFIDENCE_TO_SCORE = {
    'low': 0.3,
    'medium': 0.6,
    'high': 0.9
}


def _confidence_score_from_level(level: str) -> float:
    return CONFIDENCE_TO_SCORE.get(level.lower(), 0.0)

@dataclass
class Config:
    """Application configuration"""
    # Azure OpenAI
    openai_endpoint: str = os.getenv('AZURE_OPENAI_ENDPOINT')
    openai_key: str = os.getenv('AZURE_OPENAI_KEY')
    openai_deployment: str = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o')
    openai_api_version: str = os.getenv('AZURE_OPENAI_API_VERSION', '2024-12-01-preview')
    
    # Azure Search
    search_endpoint: str = os.getenv('AZURE_SEARCH_ENDPOINT')
    search_key: str = os.getenv('AZURE_SEARCH_KEY')
    search_index: str = os.getenv('AZURE_SEARCH_INDEX', 'iso-analysis')
    
    # Supabase
    supabase_url: str = os.getenv('SUPABASE_URL')
    supabase_key: str = os.getenv('SUPABASE_ANON_KEY')


class AzureSearchService:
    """Service for querying Azure AI Search"""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = SearchClient(
            endpoint=config.search_endpoint,
            index_name=config.search_index,
            credential=AzureKeyCredential(config.search_key)
        )
    
    async def search_for_requirement(
        self, 
        requirement: Dict,
        document_filter: Optional[str] = None,
        top_k: int = 10
    ) -> List[Dict]:
        """
        Search for evidence related to a specific ISO requirement
        
        Args:
            requirement: ISO requirement dictionary with pre-generated search_query
            document_filter: Optional filter for specific document
            top_k: Number of results to return
        
        Returns:
            List of search results with content and metadata
        """
        # Use pre-generated search query from database
        search_text = requirement.get('search_query')
        
        # Fallback to basic query if search_query is missing
        if not search_text:
            search_text = f"{requirement['title']} {requirement['requirement_text']}"
            logger.warning(f"No pre-generated search query for {requirement['id']}, using fallback")
        
        # Execute search with optimized query
        try:
            results = self.client.search(
                search_text=search_text,
                top=top_k,
                include_total_count=True
            )
            
            # Process results
            search_results = []
            for result in results:
                search_results.append({
                    'id': result.get('chunk_id', ''),
                    'content': result.get('content_text', ''),
                    'score': result.get('@search.score', 0),
                    'reranker_score': result.get('@search.reranker_score', 0),
                    'document_title': result.get('document_title', ''),
                    'page': result.get('locationMetadata', {}).get('pageNumber', 0),
                    'type': 'text' if not result.get('content_path') else 'image',
                    'image_path': result.get('content_path', '')
                })
            
            logger.info(f"Found {len(search_results)} results for requirement {requirement['id']}")
            return search_results
            
        except Exception as e:
            logger.error(f"Search error for requirement {requirement['id']}: {str(e)}")
            return []
    


class LLMEvaluationService:
    """Service for evaluating requirements using Azure OpenAI"""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = AzureOpenAI(
            azure_endpoint=config.openai_endpoint,
            api_key=config.openai_key,
            api_version=config.openai_api_version
        )
        self.deployment = config.openai_deployment
    
    async def evaluate_requirement(
        self,
        requirement: Dict,
        evidence: List[Dict],
        document_context: Optional[Dict] = None
    ) -> Dict:
        """
        Evaluate if a requirement is satisfied based on evidence
        
        Args:
            requirement: ISO requirement to evaluate
            evidence: Search results containing potential evidence
            document_context: Optional context about the document
        
        Returns:
            Evaluation result with status, rationale, and citations
        """
        # Build evaluation prompt
        prompt = self._build_evaluation_prompt(requirement, evidence, document_context)
        
        # System prompt for ISO 14971 expert
        system_prompt = """You are an expert ISO 14971:2019 compliance auditor evaluating medical device documentation.

Your task is to determine if a specific requirement is satisfied based on provided evidence.

Evaluation Criteria:
- PASS: Clear, direct evidence that fully addresses the requirement with appropriate documentation
- FAIL: Absence of required evidence or direct contradiction of the requirement
- PARTIAL: Some evidence present but incomplete or ambiguous
- NOT_APPLICABLE: Requirement does not apply to this document/device type

You must return a JSON response with:
{
    "status": "PASS|FAIL|PARTIAL|NOT_APPLICABLE",
    "confidence": "low|medium|high",
    "rationale": "Clear explanation of verdict",
    "evidence_snippets": ["List of specific quotes from evidence"],
    "gaps": ["List of missing elements if not PASS"],
    "recommendations": ["Specific actions to achieve compliance"]
}

Be conservative - prefer PARTIAL over PASS when uncertain. Consider patient safety implications.
Use "high" confidence only when evidence is explicit and comprehensive, "medium" when evidence leans toward your status but contains some uncertainty, and "low" when evidence is sparse or contradictory."""
        
        try:
            # Call Azure OpenAI
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1500,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            evaluation = json.loads(response.choices[0].message.content)
            
            # Add metadata
            evaluation['requirement_id'] = requirement['id']
            evaluation['tokens_used'] = response.usage.total_tokens
            evaluation['model'] = self.deployment
            evaluation['evaluated_at'] = datetime.utcnow().isoformat()
            
            return evaluation
            
        except Exception as e:
            logger.error(f"LLM evaluation error for {requirement['id']}: {str(e)}")
            return {
                'status': 'ERROR',
                'confidence': 'low',
                'rationale': f"Evaluation failed: {str(e)}",
                'requirement_id': requirement['id'],
                'error': str(e)
            }
    
    def _build_evaluation_prompt(
        self,
        requirement: Dict,
        evidence: List[Dict],
        context: Optional[Dict]
    ) -> str:
        """Build the evaluation prompt"""
        
        prompt_parts = [
            f"# ISO 14971 Requirement Evaluation",
            f"\n## Requirement: {requirement['id']}",
            f"**Clause:** {requirement['clause']}",
            f"**Title:** {requirement['title']}",
            f"**Requirement Text:** {requirement['requirement_text']}",
            f"**Acceptance Criteria:** {requirement['acceptance_criteria']}",
            f"**Expected Artifacts:** {requirement['expected_artifacts']}",
            ""
        ]
        
        if context:
            prompt_parts.extend([
                "## Document Context",
                f"**Document:** {context.get('document_name', 'Unknown')}",
                f"**Type:** {context.get('document_type', 'Unknown')}",
                ""
            ])
        
        prompt_parts.append("## Evidence Found")
        
        if evidence:
            for i, item in enumerate(evidence[:5], 1):  # Limit to top 5
                prompt_parts.extend([
                    f"\n### Evidence {i}",
                    f"**Score:** {item['score']:.2f}",
                    f"**Page:** {item.get('page', 'N/A')}",
                    f"**Content:**",
                    f"```",
                    item['content'][:1000],  # Limit length
                    f"```"
                ])
        else:
            prompt_parts.append("No relevant evidence found in the document.")
        
        prompt_parts.extend([
            "",
            "## Task",
            "Evaluate if this requirement is satisfied based on the evidence provided.",
            "Return your evaluation as JSON with status, confidence, rationale, evidence_snippets, gaps, and recommendations."
        ])
        
        return "\n".join(prompt_parts)


class CompliancePipeline:
    """Main orchestration pipeline for ISO 14971 compliance evaluation"""
    
    def __init__(self):
        self.config = Config()
        self.search_service = AzureSearchService(self.config)
        self.llm_service = LLMEvaluationService(self.config)
        self.document_intelligence = DocumentIntelligenceService()
        self.supabase: Client = create_client(
            self.config.supabase_url,
            self.config.supabase_key
        )
    
    async def process_uploaded_document(
        self,
        document_url: Optional[str] = None,
        document_bytes: Optional[bytes] = None,
        filename: str = "document",
        store_in_supabase: bool = True
    ) -> Dict:
        """
        Process an uploaded document by extracting its markdown content
        
        Args:
            document_url: URL of the uploaded document
            document_bytes: Bytes of the uploaded document
            filename: Name of the document
            store_in_supabase: Whether to store the extracted content in Supabase
            
        Returns:
            Dictionary containing extraction results and metadata
        """
        logger.info(f"Processing uploaded document: {filename}")
        
        try:
            # Extract markdown using Document Intelligence
            result = await self.document_intelligence.extract_markdown_with_page_splitting(
                document_url=document_url,
                document_bytes=document_bytes,
                filename=filename
            )
            
            if not result['success']:
                logger.error(f"Failed to extract markdown from {filename}: {result.get('error')}")
                return result
            
            # Store in Supabase if requested
            if store_in_supabase:
                document_record = {
                    'filename': filename,
                    'markdown_content': result['markdown_content'],
                    'page_count': result['page_count'],
                    'extraction_metadata': result['metadata'],
                    'processed_at': datetime.utcnow().isoformat(),
                    'status': 'processed'
                }
                
                # Insert into documents table (assuming you have one)
                supabase_result = self.supabase.table('processed_documents').insert(document_record).execute()
                result['supabase_id'] = supabase_result.data[0]['id'] if supabase_result.data else None
                
                logger.info(f"Stored document {filename} in Supabase with ID: {result['supabase_id']}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing document {filename}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'markdown_content': None,
                'pages': [],
                'page_count': 0
            }
    
    async def evaluate_document(
        self,
        document_name: str,
        document_evaluation_id: str,
        document_filter: Optional[str] = None
    ) -> str:
        """
        Evaluate a document against all ISO 14971 requirements with progress tracking
        
        Args:
            document_name: Name/identifier of the document to evaluate
            document_evaluation_id: ID of the evaluation record to update
            document_filter: Optional search filter
        
        Returns:
            Document evaluation ID
        """
        logger.info(f"Starting evaluation for document: {document_name}")
        
        try:
            # 1. Load ISO requirements
            requirements = self.supabase.table('iso_requirements').select("*").execute()
            total_requirements = len(requirements.data)
            
            # 2. Update initial progress
            self._update_progress(document_evaluation_id, 0, total_requirements, "Starting evaluation...")
            
            # 3. Evaluate requirements in parallel batches for speed
            batch_size = 5  # Process 5 requirements at a time to avoid rate limits
            evaluation_results = []
            passed = failed = partial = na = 0
            
            for i in range(0, total_requirements, batch_size):
                batch = requirements.data[i:i + batch_size]
                batch_number = (i // batch_size) + 1
                total_batches = (total_requirements + batch_size - 1) // batch_size
                
                logger.info(f"Processing batch {batch_number}/{total_batches} ({len(batch)} requirements)")
                self._update_progress(
                    document_evaluation_id, 
                    i, 
                    total_requirements, 
                    f"Processing batch {batch_number}/{total_batches}..."
                )
                
                # Process batch in parallel
                batch_results = await self._evaluate_batch(batch, document_filter, document_evaluation_id, document_name)
                evaluation_results.extend(batch_results)
                
                # Update counters
                for result in batch_results:
                    status = result['status']
                    if status == 'PASS':
                        passed += 1
                    elif status == 'FAIL':
                        failed += 1
                    elif status == 'PARTIAL':
                        partial += 1
                    elif status == 'NOT_APPLICABLE':
                        na += 1
                
                # Update progress after each batch
                progress = min(i + len(batch), total_requirements)
                self._update_progress(
                    document_evaluation_id, 
                    progress, 
                    total_requirements, 
                    f"Completed {progress}/{total_requirements} requirements"
                )
            
            # 4. Final progress update
            self._update_progress(document_evaluation_id, total_requirements, total_requirements, "Finalizing evaluation...")
            
            # 5. Calculate compliance score
            compliance_score = (passed / (total_requirements - na)) * 100 if (total_requirements - na) > 0 else 0
            
            # 6. Update document evaluation
            update_data = {
                'status': 'completed',
                'completed_at': datetime.utcnow().isoformat(),
                'overall_compliance_score': round(compliance_score, 2),
                'requirements_passed': passed,
                'requirements_failed': failed,
                'requirements_partial': partial,
                'requirements_na': na
            }
            
            self.supabase.table('document_evaluations').update(update_data).eq('id', document_evaluation_id).execute()
            
            # 7. Generate compliance report
            await self.generate_report(document_evaluation_id, evaluation_results)
            
            logger.info(f"Evaluation completed. Score: {compliance_score:.1f}%")
            return document_evaluation_id
            
        except Exception as e:
            logger.error(f"Pipeline error: {str(e)}")
            
            # Update evaluation as failed
            self.supabase.table('document_evaluations').update({
                'status': 'error',
                'error_message': str(e),
                'completed_at': datetime.utcnow().isoformat()
            }).eq('id', document_evaluation_id).execute()
            
            raise
    
    async def _evaluate_batch(self, batch: List[Dict], document_filter: str, evaluation_id: str, document_name: str) -> List[Dict]:
        """Evaluate a batch of requirements in parallel"""
        tasks = []
        for requirement in batch:
            task = self._evaluate_single_requirement(requirement, document_filter, evaluation_id, document_name)
            tasks.append(task)
        
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _evaluate_single_requirement(self, requirement: Dict, document_filter: str, evaluation_id: str, document_name: str) -> Dict:
        """Evaluate a single requirement"""
        try:
            # Search for evidence
            evidence = await self.search_service.search_for_requirement(
                requirement,
                document_filter
            )
            
            # Evaluate with LLM
            evaluation = await self.llm_service.evaluate_requirement(
                requirement,
                evidence,
                {'document_name': document_name}
            )
            
            # Store evaluation result
            eval_result = {
                'document_evaluation_id': evaluation_id,
                'requirement_id': requirement['id'],
                'status': evaluation['status'],
                'confidence_level': evaluation.get('confidence', 'low'),
                'evidence_snippets': evaluation.get('evidence_snippets', []),
                'evaluation_rationale': evaluation.get('rationale', ''),
                'gaps_identified': evaluation.get('gaps', []),
                'recommendations': evaluation.get('recommendations', []),
                'llm_response': evaluation,
                'tokens_used': evaluation.get('tokens_used', 0),
                'search_results': evidence[:3] if evidence else []
            }
            
            try:
                self.supabase.table('requirement_evaluations').insert(eval_result).execute()
            except Exception as insert_error:
                if 'confidence_level' in str(insert_error).lower():
                    fallback = dict(eval_result)
                    level = fallback.pop('confidence_level', 'low')
                    fallback['confidence_score'] = _confidence_score_from_level(level)
                    self.supabase.table('requirement_evaluations').insert(fallback).execute()
                else:
                    raise
            return evaluation
            
        except Exception as e:
            logger.error(f"Error evaluating requirement {requirement.get('id', 'unknown')}: {e}")
            # Return a failed evaluation
            return {
                'status': 'FAIL',
                'rationale': f'Evaluation failed due to error: {str(e)}',
                'confidence': 'low',
                'evidence_snippets': [],
                'gaps': [f'Technical error during evaluation: {str(e)}'],
                'recommendations': ['Retry evaluation or investigate technical issue']
            }
    
    def _update_progress(self, evaluation_id: str, completed: int, total: int, message: str):
        """Update progress in the database"""
        progress_percent = int((completed / total) * 100) if total > 0 else 0
        
        # Store progress info in metadata field
        metadata = {
            'progress_percent': progress_percent,
            'completed_requirements': completed,
            'total_requirements': total,
            'status_message': message,
            'last_updated': datetime.utcnow().isoformat()
        }
        
        self.supabase.table('document_evaluations').update({
            'metadata': metadata
        }).eq('id', evaluation_id).execute()
        
        logger.info(f"Progress: {progress_percent}% ({completed}/{total}) - {message}")
    
    async def generate_report(self, evaluation_id: str, evaluations: List[Dict]):
        """Generate compliance report"""
        
        # Identify high-risk findings
        high_risk = [
            e for e in evaluations 
            if e['status'] == 'FAIL' and e.get('requirement_id', '').startswith('ISO14971-4')
        ]
        
        # Group by clause
        by_clause = {}
        for e in evaluations:
            req_id = e.get('requirement_id', '')
            if req_id:
                clause = req_id.split('-')[1] if '-' in req_id else 'Unknown'
                if clause not in by_clause:
                    by_clause[clause] = {'pass': 0, 'fail': 0, 'partial': 0}
                
                status = e['status'].lower()
                if status in by_clause[clause]:
                    by_clause[clause][status] += 1
        
        # Build report
        report = {
            'document_evaluation_id': evaluation_id,
            'report_type': 'full',
            'report_data': {
                'evaluations': evaluations,
                'by_clause': by_clause
            },
            'summary_stats': {
                'total_evaluated': len(evaluations),
                'passed': len([e for e in evaluations if e['status'] == 'PASS']),
                'failed': len([e for e in evaluations if e['status'] == 'FAIL']),
                'partial': len([e for e in evaluations if e['status'] == 'PARTIAL']),
                'not_applicable': len([e for e in evaluations if e['status'] == 'NOT_APPLICABLE'])
            },
            'high_risk_findings': [e['requirement_id'] for e in high_risk],
            'key_gaps': list(set([
                gap for e in evaluations 
                for gap in e.get('gaps', [])
            ]))[:10],  # Top 10 gaps
            'recommendations': {
                'immediate': [r for e in high_risk for r in e.get('recommendations', [])],
                'short_term': [],
                'long_term': []
            },
            'generated_at': datetime.utcnow().isoformat(),
            'report_format': 'json'
        }
        
        self.supabase.table('compliance_reports').insert(report).execute()
        logger.info(f"Report generated for evaluation {evaluation_id}")


async def main():
    """Main entry point for testing"""
    pipeline = CompliancePipeline()
    
    # Example: Evaluate a document
    document_name = "Sample_Risk_Management_Plan.pdf"
    
    try:
        evaluation_id = await pipeline.evaluate_document(document_name)
        print(f"✅ Evaluation completed: {evaluation_id}")
        
        # Fetch report
        report = pipeline.supabase.table('compliance_reports') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .single() \
            .execute()
        
        print(f"\n📊 Compliance Summary:")
        print(f"   - Passed: {report.data['summary_stats']['passed']}")
        print(f"   - Failed: {report.data['summary_stats']['failed']}")
        print(f"   - Partial: {report.data['summary_stats']['partial']}")
        
        if report.data['high_risk_findings']:
            print(f"\n⚠️  High Risk Findings:")
            for finding in report.data['high_risk_findings']:
                print(f"   - {finding}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
