#!/usr/bin/env python3
"""
ISO 14971 Direct LLM Evaluator
Evaluate documents against ISO requirements with individual LLM calls per requirement
"""

import os
import json
import asyncio
import sys
from datetime import datetime
from typing import List, Dict, Optional
import logging
from pathlib import Path

from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
import PyPDF2

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DirectEvaluator:
    """Direct evaluation using full document context with per-requirement LLM calls"""
    
    def __init__(self):
        # Initialize OpenAI client
        self.client = OpenAI(
            api_key=os.getenv('OPENAI_API_KEY')
        )
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o')
        
        # Initialize Supabase
        self.supabase = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_ANON_KEY')
        )
    
    def extract_pdf_text(self, file_path: str) -> str:
        """Extract text from PDF file"""
        text_parts = []
        
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            for page_num, page in enumerate(pdf_reader.pages, 1):
                page_text = page.extract_text()
                if page_text.strip():
                    text_parts.append(f"\n[PAGE {page_num}]\n{page_text}")
        
        return '\n'.join(text_parts)
    
    def load_requirements(self) -> List[Dict]:
        """Load ISO requirements from database"""
        result = self.supabase.table('iso_requirements').select("*").execute()
        return result.data
    
    async def evaluate_document(self, file_path: str, evaluation_id: Optional[str] = None) -> Dict:
        """
        Main evaluation method - evaluate document with individual LLM calls per requirement
        
        Args:
            file_path: Path to PDF document
            evaluation_id: Optional existing evaluation ID
        
        Returns:
            Evaluation results
        """
        start_time = datetime.utcnow()
        document_name = Path(file_path).name
        
        logger.info(f"Starting evaluation of {document_name}")
        
        # 1. Extract document text once
        logger.info("Extracting PDF text...")
        document_text = self.extract_pdf_text(file_path)
        
        # 2. Load requirements
        logger.info("Loading ISO requirements...")
        requirements = self.load_requirements()
        logger.info(f"Processing {len(requirements)} requirements")
        
        # 3. Create evaluation record
        if not evaluation_id:
            eval_record = {
                'document_name': document_name,
                'status': 'in_progress',
                'started_at': datetime.utcnow().isoformat(),
                'total_requirements': len(requirements),
                'metadata': {
                    'evaluation_method': 'direct_llm_parallel',
                    'model_used': self.model
                }
            }
            result = self.supabase.table('document_evaluations').insert(eval_record).execute()
            evaluation_id = result.data[0]['id']
        
        # 4. Create evaluation tasks for parallel execution
        logger.info(f"Evaluating {len(requirements)} requirements in parallel...")
        
        # Create all evaluation tasks
        tasks = []
        for requirement in requirements:
            task = self.evaluate_single_requirement(
                document_text, 
                requirement, 
                evaluation_id,
                document_name
            )
            tasks.append(task)
        
        # Execute all tasks in parallel with concurrency limit
        semaphore = asyncio.Semaphore(3)  # Max 3 concurrent LLM calls for testing
        
        async def bounded_task(task):
            async with semaphore:
                return await task
        
        bounded_tasks = [bounded_task(task) for task in tasks]
        evaluations = await asyncio.gather(*bounded_tasks, return_exceptions=True)
        
        # 5. Process results
        valid_evaluations = []
        total_tokens = 0
        
        for i, result in enumerate(evaluations):
            if isinstance(result, Exception):
                logger.error(f"Evaluation failed for requirement {requirements[i]['id']}: {result}")
                # Create error evaluation
                valid_evaluations.append({
                    'requirement_id': requirements[i]['id'],
                    'status': 'ERROR',
                    'confidence': 0,
                    'rationale': str(result),
                    'gaps': ['Evaluation failed'],
                    'recommendations': ['Retry evaluation']
                })
            else:
                valid_evaluations.append(result['evaluation'])
                total_tokens += result.get('tokens', 0)
        
        # 6. Calculate summary
        summary = self.calculate_summary(valid_evaluations)
        
        # 7. Update document evaluation
        self.supabase.table('document_evaluations').update({
            'status': 'completed',
            'completed_at': datetime.utcnow().isoformat(),
            'overall_compliance_score': summary['score'],
            'requirements_passed': summary['passed'],
            'requirements_failed': summary['failed'],
            'requirements_partial': summary['partial'],
            'requirements_na': summary['not_applicable']
        }).eq('id', evaluation_id).execute()
        
        # 8. Generate report
        self.generate_report(evaluation_id, valid_evaluations, summary)
        
        # 9. Calculate final metrics
        end_time = datetime.utcnow()
        evaluation_time = (end_time - start_time).total_seconds()
        estimated_cost = (total_tokens / 1_000_000) * 5  # ~$5 per 1M tokens
        
        logger.info(f"Evaluation completed in {evaluation_time:.1f}s")
        logger.info(f"Overall score: {summary['score']:.1f}%")
        logger.info(f"Total tokens used: {total_tokens:,}")
        logger.info(f"Estimated cost: ${estimated_cost:.2f}")
        
        return {
            'evaluation_id': evaluation_id,
            'document_name': document_name,
            'overall_score': summary['score'],
            'passed': summary['passed'],
            'failed': summary['failed'],
            'partial': summary['partial'],
            'not_applicable': summary['not_applicable'],
            'evaluation_time_seconds': evaluation_time,
            'tokens_used': total_tokens,
            'estimated_cost': estimated_cost,
            'evaluations': valid_evaluations
        }
    
    async def evaluate_single_requirement(
        self, 
        document_text: str, 
        requirement: Dict, 
        evaluation_id: str,
        document_name: str
    ) -> Dict:
        """
        Evaluate a single requirement against the full document
        
        Args:
            document_text: Full document text
            requirement: Single ISO requirement
            evaluation_id: Document evaluation ID
            document_name: Name of document being evaluated
        
        Returns:
            Evaluation result with tokens used
        """
        try:
            # Build prompt for this specific requirement
            prompt = f"""You are an ISO 14971:2019 compliance auditor evaluating a medical device document.

DOCUMENT TO EVALUATE:
{document_text[:60000]}  # Limit to ~60k chars per requirement

REQUIREMENT TO EVALUATE:
- ID: {requirement['id']}
- Clause: {requirement['clause']}
- Title: {requirement['title']}
- Requirement Text: {requirement['requirement_text']}
- Acceptance Criteria: {requirement['acceptance_criteria']}
- Expected Artifacts: {requirement.get('expected_artifacts', 'Not specified')}

EVALUATION TASK:
Determine if this specific requirement is satisfied based on the document content.

Use these status values:
- PASS: Clear, complete evidence that fully satisfies the requirement
- FAIL: No evidence or clear contradiction of the requirement
- PARTIAL: Some evidence present but incomplete or unclear
- NOT_APPLICABLE: Requirement doesn't apply to this document type

Return JSON with:
{{
    "requirement_id": "{requirement['id']}",
    "status": "PASS|FAIL|PARTIAL|NOT_APPLICABLE",
    "confidence": 0.0-1.0,
    "evidence_quotes": ["Specific quote from document [Page X]", ...],
    "gaps": ["What's missing if not PASS"],
    "recommendations": ["Specific actions to achieve compliance"],
    "rationale": "Clear explanation of your verdict"
}}

Be conservative - prefer PARTIAL over PASS when uncertain. Consider patient safety implications."""
            
            # Call OpenAI
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an ISO 14971 compliance expert. Always respond with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,
                max_tokens=1500,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            evaluation = json.loads(response.choices[0].message.content)
            
            # Store in database
            eval_record = {
                'document_evaluation_id': evaluation_id,
                'requirement_id': requirement['id'],
                'status': evaluation.get('status', 'ERROR'),
                'confidence_score': evaluation.get('confidence', 0),
                'evidence_snippets': evaluation.get('evidence_quotes', []),
                'evaluation_rationale': evaluation.get('rationale', ''),
                'gaps_identified': evaluation.get('gaps', []),
                'recommendations': evaluation.get('recommendations', []),
                'tokens_used': response.usage.total_tokens
            }
            self.supabase.table('requirement_evaluations').insert(eval_record).execute()
            
            return {
                'evaluation': evaluation,
                'tokens': response.usage.total_tokens
            }
            
        except Exception as e:
            logger.error(f"Error evaluating requirement {requirement['id']}: {e}")
            raise
    
    def calculate_summary(self, evaluations: List[Dict]) -> Dict:
        """Calculate summary statistics"""
        
        passed = sum(1 for e in evaluations if e.get('status') == 'PASS')
        failed = sum(1 for e in evaluations if e.get('status') == 'FAIL')
        partial = sum(1 for e in evaluations if e.get('status') == 'PARTIAL')
        not_applicable = sum(1 for e in evaluations if e.get('status') == 'NOT_APPLICABLE')
        errors = sum(1 for e in evaluations if e.get('status') == 'ERROR')
        
        # Calculate score (excluding N/A and errors)
        scoreable = len(evaluations) - not_applicable - errors
        if scoreable > 0:
            # PASS = 1.0, PARTIAL = 0.5, FAIL = 0
            weighted_score = passed + (partial * 0.5)
            score = (weighted_score / scoreable) * 100
        else:
            score = 0.0
        
        return {
            'passed': passed,
            'failed': failed,
            'partial': partial,
            'not_applicable': not_applicable,
            'errors': errors,
            'score': round(score, 2),
            'total': len(evaluations)
        }
    
    def generate_report(self, evaluation_id: str, evaluations: List[Dict], summary: Dict):
        """Generate and save compliance report"""
        
        # Group by clause
        by_clause = {}
        for eval in evaluations:
            req_id = eval.get('requirement_id', '')
            if '-' in req_id:
                clause = req_id.split('-')[1].split('.')[0]
            else:
                clause = 'Unknown'
            
            if clause not in by_clause:
                by_clause[clause] = {'pass': 0, 'fail': 0, 'partial': 0, 'na': 0}
            
            status = eval.get('status', 'ERROR').lower()
            if status == 'pass':
                by_clause[clause]['pass'] += 1
            elif status == 'fail':
                by_clause[clause]['fail'] += 1
            elif status == 'partial':
                by_clause[clause]['partial'] += 1
            elif status == 'not_applicable':
                by_clause[clause]['na'] += 1
        
        # Create report
        report = {
            'document_evaluation_id': evaluation_id,
            'report_type': 'full',
            'report_data': {
                'by_clause': by_clause,
                'comprehensive_analysis': True
            },
            'summary_stats': summary,
            'high_risk_findings': [
                eval['requirement_id'] for eval in evaluations
                if eval.get('status') == 'FAIL' and '4.' in eval.get('requirement_id', '')
            ],
            'key_gaps': list(set([
                gap for eval in evaluations
                for gap in eval.get('gaps', [])
            ]))[:20],  # Top 20 unique gaps
            'generated_at': datetime.utcnow().isoformat(),
            'report_format': 'json'
        }
        
        self.supabase.table('compliance_reports').insert(report).execute()
        logger.info(f"Report generated for evaluation {evaluation_id}")
    
    def generate_html_report(self, results: Dict) -> str:
        """Generate a simple HTML report"""
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>ISO 14971 Compliance Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .header {{ background: #1e3a8a; color: white; padding: 20px; border-radius: 5px; }}
        .summary {{ background: #f3f4f6; padding: 20px; margin: 20px 0; border-radius: 5px; }}
        .score {{ font-size: 48px; font-weight: bold; color: #1e3a8a; }}
        .pass {{ color: #16a34a; }}
        .fail {{ color: #dc2626; }}
        .partial {{ color: #ea580c; }}
        .na {{ color: #6b7280; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
        th {{ background: #f9fafb; font-weight: bold; }}
        .requirement {{ padding: 15px; margin: 10px 0; border: 1px solid #e5e7eb; border-radius: 5px; }}
        .requirement.fail {{ border-left: 4px solid #dc2626; background: #fef2f2; }}
        .requirement.partial {{ border-left: 4px solid #ea580c; background: #fff7ed; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>ISO 14971:2019 Compliance Report</h1>
        <p>Document: {results['document_name']}</p>
        <p>Evaluation ID: {results['evaluation_id']}</p>
        <p>Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>
    </div>
    
    <div class="summary">
        <div class="score">{results['overall_score']:.1f}%</div>
        <p>Overall Compliance Score</p>
        
        <table>
            <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Percentage</th>
            </tr>
            <tr class="pass">
                <td>✓ Passed</td>
                <td>{results['passed']}</td>
                <td>{(results['passed']/len(results['evaluations'])*100) if results['evaluations'] else 0:.1f}%</td>
            </tr>
            <tr class="fail">
                <td>✗ Failed</td>
                <td>{results['failed']}</td>
                <td>{(results['failed']/len(results['evaluations'])*100) if results['evaluations'] else 0:.1f}%</td>
            </tr>
            <tr class="partial">
                <td>◐ Partial</td>
                <td>{results['partial']}</td>
                <td>{(results['partial']/len(results['evaluations'])*100) if results['evaluations'] else 0:.1f}%</td>
            </tr>
            <tr class="na">
                <td>- Not Applicable</td>
                <td>{results['not_applicable']}</td>
                <td>{(results['not_applicable']/len(results['evaluations'])*100) if results['evaluations'] else 0:.1f}%</td>
            </tr>
        </table>
        
        <p><strong>Evaluation Time:</strong> {results['evaluation_time_seconds']:.1f} seconds</p>
        <p><strong>Total API Calls:</strong> {len(results['evaluations'])}</p>
        <p><strong>Estimated Cost:</strong> ${results['estimated_cost']:.2f}</p>
    </div>
    
    <h2>Failed Requirements</h2>
    {"".join(f'''
    <div class="requirement fail">
        <h3>{e.get('requirement_id', 'Unknown')}</h3>
        <p><strong>Rationale:</strong> {e.get('rationale', 'No rationale provided')}</p>
        <p><strong>Gaps:</strong> {', '.join(e.get('gaps', []))}</p>
        <p><strong>Recommendations:</strong> {', '.join(e.get('recommendations', []))}</p>
    </div>
    ''' for e in results['evaluations'] if e.get('status') == 'FAIL')}
    
    <h2>Partial Compliance</h2>
    {"".join(f'''
    <div class="requirement partial">
        <h3>{e.get('requirement_id', 'Unknown')}</h3>
        <p><strong>Rationale:</strong> {e.get('rationale', 'No rationale provided')}</p>
        <p><strong>Evidence:</strong> {'; '.join(e.get('evidence_quotes', []))}</p>
        <p><strong>Gaps:</strong> {', '.join(e.get('gaps', []))}</p>
        <p><strong>Recommendations:</strong> {', '.join(e.get('recommendations', []))}</p>
    </div>
    ''' for e in results['evaluations'] if e.get('status') == 'PARTIAL')}
</body>
</html>
"""
        return html


async def main():
    """Main entry point"""
    
    evaluator = DirectEvaluator()
    
    # Test document path - using available PDF
    document_path = "Risk Management/Example Viking QAP013.01 Risk Management Final.pdf"
    
    try:
        # Run evaluation
        results = await evaluator.evaluate_document(document_path)
        
        # Print summary
        print(f"\n{'='*60}")
        print(f"EVALUATION COMPLETE")
        print(f"{'='*60}")
        print(f"Document: {results['document_name']}")
        print(f"Score: {results['overall_score']:.1f}%")
        print(f"  ✓ Passed: {results['passed']}")
        print(f"  ✗ Failed: {results['failed']}")
        print(f"  ◐ Partial: {results['partial']}")
        print(f"  - N/A: {results['not_applicable']}")
        print(f"\nTime: {results['evaluation_time_seconds']:.1f}s")
        print(f"Cost: ${results['estimated_cost']:.2f}")
        print(f"Total API Calls: {len(results['evaluations'])}")
        
        # Generate HTML report
        html = evaluator.generate_html_report(results)
        report_file = f"report_{results['evaluation_id']}.html"
        with open(report_file, 'w') as f:
            f.write(html)
        print(f"\n📄 Report saved to: {report_file}")
        
        # Show failed requirements
        failed = [e for e in results['evaluations'] if e.get('status') == 'FAIL']
        if failed:
            print(f"\n⚠️  Failed Requirements ({len(failed)}):")
            for req in failed[:5]:  # Show first 5
                print(f"  - {req.get('requirement_id')}: {req.get('rationale', '')[:100]}...")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
