#!/usr/bin/env python3
"""
Test evaluation of Altimmune Risk Management Procedure document
"""

import asyncio
import json
from datetime import datetime
from iso_compliance_pipeline import CompliancePipeline
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_document_search():
    """First, test if we can search the Azure index"""
    from azure.search.documents import SearchClient
    from azure.core.credentials import AzureKeyCredential
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    # Create search client
    search_client = SearchClient(
        endpoint=os.getenv('AZURE_SEARCH_ENDPOINT'),
        index_name=os.getenv('AZURE_SEARCH_INDEX'),
        credential=AzureKeyCredential(os.getenv('AZURE_SEARCH_KEY'))
    )
    
    print("\n🔍 Testing Azure Search Connection...")
    
    # Search for risk management content
    results = search_client.search(
        search_text="risk management procedure",
        top=5,
        include_total_count=True
    )
    
    print(f"✅ Search successful! Found {results.get_count()} total results")
    
    # Show sample results
    print("\n📄 Sample search results:")
    for i, result in enumerate(results, 1):
        if i > 3:
            break
        print(f"\n{i}. Document: {result.get('document_title', 'Unknown')}")
        content = result.get('content_text', '')[:200]
        print(f"   Content: {content}...")
        print(f"   Score: {result.get('@search.score', 0):.2f}")
    
    return True


async def run_evaluation():
    """Run full evaluation pipeline"""
    
    print("\n" + "="*60)
    print("🚀 ISO 14971 COMPLIANCE EVALUATION")
    print("="*60)
    
    # Document to evaluate - using the title that should be in the search index
    document_name = "Example Altimmune Risk Management Procedure"
    
    print(f"\n📋 Document: {document_name}")
    print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Initialize pipeline
        pipeline = CompliancePipeline()
        
        # Check if document already evaluated
        existing = pipeline.supabase.table('document_evaluations') \
            .select("*") \
            .eq('document_name', document_name) \
            .execute()
        
        if existing.data:
            print(f"\n⚠️  Document already evaluated. Previous evaluation ID: {existing.data[0]['id']}")
            print("   Starting new evaluation...")
        
        # Run evaluation
        print("\n🔄 Starting evaluation process...")
        print("   This will evaluate against all 38 ISO 14971 requirements")
        print("   Expected duration: 2-5 minutes\n")
        
        evaluation_id = await pipeline.evaluate_document(
            document_name=document_name
        )
        
        print(f"\n✅ Evaluation completed!")
        print(f"   Evaluation ID: {evaluation_id}")
        
        # Fetch results
        eval_result = pipeline.supabase.table('document_evaluations') \
            .select("*") \
            .eq('id', evaluation_id) \
            .single() \
            .execute()
        
        # Display summary
        print("\n" + "="*60)
        print("📊 COMPLIANCE SUMMARY")
        print("="*60)
        
        data = eval_result.data
        print(f"Overall Compliance Score: {data['overall_compliance_score']:.1f}%")
        print(f"\nRequirement Results:")
        print(f"  ✅ Passed:         {data['requirements_passed']}")
        print(f"  ❌ Failed:         {data['requirements_failed']}")
        print(f"  ⚠️  Partial:       {data['requirements_partial']}")
        print(f"  ➖ Not Applicable: {data['requirements_na']}")
        
        # Get detailed results
        detailed = pipeline.supabase.table('requirement_evaluations') \
            .select("*, iso_requirements(clause, title)") \
            .eq('document_evaluation_id', evaluation_id) \
            .execute()
        
        # Show failed requirements
        failed_reqs = [r for r in detailed.data if r['status'] == 'FAIL']
        if failed_reqs:
            print("\n" + "="*60)
            print("❌ FAILED REQUIREMENTS")
            print("="*60)
            for req in failed_reqs[:5]:  # Show first 5
                print(f"\n• {req['requirement_id']}: {req['iso_requirements']['title']}")
                print(f"  Clause: {req['iso_requirements']['clause']}")
                print(f"  Rationale: {req['evaluation_rationale'][:150]}...")
                if req['gaps_identified']:
                    print(f"  Gaps: {', '.join(req['gaps_identified'][:3])}")
        
        # Show high confidence passes
        passed_reqs = [r for r in detailed.data if r['status'] == 'PASS' and r['confidence_score'] > 0.8]
        if passed_reqs:
            print("\n" + "="*60)
            print("✅ HIGH CONFIDENCE PASSES")
            print("="*60)
            for req in passed_reqs[:5]:  # Show first 5
                print(f"\n• {req['requirement_id']}: {req['iso_requirements']['title']}")
                print(f"  Confidence: {req['confidence_score']:.2f}")
                if req['evidence_snippets']:
                    print(f"  Evidence: \"{req['evidence_snippets'][0][:100]}...\"")
        
        # Get compliance report
        report = pipeline.supabase.table('compliance_reports') \
            .select("*") \
            .eq('document_evaluation_id', evaluation_id) \
            .single() \
            .execute()
        
        if report.data:
            print("\n" + "="*60)
            print("📝 KEY RECOMMENDATIONS")
            print("="*60)
            
            if report.data['key_gaps']:
                print("\nTop Compliance Gaps:")
                for i, gap in enumerate(report.data['key_gaps'][:5], 1):
                    print(f"  {i}. {gap}")
            
            if report.data['high_risk_findings']:
                print(f"\n⚠️  High Risk Findings: {len(report.data['high_risk_findings'])} requirements")
        
        # Save detailed report to file
        report_filename = f"evaluation_report_{evaluation_id}.json"
        with open(report_filename, 'w') as f:
            json.dump({
                'evaluation_id': evaluation_id,
                'document': document_name,
                'summary': eval_result.data,
                'detailed_results': detailed.data,
                'report': report.data if report.data else None
            }, f, indent=2, default=str)
        
        print(f"\n💾 Detailed report saved to: {report_filename}")
        
        return evaluation_id
        
    except Exception as e:
        print(f"\n❌ Error during evaluation: {str(e)}")
        logger.error(f"Evaluation failed: {str(e)}", exc_info=True)
        raise


async def main():
    """Main test function"""
    
    print("🧪 ISO 14971 Compliance Pipeline Test")
    print("="*60)
    
    # First test search
    search_ok = await test_document_search()
    
    if not search_ok:
        print("❌ Search test failed. Check your Azure Search configuration.")
        return
    
    # Ask user to proceed
    print("\n" + "="*60)
    response = input("\n🚀 Ready to run full evaluation? This will take 2-5 minutes. (y/n): ")
    
    if response.lower() == 'y':
        evaluation_id = await run_evaluation()
        
        print("\n" + "="*60)
        print("✅ TEST COMPLETED SUCCESSFULLY")
        print("="*60)
        print(f"Evaluation ID: {evaluation_id}")
        print(f"Check Supabase for detailed results")
        print(f"Project URL: https://qtuxwngyiilpntbungul.supabase.co")
    else:
        print("Test cancelled.")


if __name__ == "__main__":
    asyncio.run(main())