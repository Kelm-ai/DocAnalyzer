#!/usr/bin/env python3
"""
Test the updated pipeline with pre-generated search queries
"""

import asyncio
import os
from iso_compliance_pipeline import CompliancePipeline
from dotenv import load_dotenv

load_dotenv()

async def test_search_queries():
    """Test that search queries are working with pre-generated queries"""
    print("Testing updated pipeline with pre-generated search queries...")
    
    pipeline = CompliancePipeline()
    
    # Get a sample requirement to test
    requirements = pipeline.supabase.table('iso_requirements').select('*').limit(3).execute()
    
    for req in requirements.data:
        print(f"\n--- Testing {req['id']} ---")
        print(f"Title: {req['title']}")
        print(f"Pre-generated query: {req['search_query'][:100]}...")
        
        # Test the search
        try:
            results = await pipeline.search_service.search_for_requirement(req, top_k=3)
            print(f"✅ Found {len(results)} results")
            
            if results:
                print(f"Top result score: {results[0]['score']:.3f}")
                print(f"Top result preview: {results[0]['content'][:150]}...")
            else:
                print("ℹ️  No results found (expected if no documents indexed)")
                
        except Exception as e:
            print(f"❌ Error: {str(e)}")
    
    print("\n✅ Pipeline test completed!")

if __name__ == "__main__":
    asyncio.run(test_search_queries())