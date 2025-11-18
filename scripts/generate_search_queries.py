#!/usr/bin/env python3
"""
Generate optimized search queries for ISO 14971 requirements
Updates the iso_requirements table with semantic search queries
"""

import os
import json
from typing import List, Dict
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from project root
root_dir = Path(__file__).parent.parent
env_file = root_dir / ".env"
load_dotenv(env_file)

class SearchQueryGenerator:
    """Generate semantic search queries for ISO requirements"""
    
    def __init__(self):
        self.supabase: Client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_ANON_KEY')
        )
    
    def generate_search_query(self, requirement: Dict) -> str:
        """
        Generate an optimized search query for a specific requirement
        
        Args:
            requirement: ISO requirement dictionary
            
        Returns:
            Optimized search query string
        """
        # Extract key concepts from the requirement
        title_terms = self._extract_key_terms(requirement['title'])
        requirement_terms = self._extract_key_terms(requirement['requirement_text'])
        artifact_terms = self._extract_key_terms(requirement['expected_artifacts'])
        
        # Build semantic search query prioritizing most specific terms
        query_parts = []
        
        # 1. Add specific document/artifact names with high weight
        if artifact_terms:
            artifact_query = " OR ".join([f'"{term}"' for term in artifact_terms[:3]])
            query_parts.append(f"({artifact_query})")
        
        # 2. Add key requirement concepts
        if requirement_terms:
            req_query = " OR ".join(requirement_terms[:5])
            query_parts.append(f"({req_query})")
        
        # 3. Add title concepts for broader context
        if title_terms:
            title_query = " ".join(title_terms[:3])
            query_parts.append(title_query)
        
        # 4. Add clause-specific terms
        clause_terms = self._get_clause_specific_terms(requirement['clause'])
        if clause_terms:
            clause_query = " OR ".join(clause_terms)
            query_parts.append(f"({clause_query})")
        
        # Combine with priority weighting
        final_query = " ".join(query_parts)
        
        # Limit length to avoid search service limits
        if len(final_query) > 300:
            final_query = final_query[:300].rsplit(' ', 1)[0]
        
        return final_query
    
    def _extract_key_terms(self, text: str) -> List[str]:
        """Extract key terms from text, focusing on specific nouns and phrases"""
        if not text:
            return []
        
        # Common ISO 14971 specific terms
        iso_terms = [
            'risk management plan', 'RMP', 'risk management file', 'RMF',
            'risk analysis', 'risk evaluation', 'risk control', 'hazard',
            'hazardous situation', 'residual risk', 'overall residual risk',
            'risk acceptability', 'risk criteria', 'benefit-risk analysis',
            'BRA', 'post-production monitoring', 'PMS', 'vigilance',
            'top management', 'management review', 'competence',
            'verification', 'validation', 'effectiveness', 'traceability',
            'design review', 'change control', 'CAPA', 'SOP', 'procedure',
            'policy', 'training', 'documentation', 'control measure'
        ]
        
        # Find specific terms in the text
        text_lower = text.lower()
        found_terms = []
        
        # Look for exact matches of ISO terms
        for term in iso_terms:
            if term.lower() in text_lower:
                found_terms.append(term)
        
        # Extract quoted strings and parenthetical content
        import re
        quotes = re.findall(r'"([^"]*)"', text)
        parens = re.findall(r'\(([^)]*)\)', text)
        
        found_terms.extend(quotes)
        found_terms.extend([p for p in parens if len(p) < 50])  # Avoid long parenthetical content
        
        # Extract capitalized acronyms
        acronyms = re.findall(r'\b[A-Z]{2,10}\b', text)
        found_terms.extend(acronyms)
        
        # Remove duplicates and empty terms
        found_terms = list(set([t.strip() for t in found_terms if t.strip()]))
        
        return found_terms[:10]  # Limit to top 10 terms
    
    def _get_clause_specific_terms(self, clause: str) -> List[str]:
        """Get terms specific to ISO 14971 clauses"""
        clause_terms = {
            '4.1': ['risk management process', 'lifecycle', 'ongoing process'],
            '4.2': ['top management', 'commitment', 'policy', 'acceptability criteria', 'review'],
            '4.3': ['competence', 'personnel', 'training', 'skills'],
            '4.4': ['risk management plan', 'RMP', 'scope', 'responsibilities', 'authorities'],
            '4.5': ['risk management file', 'RMF', 'traceability', 'records'],
            '5.1': ['risk analysis', 'conduct', 'record'],
            '5.2': ['intended use', 'misuse', 'foreseeable'],
            '5.3': ['characteristics', 'safety', 'limits'],
            '5.4': ['hazards', 'hazardous situations', 'events'],
            '5.5': ['risk estimation', 'severity', 'probability'],
            '6': ['risk evaluation', 'acceptability criteria', 'acceptable'],
            '7.1': ['risk control', 'measures', 'priority', 'inherently safe'],
            '7.2': ['implement', 'verify', 'effectiveness'],
            '7.3': ['residual risk', 'evaluation'],
            '7.4': ['benefit-risk analysis', 'BRA', 'benefits'],
            '7.5': ['new hazards', 'controls introduce'],
            '7.6': ['completeness', 'control activities'],
            '8': ['overall residual risk', 'disclosure', 'significant'],
            '9': ['risk management review', 'RMR', 'commercial release'],
            '10': ['production', 'post-production', 'monitoring', 'information'],
            'TR': ['technical report', 'matrices', 'scales', 'traceability']
        }
        
        # Match clause prefix
        for clause_key, terms in clause_terms.items():
            if clause.startswith(clause_key):
                return terms
        
        return []
    
    def update_all_requirements(self):
        """Update all requirements with generated search queries"""
        print("Fetching all ISO requirements...")
        
        # Fetch all requirements
        response = self.supabase.table('iso_requirements').select('*').execute()
        requirements = response.data
        
        print(f"Generating search queries for {len(requirements)} requirements...")
        
        updates = []
        for req in requirements:
            search_query = self.generate_search_query(req)
            updates.append({
                'id': req['id'],
                'search_query': search_query
            })
            print(f"✓ {req['id']}: {search_query[:100]}{'...' if len(search_query) > 100 else ''}")
        
        # Batch update all requirements
        print("\nUpdating database...")
        for update in updates:
            self.supabase.table('iso_requirements').update({
                'search_query': update['search_query']
            }).eq('id', update['id']).execute()
        
        print(f"✅ Updated {len(updates)} requirements with optimized search queries")

def main():
    generator = SearchQueryGenerator()
    generator.update_all_requirements()

if __name__ == "__main__":
    main()