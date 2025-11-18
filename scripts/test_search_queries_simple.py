#!/usr/bin/env python3
"""
Simple test to verify search queries are properly stored and retrieved
"""

import os
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from project root
root_dir = Path(__file__).parent.parent
env_file = root_dir / ".env"
load_dotenv(env_file)

def test_search_queries():
    """Test that search queries are properly stored"""
    print("Testing search query storage and retrieval...")
    
    supabase = create_client(
        os.getenv('SUPABASE_URL'),
        os.getenv('SUPABASE_ANON_KEY')
    )
    
    # Get sample requirements with search queries
    response = supabase.table('iso_requirements').select('id, title, search_query').limit(5).execute()
    
    print(f"\nFound {len(response.data)} requirements with search queries:")
    print("=" * 80)
    
    for req in response.data:
        print(f"\n📋 {req['id']}")
        print(f"   Title: {req['title']}")
        print(f"   Query: {req['search_query']}")
        
        # Verify query is not empty
        if req['search_query']:
            print("   ✅ Has pre-generated search query")
        else:
            print("   ❌ Missing search query")
    
    # Test statistics
    all_reqs = supabase.table('iso_requirements').select('search_query').execute()
    total = len(all_reqs.data)
    with_queries = len([r for r in all_reqs.data if r['search_query']])
    
    print(f"\n📊 Statistics:")
    print(f"   Total requirements: {total}")
    print(f"   With search queries: {with_queries}")
    print(f"   Coverage: {(with_queries/total)*100:.1f}%")
    
    if with_queries == total:
        print("\n✅ All requirements have pre-generated search queries!")
    else:
        print(f"\n⚠️  {total - with_queries} requirements missing search queries")

if __name__ == "__main__":
    test_search_queries()