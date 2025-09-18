#!/usr/bin/env python3
"""
Run ISO 14971 compliance evaluation on indexed document
"""

import asyncio
import json
from datetime import datetime
from iso_compliance_pipeline import CompliancePipeline
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Run evaluation on the Macro SOP document found in search"""
    
    print("\n" + "="*60)
    print("🚀 ISO 14971 COMPLIANCE EVALUATION")
    print("="*60)
    
    # Use the document we found in search - the Macro SOP document
    document_name = "Example Macro SOP005.V1.Risk Management draftv6"
    
    print(f"\n📋 Document: {document_name}")
    print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Initialize pipeline
        pipeline = CompliancePipeline()
        
        # Run evaluation - using first 5 requirements only for quick test
        print("\n🔄 Starting evaluation process...")
        print("   Testing with first 5 requirements for quick demo")
        print("   (Full evaluation would test all 38 requirements)\n")
        
        # For demo, let's just test searching and evaluating a few requirements
        requirements = pipeline.supabase.table('iso_requirements').select("*").limit(5).execute()
        
        print(f"📝 Testing {len(requirements.data)} requirements:\n")
        
        for i, req in enumerate(requirements.data, 1):
            print(f"{i}. {req['id']}: {req['title']}")
            
            # Search for evidence
            evidence = await pipeline.search_service.search_for_requirement(
                requirement=req,
                document_filter=None,
                top_k=3
            )
            
            if evidence:
                print(f"   ✅ Found {len(evidence)} pieces of evidence")
                print(f"   📄 Top result score: {evidence[0]['score']:.2f}")
                
                # Evaluate with LLM
                evaluation = await pipeline.llm_service.evaluate_requirement(
                    requirement=req,
                    evidence=evidence,
                    document_context={'document_name': document_name}
                )
                
                print(f"   🤖 Evaluation: {evaluation['status']} (Confidence: {evaluation.get('confidence', 0):.2f})")
                print(f"   💬 Rationale: {evaluation.get('rationale', '')[:100]}...")
            else:
                print(f"   ⚠️  No evidence found")
            
            print()
        
        print("\n" + "="*60)
        print("✅ TEST COMPLETED SUCCESSFULLY")
        print("="*60)
        print("\n📌 Note: This was a quick test with 5 requirements.")
        print("   Full evaluation would process all 38 requirements.")
        print("   To run full evaluation, use: pipeline.evaluate_document(document_name)")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        logger.error(f"Evaluation failed", exc_info=True)
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)