# ISO 14971 Compliance Pipeline - Developer Implementation Plan

## Project Overview
Build an automated document processing pipeline that evaluates medical device documentation against ISO 14971 requirements, producing structured compliance reports with citations.

**Estimated Timeline:** 6-8 weeks  
**Team Size:** 1-2 developers  
**Critical Success Factors:** Accurate evaluations, reliable citations, <5 min processing per document

---

## Phase 1: Foundation & Infrastructure (Week 1)
**Goal:** Set up core infrastructure and basic document processing

### Day 1-2: Azure Infrastructure Setup

#### 1.1 Create Azure Resources
```bash
# Resource Group
az group create --name iso14971-compliance-rg --location eastus

# Storage Account for documents
az storage account create \
  --name iso14971docs \
  --resource-group iso14971-compliance-rg \
  --sku Standard_LRS \
  --kind StorageV2

# Create blob containers
az storage container create --name documents --account-name iso14971docs
az storage container create --name processed --account-name iso14971docs

# Azure AI Search Service
az search service create \
  --name iso14971-search \
  --resource-group iso14971-compliance-rg \
  --sku standard \
  --partition-count 1 \
  --replica-count 1

# Azure OpenAI Service
az cognitiveservices account create \
  --name iso14971-openai \
  --resource-group iso14971-compliance-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus

# Document Intelligence (Form Recognizer)
az cognitiveservices account create \
  --name iso14971-docintel \
  --resource-group iso14971-compliance-rg \
  --kind FormRecognizer \
  --sku S0 \
  --location eastus
```

#### 1.2 Configure Event Grid
```python
# create_event_grid.py
from azure.eventgrid import EventGridPublisherClient
from azure.storage.blob import BlobServiceClient

# Set up Event Grid for blob upload triggers
def setup_event_grid():
    # Create system topic for blob events
    system_topic = {
        "name": "iso14971-blob-events",
        "source": "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/iso14971docs",
        "topicType": "Microsoft.Storage.StorageAccounts"
    }
    
    # Create event subscription
    event_subscription = {
        "name": "document-upload-trigger",
        "eventTypes": ["Microsoft.Storage.BlobCreated"],
        "filter": {
            "subjectBeginsWith": "/blobServices/default/containers/documents"
        },
        "destination": {
            "endpointType": "AzureFunction",
            "resourceId": "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{function-app}/functions/ProcessDocument"
        }
    }
```

#### 1.3 Supabase Database Schema
```sql
-- Run these migrations in order

-- 001_create_base_tables.sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    filename VARCHAR(500) NOT NULL,
    blob_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'uploaded',
    metadata JSONB DEFAULT '{}',
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    processed_date TIMESTAMPTZ
);

CREATE TABLE requirements (
    id VARCHAR(50) PRIMARY KEY,
    clause_number VARCHAR(20),
    category VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    priority VARCHAR(10) CHECK (priority IN ('must', 'should', 'nice')),
    evaluation_hints TEXT[],
    typical_evidence_types TEXT[],
    version VARCHAR(20) NOT NULL,
    active BOOLEAN DEFAULT true
);

-- 002_create_indexes.sql
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_requirements_category ON requirements(category);
```

### Day 3: Environment Configuration

#### 1.4 Create Configuration Files
```python
# config/azure_config.py
import os
from dataclasses import dataclass

@dataclass
class AzureConfig:
    # Storage
    STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    STORAGE_CONTAINER_DOCUMENTS = "documents"
    STORAGE_CONTAINER_PROCESSED = "processed"
    
    # Document Intelligence
    DOCINTEL_ENDPOINT = os.getenv("AZURE_DOCINTEL_ENDPOINT")
    DOCINTEL_KEY = os.getenv("AZURE_DOCINTEL_KEY")
    
    # Azure OpenAI
    OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
    OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY")
    OPENAI_DEPLOYMENT_NAME = "gpt-4o"
    OPENAI_EMBEDDING_DEPLOYMENT = "text-embedding-3-large"
    
    # Azure AI Search
    SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
    SEARCH_KEY = os.getenv("AZURE_SEARCH_KEY")
    SEARCH_INDEX_NAME = "iso14971-compliance"

# config/supabase_config.py
@dataclass
class SupabaseConfig:
    URL = os.getenv("SUPABASE_URL")
    ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
    SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
```

#### 1.5 Create .env File Template
```bash
# .env.template
# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=

# Azure Document Intelligence
AZURE_DOCINTEL_ENDPOINT=
AZURE_DOCINTEL_KEY=

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_KEY=

# Azure AI Search
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Application
ENVIRONMENT=development
LOG_LEVEL=INFO
```

### Day 4-5: Basic Document Upload & Trigger

#### 1.6 Document Upload Function
```python
# functions/document_upload.py
import uuid
from azure.storage.blob import BlobServiceClient
from supabase import create_client
from typing import Dict, Any

class DocumentUploadService:
    def __init__(self):
        self.blob_service = BlobServiceClient.from_connection_string(
            AzureConfig.STORAGE_CONNECTION_STRING
        )
        self.supabase = create_client(
            SupabaseConfig.URL,
            SupabaseConfig.SERVICE_KEY
        )
    
    async def upload_document(
        self,
        file_content: bytes,
        filename: str,
        org_id: str,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Upload document to blob storage and register in database"""
        
        # 1. Generate unique blob name
        doc_id = str(uuid.uuid4())
        blob_name = f"{org_id}/{doc_id}/{filename}"
        
        # 2. Upload to blob storage
        blob_client = self.blob_service.get_blob_client(
            container=AzureConfig.STORAGE_CONTAINER_DOCUMENTS,
            blob=blob_name
        )
        
        blob_client.upload_blob(
            data=file_content,
            overwrite=True,
            metadata={
                "org_id": org_id,
                "document_id": doc_id,
                "original_filename": filename
            }
        )
        
        # 3. Get blob URL
        blob_url = blob_client.url
        
        # 4. Register in Supabase
        document = {
            "id": doc_id,
            "org_id": org_id,
            "filename": filename,
            "blob_url": blob_url,
            "status": "uploaded",
            "metadata": metadata or {}
        }
        
        self.supabase.table("documents").insert(document).execute()
        
        # 5. Trigger processing event
        await self._trigger_processing(doc_id, org_id, blob_url)
        
        return doc_id
    
    async def _trigger_processing(self, doc_id: str, org_id: str, blob_url: str):
        """Trigger document processing pipeline"""
        # This will be picked up by Event Grid automatically
        # Just log for now
        print(f"Document {doc_id} uploaded, processing will start automatically")
```

#### 1.7 Azure Function Trigger
```python
# functions/process_document_trigger.py
import azure.functions as func
import json
import logging

async def main(event: func.EventGridEvent):
    """Azure Function triggered by blob upload"""
    
    logging.info(f'Processing blob event: {event.id}')
    
    # Parse event data
    event_data = event.get_json()
    blob_url = event_data['url']
    
    # Extract metadata from blob
    blob_service = BlobServiceClient.from_connection_string(
        AzureConfig.STORAGE_CONNECTION_STRING
    )
    
    # Parse blob path to get org_id and doc_id
    # Format: /{org_id}/{doc_id}/{filename}
    blob_path = event_data['subject'].split('/containers/documents/blobs/')[1]
    org_id, doc_id, filename = blob_path.split('/', 2)
    
    # Start processing orchestration
    client = df.DurableOrchestrationClient(starter)
    instance_id = await client.start_new(
        "DocumentProcessingOrchestrator",
        None,
        {
            "document_id": doc_id,
            "org_id": org_id,
            "blob_url": blob_url
        }
    )
    
    logging.info(f"Started orchestration with ID = '{instance_id}'")
    
    return {"status": "processing_started", "instance_id": instance_id}
```

### Day 5: Testing Checklist

#### 1.8 Verify Infrastructure
```python
# tests/test_infrastructure.py
import pytest
from azure.storage.blob import BlobServiceClient
from azure.search.documents.indexes import SearchIndexClient

def test_blob_storage_connection():
    """Test blob storage is accessible"""
    client = BlobServiceClient.from_connection_string(
        AzureConfig.STORAGE_CONNECTION_STRING
    )
    containers = list(client.list_containers())
    assert "documents" in [c.name for c in containers]

def test_search_service_connection():
    """Test Azure AI Search is accessible"""
    client = SearchIndexClient(
        AzureConfig.SEARCH_ENDPOINT,
        AzureKeyCredential(AzureConfig.SEARCH_KEY)
    )
    # Should not throw
    indexes = list(client.list_indexes())

def test_supabase_connection():
    """Test Supabase is accessible"""
    client = create_client(SupabaseConfig.URL, SupabaseConfig.SERVICE_KEY)
    # Test query
    result = client.table("documents").select("id").limit(1).execute()
    assert result is not None
```

---

## Phase 2: Document Intelligence & Chunking (Week 2)
**Goal:** Extract document structure and create intelligent chunks

### Day 6-7: Document Intelligence Integration

#### 2.1 Document Extraction Service
```python
# services/document_extractor.py
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from typing import Dict, List
import json

class DocumentExtractor:
    def __init__(self):
        self.client = DocumentAnalysisClient(
            endpoint=AzureConfig.DOCINTEL_ENDPOINT,
            credential=AzureKeyCredential(AzureConfig.DOCINTEL_KEY)
        )
    
    async def extract_document_structure(self, blob_url: str) -> Dict:
        """Extract complete document structure with coordinates"""
        
        # Start analysis
        poller = self.client.begin_analyze_document_from_url(
            "prebuilt-layout",
            blob_url
        )
        
        result = poller.result()
        
        # Build structured output
        document_structure = {
            "pages": [],
            "tables": [],
            "sections": [],
            "metadata": {
                "page_count": len(result.pages),
                "has_tables": len(result.tables) > 0
            }
        }
        
        # Extract pages with text and coordinates
        for page in result.pages:
            page_data = {
                "page_number": page.page_number,
                "width": page.width,
                "height": page.height,
                "text_blocks": [],
                "lines": []
            }
            
            # Extract lines with bounding boxes
            for line in page.lines:
                page_data["lines"].append({
                    "text": line.content,
                    "bbox": [
                        line.polygon[0].x, line.polygon[0].y,
                        line.polygon[2].x, line.polygon[2].y
                    ] if line.polygon else None,
                    "confidence": getattr(line, 'confidence', 1.0)
                })
            
            document_structure["pages"].append(page_data)
        
        # Extract tables
        for idx, table in enumerate(result.tables):
            table_data = self._extract_table_data(table, idx)
            document_structure["tables"].append(table_data)
        
        # Build section hierarchy
        document_structure["sections"] = self._build_sections(result)
        
        return document_structure
    
    def _extract_table_data(self, table, table_id: int) -> Dict:
        """Extract and structure table data"""
        
        # Determine if this is a risk-related table
        table_text = " ".join([cell.content for cell in table.cells])
        is_risk_table, table_type = self._classify_table(table_text)
        
        return {
            "id": f"table_{table_id}",
            "type": table_type if is_risk_table else "general",
            "page": table.bounding_regions[0].page_number if table.bounding_regions else None,
            "bbox": [
                table.bounding_regions[0].polygon[0].x,
                table.bounding_regions[0].polygon[0].y,
                table.bounding_regions[0].polygon[2].x,
                table.bounding_regions[0].polygon[2].y
            ] if table.bounding_regions else None,
            "row_count": table.row_count,
            "column_count": table.column_count,
            "cells": [
                {
                    "row": cell.row_index,
                    "column": cell.column_index,
                    "text": cell.content,
                    "row_span": cell.row_span or 1,
                    "column_span": cell.column_span or 1
                }
                for cell in table.cells
            ],
            "markdown": self._table_to_markdown(table)
        }
    
    def _classify_table(self, text: str) -> tuple[bool, str]:
        """Classify if table is risk-related and its type"""
        text_lower = text.lower()
        
        risk_classifications = [
            ("fmea", ["failure mode", "fmea", "effect analysis", "severity", "occurrence", "detection"]),
            ("risk_matrix", ["risk matrix", "probability", "severity", "risk level"]),
            ("hazard_analysis", ["hazard", "hazardous situation", "harm", "cause"]),
            ("control_measures", ["control measure", "mitigation", "risk control", "residual risk"])
        ]
        
        for table_type, keywords in risk_classifications:
            if any(keyword in text_lower for keyword in keywords):
                return True, table_type
        
        return False, "general"
    
    def _table_to_markdown(self, table) -> str:
        """Convert table to markdown format"""
        # Group cells by row
        rows = {}
        for cell in table.cells:
            if cell.row_index not in rows:
                rows[cell.row_index] = {}
            rows[cell.row_index][cell.column_index] = cell.content
        
        # Build markdown
        markdown_lines = []
        for row_idx in sorted(rows.keys()):
            row_cells = rows[row_idx]
            row_text = " | ".join([
                row_cells.get(col, "") 
                for col in range(max(row_cells.keys()) + 1)
            ])
            markdown_lines.append(f"| {row_text} |")
            
            # Add header separator after first row
            if row_idx == 0:
                separator = " | ".join(["---"] * (max(row_cells.keys()) + 1))
                markdown_lines.append(f"| {separator} |")
        
        return "\n".join(markdown_lines)
```

### Day 8-9: Intelligent Chunking

#### 2.2 Smart Chunking Service
```python
# services/document_chunker.py
import uuid
from typing import List, Dict
import re

class IntelligentChunker:
    def __init__(
        self,
        max_chunk_size: int = 1500,
        overlap: int = 200,
        min_chunk_size: int = 100
    ):
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
        self.min_chunk_size = min_chunk_size
    
    def create_chunks(
        self,
        document_structure: Dict,
        document_id: str
    ) -> List[Dict]:
        """Create intelligent chunks from document structure"""
        
        chunks = []
        
        # 1. Process text sections with hierarchy preservation
        text_chunks = self._create_text_chunks(document_structure)
        chunks.extend(text_chunks)
        
        # 2. Keep tables as atomic chunks
        table_chunks = self._create_table_chunks(document_structure)
        chunks.extend(table_chunks)
        
        # 3. Create cross-reference chunks
        xref_chunks = self._create_crossref_chunks(document_structure)
        chunks.extend(xref_chunks)
        
        # 4. Add metadata to all chunks
        for chunk in chunks:
            chunk["document_id"] = document_id
            chunk["id"] = str(uuid.uuid4())
            chunk["has_risk_content"] = self._detect_risk_content(chunk["content"])
            chunk["regulatory_keywords"] = self._extract_regulatory_keywords(chunk["content"])
        
        return chunks
    
    def _create_text_chunks(self, document_structure: Dict) -> List[Dict]:
        """Create text chunks with section awareness"""
        chunks = []
        
        # Process each page
        for page in document_structure["pages"]:
            page_text = " ".join([line["text"] for line in page["lines"]])
            
            # Find section boundaries on this page
            sections = [
                s for s in document_structure.get("sections", [])
                if s.get("page") == page["page_number"]
            ]
            
            if not sections:
                # No sections found, chunk the entire page
                chunks.extend(self._chunk_text(
                    text=page_text,
                    metadata={
                        "page": page["page_number"],
                        "type": "page_content",
                        "section_path": []
                    }
                ))
            else:
                # Chunk by sections
                for section in sections:
                    section_text = self._extract_section_text(
                        page_text,
                        section,
                        document_structure
                    )
                    
                    chunks.extend(self._chunk_text(
                        text=section_text,
                        metadata={
                            "page": page["page_number"],
                            "type": "section_content",
                            "section_path": section.get("path", []),
                            "section_title": section.get("title", "")
                        }
                    ))
        
        return chunks
    
    def _chunk_text(self, text: str, metadata: Dict) -> List[Dict]:
        """Chunk text with overlap"""
        chunks = []
        
        if len(text) <= self.max_chunk_size:
            # Small text, single chunk
            chunks.append({
                "content": text,
                "metadata": metadata,
                "type": "text"
            })
        else:
            # Split into overlapping chunks
            words = text.split()
            chunk_size_words = self.max_chunk_size // 6  # Rough word count
            overlap_words = self.overlap // 6
            
            for i in range(0, len(words), chunk_size_words - overlap_words):
                chunk_words = words[i:i + chunk_size_words]
                chunk_text = " ".join(chunk_words)
                
                # Add context prefix if this is a continuation
                if i > 0 and metadata.get("section_path"):
                    context = f"[Section: {' > '.join(metadata['section_path'])}]\n"
                    chunk_text = context + chunk_text
                
                chunks.append({
                    "content": chunk_text,
                    "metadata": {
                        **metadata,
                        "chunk_index": len(chunks),
                        "is_continuation": i > 0
                    },
                    "type": "text"
                })
        
        return chunks
    
    def _create_table_chunks(self, document_structure: Dict) -> List[Dict]:
        """Create chunks for tables (never split tables)"""
        chunks = []
        
        for table in document_structure.get("tables", []):
            chunk = {
                "content": table["markdown"],
                "metadata": {
                    "page": table["page"],
                    "table_id": table["id"],
                    "table_type": table["type"],
                    "rows": table["row_count"],
                    "columns": table["column_count"],
                    "bbox": table.get("bbox")
                },
                "type": "table",
                "artifact_type": table["type"]
            }
            chunks.append(chunk)
        
        return chunks
    
    def _create_crossref_chunks(self, document_structure: Dict) -> List[Dict]:
        """Create chunks for cross-references to improve retrieval"""
        chunks = []
        
        # Find cross-references in text
        for page in document_structure["pages"]:
            page_text = " ".join([line["text"] for line in page["lines"]])
            
            # Look for references like "see Section 4.2" or "as described in clause 5.1"
            ref_patterns = [
                r"(?:see|refer to|described in|detailed in)\s+(?:section|clause|chapter)\s+(\d+(?:\.\d+)*)",
                r"(?:Section|Clause|Chapter)\s+(\d+(?:\.\d+)*)\s+(?:describes|explains|details)"
            ]
            
            for pattern in ref_patterns:
                matches = re.finditer(pattern, page_text, re.IGNORECASE)
                for match in matches:
                    # Extract context around the reference
                    start = max(0, match.start() - 100)
                    end = min(len(page_text), match.end() + 100)
                    context = page_text[start:end]
                    
                    chunks.append({
                        "content": context,
                        "metadata": {
                            "page": page["page_number"],
                            "reference_type": "cross_reference",
                            "referenced_section": match.group(1)
                        },
                        "type": "cross_reference"
                    })
        
        return chunks
    
    def _detect_risk_content(self, text: str) -> bool:
        """Detect if chunk contains risk-related content"""
        risk_indicators = [
            "risk", "hazard", "severity", "probability",
            "mitigation", "control", "fmea", "failure",
            "safety", "harm", "iso 14971", "risk management"
        ]
        
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in risk_indicators)
    
    def _extract_regulatory_keywords(self, text: str) -> List[str]:
        """Extract ISO 14971 specific keywords"""
        keywords = []
        text_lower = text.lower()
        
        # ISO 14971 specific terms
        iso_terms = [
            "risk management", "risk analysis", "risk evaluation",
            "risk control", "residual risk", "risk/benefit",
            "production and post-production", "hazardous situation",
            "severity", "probability of occurrence", "risk acceptability",
            "risk management file", "risk management plan",
            "verification", "validation"
        ]
        
        for term in iso_terms:
            if term in text_lower:
                keywords.append(term)
        
        # Extract clause references
        clause_pattern = r'\b(?:clause\s+)?(\d+(?:\.\d+)*)\b'
        clauses = re.findall(clause_pattern, text_lower)
        keywords.extend([f"clause_{c}" for c in clauses])
        
        return keywords
```

### Day 10: Testing Extraction & Chunking

#### 2.3 Test Document Processing
```python
# tests/test_document_processing.py
import pytest
from services.document_extractor import DocumentExtractor
from services.document_chunker import IntelligentChunker

@pytest.fixture
def sample_document_url():
    # Upload a test document and return URL
    return "https://storage.blob.core.windows.net/test/sample.pdf"

async def test_document_extraction(sample_document_url):
    """Test document extraction produces expected structure"""
    extractor = DocumentExtractor()
    
    structure = await extractor.extract_document_structure(sample_document_url)
    
    assert "pages" in structure
    assert "tables" in structure
    assert "sections" in structure
    assert len(structure["pages"]) > 0

def test_chunking_preserves_tables():
    """Test that tables are never split across chunks"""
    chunker = IntelligentChunker()
    
    # Mock document structure with table
    doc_structure = {
        "pages": [],
        "tables": [{
            "id": "table_0",
            "type": "risk_matrix",
            "page": 1,
            "markdown": "| Risk | Severity |\n| --- | --- |\n| A | High |",
            "row_count": 2,
            "column_count": 2
        }]
    }
    
    chunks = chunker.create_chunks(doc_structure, "test-doc-id")
    
    # Find table chunk
    table_chunks = [c for c in chunks if c["type"] == "table"]
    assert len(table_chunks) == 1
    assert "Risk | Severity" in table_chunks[0]["content"]

def test_chunking_overlap():
    """Test text chunks have proper overlap"""
    chunker = IntelligentChunker(max_chunk_size=100, overlap=20)
    
    # Create long text
    long_text = " ".join([f"Word{i}" for i in range(100)])
    
    chunks = chunker._chunk_text(
        long_text,
        metadata={"page": 1}
    )
    
    # Check overlap exists
    assert len(chunks) > 1
    for i in range(len(chunks) - 1):
        # Some words should appear in both chunks
        chunk1_words = set(chunks[i]["content"].split())
        chunk2_words = set(chunks[i + 1]["content"].split())
        overlap = chunk1_words.intersection(chunk2_words)
        assert len(overlap) > 0
```

---

## Phase 3: Azure AI Search Integration (Week 3)
**Goal:** Set up search index and implement retrieval

### Day 11-12: Create Search Index

#### 3.1 Search Index Creation
```python
# services/search_index_manager.py
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SimpleField,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    VectorSearch,
    HnswAlgorithmConfiguration,
    VectorSearchProfile,
    SemanticConfiguration,
    SemanticPrioritizedFields,
    SemanticField,
    SemanticSearch
)

class SearchIndexManager:
    def __init__(self):
        self.client = SearchIndexClient(
            endpoint=AzureConfig.SEARCH_ENDPOINT,
            credential=AzureKeyCredential(AzureConfig.SEARCH_KEY)
        )
        self.index_name = AzureConfig.SEARCH_INDEX_NAME
    
    def create_index(self):
        """Create the search index with vector and semantic search"""
        
        # Define fields
        fields = [
            SimpleField(
                name="id",
                type=SearchFieldDataType.String,
                key=True
            ),
            SimpleField(
                name="document_id",
                type=SearchFieldDataType.String,
                filterable=True
            ),
            SimpleField(
                name="org_id",
                type=SearchFieldDataType.String,
                filterable=True
            ),
            SearchableField(
                name="content",
                type=SearchFieldDataType.String,
                analyzer_name="en.lucene"
            ),
            SearchField(
                name="content_vector",
                type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                searchable=True,
                vector_search_dimensions=1536,
                vector_search_profile_name="vector-profile"
            ),
            SimpleField(
                name="page",
                type=SearchFieldDataType.Int32,
                filterable=True,
                sortable=True
            ),
            SimpleField(
                name="chunk_type",
                type=SearchFieldDataType.String,
                filterable=True
            ),
            SimpleField(
                name="artifact_type",
                type=SearchFieldDataType.String,
                filterable=True
            ),
            SearchableField(
                name="section_path",
                type=SearchFieldDataType.Collection(SearchFieldDataType.String),
                filterable=True
            ),
            SimpleField(
                name="has_risk_content",
                type=SearchFieldDataType.Boolean,
                filterable=True
            ),
            SearchableField(
                name="regulatory_keywords",
                type=SearchFieldDataType.Collection(SearchFieldDataType.String),
                filterable=True
            ),
            SimpleField(
                name="bbox",
                type=SearchFieldDataType.String
            ),
            SimpleField(
                name="metadata",
                type=SearchFieldDataType.String
            ),
            SimpleField(
                name="created_at",
                type=SearchFieldDataType.DateTimeOffset,
                filterable=True
            )
        ]
        
        # Configure vector search
        vector_search = VectorSearch(
            algorithms=[
                HnswAlgorithmConfiguration(
                    name="hnsw-config",
                    parameters={
                        "m": 4,
                        "efConstruction": 400,
                        "efSearch": 500,
                        "metric": "cosine"
                    }
                )
            ],
            profiles=[
                VectorSearchProfile(
                    name="vector-profile",
                    algorithm_configuration_name="hnsw-config"
                )
            ]
        )
        
        # Configure semantic search
        semantic_search = SemanticSearch(
            configurations=[
                SemanticConfiguration(
                    name="semantic-config",
                    prioritized_fields=SemanticPrioritizedFields(
                        content_fields=[
                            SemanticField(field_name="content")
                        ],
                        keywords_fields=[
                            SemanticField(field_name="regulatory_keywords")
                        ]
                    )
                )
            ]
        )
        
        # Create index
        index = SearchIndex(
            name=self.index_name,
            fields=fields,
            vector_search=vector_search,
            semantic_search=semantic_search
        )
        
        # Create or update
        self.client.create_or_update_index(index)
        
        print(f"Index '{self.index_name}' created successfully")
    
    def delete_index(self):
        """Delete the index if it exists"""
        try:
            self.client.delete_index(self.index_name)
            print(f"Index '{self.index_name}' deleted")
        except:
            print(f"Index '{self.index_name}' does not exist")
```

### Day 13: Embedding Service

#### 3.2 Create Embedding Service
```python
# services/embedding_service.py
from openai import AzureOpenAI
import numpy as np
from typing import List
import tiktoken

class EmbeddingService:
    def __init__(self):
        self.client = AzureOpenAI(
            azure_endpoint=AzureConfig.OPENAI_ENDPOINT,
            api_key=AzureConfig.OPENAI_KEY,
            api_version="2024-02-15-preview"
        )
        self.deployment = AzureConfig.OPENAI_EMBEDDING_DEPLOYMENT
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.max_tokens = 8191  # Max for text-embedding-3-large
    
    async def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        
        # Truncate if too long
        tokens = self.encoding.encode(text)
        if len(tokens) > self.max_tokens:
            text = self.encoding.decode(tokens[:self.max_tokens])
        
        response = self.client.embeddings.create(
            model=self.deployment,
            input=text
        )
        
        return response.data[0].embedding
    
    async def batch_embed(
        self,
        texts: List[str],
        batch_size: int = 20
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        
        embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            # Truncate each text if needed
            truncated_batch = []
            for text in batch:
                tokens = self.encoding.encode(text)
                if len(tokens) > self.max_tokens:
                    text = self.encoding.decode(tokens[:self.max_tokens])
                truncated_batch.append(text)
            
            # Get embeddings
            response = self.client.embeddings.create(
                model=self.deployment,
                input=truncated_batch
            )
            
            batch_embeddings = [item.embedding for item in response.data]
            embeddings.extend(batch_embeddings)
        
        return embeddings
```

### Day 14-15: Indexing Service

#### 3.3 Document Indexing Service
```python
# services/indexing_service.py
from azure.search.documents import SearchClient
from datetime import datetime
import json
from typing import List, Dict

class IndexingService:
    def __init__(self):
        self.search_client = SearchClient(
            endpoint=AzureConfig.SEARCH_ENDPOINT,
            index_name=AzureConfig.SEARCH_INDEX_NAME,
            credential=AzureKeyCredential(AzureConfig.SEARCH_KEY)
        )
        self.embedding_service = EmbeddingService()
    
    async def index_document_chunks(
        self,
        chunks: List[Dict],
        document_id: str,
        org_id: str
    ):
        """Index all chunks for a document"""
        
        # Generate embeddings for all chunks
        texts = [chunk["content"] for chunk in chunks]
        embeddings = await self.embedding_service.batch_embed(texts)
        
        # Prepare documents for indexing
        search_documents = []
        
        for chunk, embedding in zip(chunks, embeddings):
            search_doc = {
                "id": f"{document_id}_{chunk['id']}",
                "document_id": document_id,
                "org_id": org_id,
                "content": chunk["content"],
                "content_vector": embedding,
                "page": chunk.get("metadata", {}).get("page"),
                "chunk_type": chunk["type"],
                "artifact_type": chunk.get("artifact_type", "text"),
                "section_path": chunk.get("metadata", {}).get("section_path", []),
                "has_risk_content": chunk.get("has_risk_content", False),
                "regulatory_keywords": chunk.get("regulatory_keywords", []),
                "bbox": json.dumps(chunk.get("metadata", {}).get("bbox"))
                    if chunk.get("metadata", {}).get("bbox") else None,
                "metadata": json.dumps(chunk.get("metadata", {})),
                "created_at": datetime.utcnow().isoformat()
            }
            
            search_documents.append(search_doc)
        
        # Upload in batches
        batch_size = 100
        for i in range(0, len(search_documents), batch_size):
            batch = search_documents[i:i + batch_size]
            result = self.search_client.upload_documents(documents=batch)
            
            # Check for failures
            failed = [r for r in result if not r.succeeded]
            if failed:
                print(f"Failed to index {len(failed)} documents")
                for f in failed:
                    print(f"  - {f.key}: {f.error_message}")
        
        print(f"Indexed {len(search_documents)} chunks for document {document_id}")
    
    async def delete_document_chunks(self, document_id: str, org_id: str):
        """Delete all chunks for a document"""
        
        # Search for all chunks of this document
        results = self.search_client.search(
            search_text="*",
            filter=f"document_id eq '{document_id}' and org_id eq '{org_id}'",
            select=["id"]
        )
        
        # Collect IDs
        chunk_ids = [r["id"] for r in results]
        
        if chunk_ids:
            # Delete in batches
            batch_size = 100
            for i in range(0, len(chunk_ids), batch_size):
                batch = chunk_ids[i:i + batch_size]
                self.search_client.delete_documents(
                    documents=[{"id": chunk_id} for chunk_id in batch]
                )
            
            print(f"Deleted {len(chunk_ids)} chunks for document {document_id}")
```

---

## Phase 4: Evaluation Engine (Week 4)
**Goal:** Implement requirement evaluation with LLM

### Day 16-17: Evidence Extraction

#### 4.1 Evidence Extraction Service
```python
# services/evidence_extractor.py
from azure.search.documents import SearchClient
from typing import List, Dict, Optional
import asyncio

class EvidenceExtractor:
    def __init__(self):
        self.search_client = SearchClient(
            endpoint=AzureConfig.SEARCH_ENDPOINT,
            index_name=AzureConfig.SEARCH_INDEX_NAME,
            credential=AzureKeyCredential(AzureConfig.SEARCH_KEY)
        )
        self.embedding_service = EmbeddingService()
    
    async def extract_evidence(
        self,
        requirement: Dict,
        document_id: str,
        org_id: str
    ) -> Dict:
        """Extract evidence for a requirement from document"""
        
        # 1. Build search queries
        queries = self._build_search_queries(requirement)
        
        # 2. Execute searches (vector, keyword, semantic)
        search_results = await self._execute_searches(
            queries=queries,
            document_id=document_id,
            org_id=org_id
        )
        
        # 3. Rank and filter results
        ranked_results = self._rank_results(search_results, requirement)
        
        # 4. Build evidence object
        evidence = self._build_evidence(
            requirement=requirement,
            search_results=ranked_results,
            document_id=document_id
        )
        
        return evidence
    
    def _build_search_queries(self, requirement: Dict) -> Dict:
        """Build multiple search strategies"""
        
        queries = {
            "vector_query": requirement["text"],
            "keyword_queries": [],
            "filters": {}
        }
        
        # Add evaluation hints as keywords
        if requirement.get("evaluation_hints"):
            queries["keyword_queries"].extend(requirement["evaluation_hints"])
        
        # Add keywords from requirement text
        keywords = self._extract_keywords(requirement["text"])
        queries["keyword_queries"].extend(keywords)
        
        # Add filters based on typical evidence types
        if requirement.get("typical_evidence_types"):
            queries["filters"]["artifact_types"] = requirement["typical_evidence_types"]
        
        # If requirement mentions risk, filter for risk content
        if "risk" in requirement["text"].lower():
            queries["filters"]["has_risk_content"] = True
        
        return queries
    
    async def _execute_searches(
        self,
        queries: Dict,
        document_id: str,
        org_id: str,
        top_k: int = 10
    ) -> List[Dict]:
        """Execute multiple search strategies and combine results"""
        
        all_results = {}
        base_filter = f"document_id eq '{document_id}' and org_id eq '{org_id}'"
        
        # 1. Vector search
        if queries["vector_query"]:
            vector_embedding = await self.embedding_service.embed_text(
                queries["vector_query"]
            )
            
            vector_results = self.search_client.search(
                search_text=None,
                vector_queries=[{
                    "vector": vector_embedding,
                    "k_nearest_neighbors": top_k,
                    "fields": "content_vector"
                }],
                filter=base_filter,
                select=["id", "content", "page", "chunk_type", "artifact_type",
                       "section_path", "bbox", "metadata"],
                top=top_k
            )
            
            for result in vector_results:
                result_dict = dict(result)
                result_dict["search_type"] = "vector"
                result_dict["score"] = result.get("@search.score", 0)
                all_results[result["id"]] = result_dict
        
        # 2. Keyword search
        for keyword_query in queries["keyword_queries"][:3]:  # Limit keywords
            keyword_results = self.search_client.search(
                search_text=keyword_query,
                filter=base_filter,
                select=["id", "content", "page", "chunk_type", "artifact_type",
                       "section_path", "bbox", "metadata"],
                top=top_k
            )
            
            for result in keyword_results:
                result_id = result["id"]
                if result_id in all_results:
                    # Combine scores
                    all_results[result_id]["score"] += result.get("@search.score", 0) * 0.8
                else:
                    result_dict = dict(result)
                    result_dict["search_type"] = "keyword"
                    result_dict["score"] = result.get("@search.score", 0) * 0.8
                    all_results[result_id] = result_dict
        
        # 3. Semantic search
        semantic_results = self.search_client.search(
            search_text=queries["vector_query"],
            query_type="semantic",
            semantic_configuration_name="semantic-config",
            filter=base_filter,
            select=["id", "content", "page", "chunk_type", "artifact_type",
                   "section_path", "bbox", "metadata"],
            top=top_k
        )
        
        for result in semantic_results:
            result_id = result["id"]
            if result_id in all_results:
                all_results[result_id]["score"] += result.get("@search.reranker_score", 0) * 1.2
            else:
                result_dict = dict(result)
                result_dict["search_type"] = "semantic"
                result_dict["score"] = result.get("@search.reranker_score", 0) * 1.2
                all_results[result_id] = result_dict
        
        # Sort by combined score
        sorted_results = sorted(
            all_results.values(),
            key=lambda x: x["score"],
            reverse=True
        )
        
        return sorted_results[:top_k]
    
    def _rank_results(
        self,
        search_results: List[Dict],
        requirement: Dict
    ) -> List[Dict]:
        """Rank results based on relevance to requirement"""
        
        for result in search_results:
            relevance_score = 0
            matching_concepts = []
            
            content_lower = result["content"].lower()
            
            # Check for evaluation hints
            for hint in requirement.get("evaluation_hints", []):
                if hint.lower() in content_lower:
                    relevance_score += 0.2
                    matching_concepts.append(hint)
            
            # Check for typical evidence types
            if result.get("artifact_type") in requirement.get("typical_evidence_types", []):
                relevance_score += 0.3
                matching_concepts.append(f"type:{result['artifact_type']}")
            
            # Check for clause references
            if requirement.get("clause_number"):
                if requirement["clause_number"] in content_lower:
                    relevance_score += 0.3
                    matching_concepts.append(f"clause:{requirement['clause_number']}")
            
            # Normalize relevance score
            result["relevance_score"] = min(relevance_score + result["score"] / 10, 1.0)
            result["matching_concepts"] = matching_concepts
        
        # Re-sort by relevance
        return sorted(search_results, key=lambda x: x["relevance_score"], reverse=True)
    
    def _build_evidence(
        self,
        requirement: Dict,
        search_results: List[Dict],
        document_id: str
    ) -> Dict:
        """Build evidence object from search results"""
        
        artifacts = []
        for result in search_results:
            if result["relevance_score"] > 0.3:  # Threshold
                artifacts.append({
                    "type": result.get("artifact_type", "text"),
                    "location": {
                        "page": result.get("page"),
                        "section_path": result.get("section_path", []),
                        "bbox": json.loads(result["bbox"]) if result.get("bbox") else None
                    },
                    "content": result["content"],
                    "relevance_score": result["relevance_score"],
                    "matching_concepts": result.get("matching_concepts", [])
                })
        
        # Determine evidence type and strength
        if not artifacts:
            evidence_type = "absent"
            strength = "weak"
        elif any(a["relevance_score"] > 0.8 for a in artifacts):
            evidence_type = "direct"
            strength = "strong"
        elif len(artifacts) >= 3:
            evidence_type = "indirect"
            strength = "moderate"
        else:
            evidence_type = "indirect"
            strength = "weak"
        
        # Identify gaps
        gaps = self._identify_gaps(requirement, artifacts)
        
        return {
            "requirement_id": requirement["id"],
            "document_id": document_id,
            "evidence_type": evidence_type,
            "strength": strength,
            "artifacts": artifacts[:5],  # Limit to top 5
            "gaps": gaps
        }
    
    def _identify_gaps(self, requirement: Dict, artifacts: List[Dict]) -> List[str]:
        """Identify what's missing for full compliance"""
        gaps = []
        
        # Check for missing evidence types
        found_types = {a["type"] for a in artifacts}
        expected_types = set(requirement.get("typical_evidence_types", []))
        missing_types = expected_types - found_types
        
        for missing in missing_types:
            gaps.append(f"No {missing} found")
        
        # Check for weak evidence
        if all(a["relevance_score"] < 0.6 for a in artifacts):
            gaps.append("Only weak or indirect evidence found")
        
        # Specific requirement checks
        req_text_lower = requirement["text"].lower()
        
        if "plan" in req_text_lower:
            if not any("plan" in a["content"].lower() for a in artifacts):
                gaps.append("No explicit plan documented")
        
        if "verification" in req_text_lower:
            if not any("verif" in a["content"].lower() for a in artifacts):
                gaps.append("Verification activities not documented")
        
        if "validation" in req_text_lower:
            if not any("valid" in a["content"].lower() for a in artifacts):
                gaps.append("Validation activities not documented")
        
        return gaps
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract key phrases from requirement text"""
        # Simple keyword extraction - could use NLP library
        import re
        
        # Remove common words
        stop_words = {"the", "shall", "must", "should", "will", "can", "be", "is", "are", 
                     "was", "were", "been", "have", "has", "had", "do", "does", "did",
                     "a", "an", "and", "or", "but", "if", "for", "to", "of", "in", "on"}
        
        # Extract words
        words = re.findall(r'\b[a-z]+\b', text.lower())
        keywords = [w for w in words if w not in stop_words and len(w) > 3]
        
        # Extract phrases (2-3 word combinations)
        phrases = []
        for i in range(len(words) - 1):
            if words[i] not in stop_words and words[i+1] not in stop_words:
                phrases.append(f"{words[i]} {words[i+1]}")
        
        return keywords[:5] + phrases[:3]  # Limit total keywords
```

### Day 18-19: LLM Evaluation Service

#### 4.2 Requirement Evaluator
```python
# services/requirement_evaluator.py
from openai import AzureOpenAI
import json
from typing import Dict, List
import uuid
from datetime import datetime

class RequirementEvaluator:
    def __init__(self):
        self.client = AzureOpenAI(
            azure_endpoint=AzureConfig.OPENAI_ENDPOINT,
            api_key=AzureConfig.OPENAI_KEY,
            api_version="2024-02-15-preview"
        )
        self.deployment = AzureConfig.OPENAI_DEPLOYMENT_NAME
        self.system_prompt = self._load_system_prompt()
    
    async def evaluate_requirement(
        self,
        requirement: Dict,
        evidence: Dict,
        document_context: Dict = None
    ) -> Dict:
        """Evaluate if requirement is satisfied based on evidence"""
        
        # 1. Build evaluation prompt
        prompt = self._build_evaluation_prompt(
            requirement=requirement,
            evidence=evidence,
            context=document_context
        )
        
        # 2. Call LLM
        response = self.client.chat.completions.create(
            model=self.deployment,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=2000
        )
        
        # 3. Parse response
        evaluation = json.loads(response.choices[0].message.content)
        
        # 4. Add metadata
        evaluation["id"] = str(uuid.uuid4())
        evaluation["requirement_id"] = requirement["id"]
        evaluation["document_id"] = evidence["document_id"]
        evaluation["evaluated_at"] = datetime.utcnow().isoformat()
        evaluation["model_version"] = self.deployment
        evaluation["tokens_used"] = response.usage.total_tokens
        
        # 5. Calculate confidence metrics
        evaluation["confidence_metrics"] = self._calculate_confidence(
            evidence=evidence,
            evaluation=evaluation
        )
        
        # 6. Generate gap analysis if FAIL
        if evaluation["status"] == "FAIL":
            evaluation["gap_analysis"] = self._generate_gap_analysis(
                requirement=requirement,
                evidence=evidence,
                evaluation=evaluation
            )
        
        return evaluation
    
    def _load_system_prompt(self) -> str:
        """Load the system prompt for evaluation"""
        return """You are an expert ISO 14971:2019 compliance analyst evaluating medical device documentation.

Your task is to determine if a specific requirement is satisfied based on provided evidence.

# Evaluation Criteria

**PASS**: 
- Direct, explicit evidence that fully addresses the requirement
- Clear documentation using appropriate ISO 14971 terminology
- Evidence scope matches requirement scope
- No ambiguity in compliance

**FAIL**:
- Direct contradiction of the requirement
- Complete absence of required documentation despite evidence of related topics
- Fundamental misunderstanding of the requirement
- Missing mandatory elements that cannot be inferred

**NEEDS_ATTENTION**:
- Partial evidence that doesn't fully cover the requirement
- Ambiguous wording open to interpretation
- Evidence is implied but not explicitly stated
- Minor gaps that don't constitute complete failure
- Version mismatches or outdated references

# Response Format

You must return ONLY valid JSON with this exact structure:

{
  "status": "PASS|FAIL|NEEDS_ATTENTION",
  "rationale": "Clear explanation of why this verdict was chosen",
  "evidence_summary": "Brief summary of what evidence was found and how it relates",
  "citations": [
    {
      "page": <number>,
      "quote": "Exact text from the evidence (max 200 chars)",
      "relevance": "How this citation supports the verdict",
      "confidence": 0.0-1.0
    }
  ],
  "specific_findings": {
    "strengths": ["List of positive compliance aspects found"],
    "weaknesses": ["List of compliance gaps or issues"],
    "ambiguities": ["List of unclear or ambiguous areas"]
  }
}

# Important Notes
- Every PASS or NEEDS_ATTENTION must have at least one citation
- Citations must be exact quotes from the provided evidence
- Be conservative - prefer NEEDS_ATTENTION over PASS when uncertain
- Consider the medical device context and patient safety implications
- ISO 14971:2019 supersedes the 2007 version"""
    
    def _build_evaluation_prompt(
        self,
        requirement: Dict,
        evidence: Dict,
        context: Dict = None
    ) -> str:
        """Build the evaluation prompt"""
        
        prompt_parts = [
            "# Requirement to Evaluate",
            f"ID: {requirement['id']}",
            f"Clause: {requirement.get('clause_number', 'N/A')}",
            f"Category: {requirement['category']}",
            f"Text: {requirement['text']}",
            f"Priority: {requirement['priority']}",
            ""
        ]
        
        # Add document context if available
        if context:
            prompt_parts.extend([
                "# Document Context",
                f"Document appears to be: {context.get('document_type', 'Unknown')}",
                f"Has risk management content: {context.get('has_risk_content', False)}",
                f"Number of risk tables found: {context.get('risk_table_count', 0)}",
                ""
            ])
        
        # Add evidence
        prompt_parts.extend([
            f"# Evidence Analysis",
            f"Evidence Type: {evidence['evidence_type']}",
            f"Evidence Strength: {evidence['strength']}",
            f"Number of relevant artifacts: {len(evidence['artifacts'])}",
            ""
        ])
        
        # Add artifacts
        if evidence["artifacts"]:
            prompt_parts.append("# Evidence Artifacts")
            
            for i, artifact in enumerate(evidence["artifacts"], 1):
                prompt_parts.extend([
                    f"\n## Artifact {i}",
                    f"Type: {artifact['type']}",
                    f"Page: {artifact['location']['page']}",
                    f"Relevance Score: {artifact['relevance_score']:.2f}",
                    f"Matching Concepts: {', '.join(artifact['matching_concepts'])}",
                    f"Content:",
                    "```",
                    artifact['content'][:1500],  # Limit length
                    "```"
                ])
        else:
            prompt_parts.extend([
                "# No Evidence Found",
                "No relevant evidence artifacts were found for this requirement.",
                ""
            ])
        
        # Add identified gaps
        if evidence.get("gaps"):
            prompt_parts.extend([
                "",
                "# Identified Gaps",
                *[f"- {gap}" for gap in evidence["gaps"]]
            ])
        
        # Add instructions
        prompt_parts.extend([
            "",
            "# Task",
            "Based on the evidence provided, evaluate if the requirement is satisfied.",
            "Return your evaluation as JSON only, no markdown blocks or explanations outside the JSON."
        ])
        
        return "\n".join(prompt_parts)
    
    def _calculate_confidence(
        self,
        evidence: Dict,
        evaluation: Dict
    ) -> Dict:
        """Calculate confidence metrics for the evaluation"""
        
        # Evidence strength (from evidence extractor)
        evidence_strength = evidence["strength"]
        
        # Coverage assessment
        artifact_count = len(evidence["artifacts"])
        if evidence["evidence_type"] == "direct" and artifact_count >= 3:
            coverage = "complete"
        elif evidence["evidence_type"] == "direct" or artifact_count >= 2:
            coverage = "partial"
        else:
            coverage = "minimal"
        
        # Interpretation risk
        if evaluation["status"] == "PASS" and evidence_strength == "strong":
            interpretation_risk = "low"
        elif evaluation["status"] == "FAIL" and evidence["evidence_type"] == "absent":
            interpretation_risk = "low"
        elif evaluation["status"] == "NEEDS_ATTENTION":
            interpretation_risk = "high"
        else:
            interpretation_risk = "medium"
        
        # Overall confidence score
        confidence_score = 0.0
        
        if evidence_strength == "strong":
            confidence_score += 0.4
        elif evidence_strength == "moderate":
            confidence_score += 0.2
        else:
            confidence_score += 0.1
        
        if coverage == "complete":
            confidence_score += 0.3
        elif coverage == "partial":
            confidence_score += 0.2
        else:
            confidence_score += 0.1
        
        if interpretation_risk == "low":
            confidence_score += 0.3
        elif interpretation_risk == "medium":
            confidence_score += 0.2
        else:
            confidence_score += 0.1
        
        return {
            "evidence_strength": evidence_strength,
            "coverage": coverage,
            "interpretation_risk": interpretation_risk,
            "overall_confidence": round(confidence_score, 2)
        }
    
    def _generate_gap_analysis(
        self,
        requirement: Dict,
        evidence: Dict,
        evaluation: Dict
    ) -> Dict:
        """Generate gap analysis for failed requirements"""
        
        gap_analysis = {
            "missing_elements": [],
            "suggested_sections": [],
            "remediation_guidance": [],
            "example_language": None
        }
        
        # Add gaps from evidence
        gap_analysis["missing_elements"].extend(evidence.get("gaps", []))
        
        # Add gaps from evaluation
        if evaluation.get("specific_findings", {}).get("weaknesses"):
            gap_analysis["missing_elements"].extend(
                evaluation["specific_findings"]["weaknesses"]
            )
        
        # Generate suggestions based on requirement type
        req_text_lower = requirement["text"].lower()
        
        if "risk management plan" in req_text_lower:
            gap_analysis["suggested_sections"].append("1. Risk Management Planning")
            gap_analysis["remediation_guidance"].append(
                "Create a comprehensive Risk Management Plan that defines scope, "
                "responsibilities, criteria for risk acceptability, and verification activities"
            )
            gap_analysis["example_language"] = (
                "The Risk Management Plan for [PRODUCT NAME] defines the risk management "
                "activities to be conducted throughout the product lifecycle in accordance "
                "with ISO 14971:2019. This plan establishes..."
            )
        
        elif "risk analysis" in req_text_lower:
            gap_analysis["suggested_sections"].append("4. Risk Analysis")
            gap_analysis["remediation_guidance"].append(
                "Document systematic risk analysis using recognized techniques "
                "(FMEA, FTA, HAZOP) with clear hazard identification"
            )
        
        elif "risk evaluation" in req_text_lower:
            gap_analysis["suggested_sections"].append("5. Risk Evaluation")
            gap_analysis["remediation_guidance"].append(
                "Document risk evaluation against defined acceptability criteria"
            )
        
        elif "risk control" in req_text_lower:
            gap_analysis["suggested_sections"].append("6. Risk Control")
            gap_analysis["remediation_guidance"].append(
                "Document risk control measures with verification of effectiveness"
            )
        
        elif "residual risk" in req_text_lower:
            gap_analysis["suggested_sections"].append("7. Residual Risk Evaluation")
            gap_analysis["remediation_guidance"].append(
                "Document evaluation of residual risks after control implementation"
            )
        
        return gap_analysis
```

### Day 20: Testing Evaluation

#### 4.3 Test Evaluation Pipeline
```python
# tests/test_evaluation.py
import pytest
import asyncio
from services.evidence_extractor import EvidenceExtractor
from services.requirement_evaluator import RequirementEvaluator

@pytest.fixture
def sample_requirement():
    return {
        "id": "RM-4.1",
        "clause_number": "4.1",
        "category": "Risk Management Planning",
        "text": "The manufacturer shall establish, document and maintain a risk management process",
        "priority": "must",
        "evaluation_hints": ["risk management process", "documented", "maintained"],
        "typical_evidence_types": ["risk_management_plan", "process_document"]
    }

@pytest.fixture
def sample_evidence():
    return {
        "requirement_id": "RM-4.1",
        "document_id": "test-doc-123",
        "evidence_type": "direct",
        "strength": "strong",
        "artifacts": [
            {
                "type": "risk_management_plan",
                "location": {"page": 5, "section_path": ["1", "1.2"]},
                "content": "The risk management process for Device X is established and documented in this Risk Management Plan...",
                "relevance_score": 0.9,
                "matching_concepts": ["risk management process", "documented"]
            }
        ],
        "gaps": []
    }

async def test_evidence_extraction(sample_requirement):
    """Test evidence extraction from search results"""
    extractor = EvidenceExtractor()
    
    # Mock search results
    with patch.object(extractor, '_execute_searches') as mock_search:
        mock_search.return_value = [
            {
                "id": "chunk_1",
                "content": "Risk management process is documented",
                "page": 5,
                "artifact_type": "text",
                "relevance_score": 0.8
            }
        ]
        
        evidence = await extractor.extract_evidence(
            requirement=sample_requirement,
            document_id="test-doc",
            org_id="test-org"
        )
        
        assert evidence["evidence_type"] in ["direct", "indirect", "absent"]
        assert evidence["strength"] in ["strong", "moderate", "weak"]
        assert len(evidence["artifacts"]) > 0

async def test_requirement_evaluation(sample_requirement, sample_evidence):
    """Test requirement evaluation with LLM"""
    evaluator = RequirementEvaluator()
    
    evaluation = await evaluator.evaluate_requirement(
        requirement=sample_requirement,
        evidence=sample_evidence
    )
    
    # Check required fields
    assert evaluation["status"] in ["PASS", "FAIL", "NEEDS_ATTENTION"]
    assert "rationale" in evaluation
    assert "citations" in evaluation
    assert "confidence_metrics" in evaluation
    
    # Check citations for PASS
    if evaluation["status"] == "PASS":
        assert len(evaluation["citations"]) > 0
        assert all("quote" in c for c in evaluation["citations"])

def test_confidence_calculation():
    """Test confidence metric calculation"""
    evaluator = RequirementEvaluator()
    
    evidence = {
        "strength": "strong",
        "evidence_type": "direct",
        "artifacts": [1, 2, 3]  # 3 artifacts
    }
    
    evaluation = {
        "status": "PASS"
    }
    
    confidence = evaluator._calculate_confidence(evidence, evaluation)
    
    assert confidence["evidence_strength"] == "strong"
    assert confidence["coverage"] == "complete"
    assert confidence["interpretation_risk"] == "low"
    assert confidence["overall_confidence"] > 0.7
```

---

## Phase 5: Orchestration & API (Week 5)
**Goal:** Connect all components with orchestration

### Day 21-22: Durable Functions Orchestration

#### 5.1 Main Orchestrator
```python
# orchestration/document_orchestrator.py
import azure.functions as func
import azure.durable_functions as df
from typing import List, Dict
import json
import logging

def orchestrator_function(context: df.DurableOrchestrationContext):
    """Main orchestrator for document processing"""
    
    input_data = context.get_input()
    document_id = input_data["document_id"]
    org_id = input_data["org_id"]
    blob_url = input_data["blob_url"]
    
    try:
        # Step 1: Extract document structure
        extraction_result = yield context.call_activity(
            "extract_document_structure",
            {"blob_url": blob_url}
        )
        
        # Step 2: Create chunks
        chunks = yield context.call_activity(
            "create_document_chunks",
            {
                "document_structure": extraction_result,
                "document_id": document_id
            }
        )
        
        # Step 3: Index chunks
        yield context.call_activity(
            "index_chunks",
            {
                "chunks": chunks,
                "document_id": document_id,
                "org_id": org_id
            }
        )
        
        # Step 4: Build document context
        document_context = yield context.call_activity(
            "build_document_context",
            {
                "document_structure": extraction_result,
                "chunks": chunks
            }
        )
        
        # Step 5: Load requirements
        requirements = yield context.call_activity(
            "load_requirements",
            {"org_id": org_id}
        )
        
        # Step 6: Evaluate requirements in parallel
        evaluation_tasks = []
        for requirement in requirements:
            task = context.call_sub_orchestrator(
                "evaluate_single_requirement",
                {
                    "requirement": requirement,
                    "document_id": document_id,
                    "org_id": org_id,
                    "document_context": document_context
                }
            )
            evaluation_tasks.append(task)
        
        # Wait for all evaluations
        evaluations = yield context.task_all(evaluation_tasks)
        
        # Step 7: Generate report
        report = yield context.call_activity(
            "generate_compliance_report",
            {
                "document_id": document_id,
                "evaluations": evaluations,
                "document_context": document_context
            }
        )
        
        # Step 8: Save results
        yield context.call_activity(
            "save_evaluation_results",
            {
                "document_id": document_id,
                "evaluations": evaluations,
                "report": report
            }
        )
        
        # Step 9: Update document status
        yield context.call_activity(
            "update_document_status",
            {
                "document_id": document_id,
                "status": "evaluated"
            }
        )
        
        return {
            "status": "success",
            "document_id": document_id,
            "total_requirements": len(requirements),
            "summary": report["summary"]
        }
        
    except Exception as e:
        logging.error(f"Orchestration failed: {str(e)}")
        
        # Update document status to error
        yield context.call_activity(
            "update_document_status",
            {
                "document_id": document_id,
                "status": "error",
                "error": str(e)
            }
        )
        
        raise

def evaluate_requirement_orchestrator(context: df.DurableOrchestrationContext):
    """Sub-orchestrator for single requirement evaluation"""
    
    input_data = context.get_input()
    requirement = input_data["requirement"]
    document_id = input_data["document_id"]
    org_id = input_data["org_id"]
    document_context = input_data["document_context"]
    
    # Step 1: Extract evidence
    evidence = yield context.call_activity(
        "extract_requirement_evidence",
        {
            "requirement": requirement,
            "document_id": document_id,
            "org_id": org_id
        }
    )
    
    # Step 2: Evaluate with LLM
    evaluation = yield context.call_activity(
        "evaluate_with_llm",
        {
            "requirement": requirement,
            "evidence": evidence,
            "document_context": document_context
        }
    )
    
    # Step 3: Verify if low confidence
    if evaluation["confidence_metrics"]["interpretation_risk"] == "high":
        evaluation = yield context.call_activity(
            "verify_evaluation",
            {
                "evaluation": evaluation,
                "evidence": evidence
            }
        )
    
    return evaluation

# Register orchestrators
main = df.Orchestrator.create(orchestrator_function)
evaluate_requirement = df.Orchestrator.create(evaluate_requirement_orchestrator)
```

#### 5.2 Activity Functions
```python
# activities/document_activities.py
import azure.functions as func
from services.document_extractor import DocumentExtractor
from services.document_chunker import IntelligentChunker
from services.indexing_service import IndexingService
from services.evidence_extractor import EvidenceExtractor
from services.requirement_evaluator import RequirementEvaluator

# Activity: Extract document structure
async def extract_document_structure(context: dict) -> dict:
    blob_url = context["blob_url"]
    
    extractor = DocumentExtractor()
    structure = await extractor.extract_document_structure(blob_url)
    
    return structure

# Activity: Create chunks
async def create_document_chunks(context: dict) -> list:
    document_structure = context["document_structure"]
    document_id = context["document_id"]
    
    chunker = IntelligentChunker()
    chunks = chunker.create_chunks(document_structure, document_id)
    
    return chunks

# Activity: Index chunks
async def index_chunks(context: dict) -> dict:
    chunks = context["chunks"]
    document_id = context["document_id"]
    org_id = context["org_id"]
    
    indexer = IndexingService()
    await indexer.index_document_chunks(chunks, document_id, org_id)
    
    return {"indexed_count": len(chunks)}

# Activity: Build document context
async def build_document_context(context: dict) -> dict:
    structure = context["document_structure"]
    chunks = context["chunks"]
    
    # Analyze document for compliance indicators
    doc_context = {
        "page_count": len(structure["pages"]),
        "has_tables": len(structure.get("tables", [])) > 0,
        "table_count": len(structure.get("tables", [])),
        "risk_table_count": len([
            t for t in structure.get("tables", [])
            if t.get("type") != "general"
        ]),
        "has_risk_content": any(c.get("has_risk_content") for c in chunks),
        "document_type": _infer_document_type(structure, chunks)
    }
    
    return doc_context

def _infer_document_type(structure: dict, chunks: list) -> str:
    """Infer document type from content"""
    
    # Check for specific document types
    full_text = " ".join([c["content"] for c in chunks[:10]]).lower()
    
    if "risk management plan" in full_text:
        return "risk_management_plan"
    elif "risk management file" in full_text:
        return "risk_management_file"
    elif "fmea" in full_text or "failure mode" in full_text:
        return "fmea_analysis"
    elif "validation" in full_text and "report" in full_text:
        return "validation_report"
    elif "design" in full_text and "specification" in full_text:
        return "design_specification"
    else:
        return "general_document"

# Activity: Load requirements
async def load_requirements(context: dict) -> list:
    org_id = context["org_id"]
    
    # Load from Supabase
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.SERVICE_KEY)
    
    result = supabase.table("requirements") \
        .select("*") \
        .eq("active", True) \
        .execute()
    
    return result.data

# Activity: Extract evidence
async def extract_requirement_evidence(context: dict) -> dict:
    requirement = context["requirement"]
    document_id = context["document_id"]
    org_id = context["org_id"]
    
    extractor = EvidenceExtractor()
    evidence = await extractor.extract_evidence(
        requirement=requirement,
        document_id=document_id,
        org_id=org_id
    )
    
    return evidence

# Activity: Evaluate with LLM
async def evaluate_with_llm(context: dict) -> dict:
    requirement = context["requirement"]
    evidence = context["evidence"]
    document_context = context.get("document_context")
    
    evaluator = RequirementEvaluator()
    evaluation = await evaluator.evaluate_requirement(
        requirement=requirement,
        evidence=evidence,
        document_context=document_context
    )
    
    return evaluation

# Activity: Generate report
async def generate_compliance_report(context: dict) -> dict:
    document_id = context["document_id"]
    evaluations = context["evaluations"]
    document_context = context.get("document_context", {})
    
    # Calculate statistics
    total = len(evaluations)
    passed = len([e for e in evaluations if e["status"] == "PASS"])
    failed = len([e for e in evaluations if e["status"] == "FAIL"])
    needs_attention = len([e for e in evaluations if e["status"] == "NEEDS_ATTENTION"])
    
    # Identify high-risk items
    high_risk = [
        e for e in evaluations
        if e["status"] == "FAIL" and e.get("requirement", {}).get("priority") == "must"
    ]
    
    report = {
        "id": str(uuid.uuid4()),
        "document_id": document_id,
        "generated_at": datetime.utcnow().isoformat(),
        "summary": {
            "total_requirements": total,
            "passed": passed,
            "failed": failed,
            "needs_attention": needs_attention,
            "compliance_rate": round(passed / total * 100, 1) if total > 0 else 0
        },
        "high_risk_items": high_risk,
        "document_context": document_context,
        "recommendations": _generate_recommendations(evaluations)
    }
    
    return report

def _generate_recommendations(evaluations: list) -> list:
    """Generate recommendations based on evaluations"""
    recommendations = []
    
    # Group failures by category
    failures_by_category = {}
    for e in evaluations:
        if e["status"] == "FAIL":
            category = e.get("requirement", {}).get("category", "Unknown")
            if category not in failures_by_category:
                failures_by_category[category] = []
            failures_by_category[category].append(e)
    
    # Generate recommendations
    for category, failures in failures_by_category.items():
        if len(failures) >= 2:
            recommendations.append({
                "priority": "high",
                "category": category,
                "recommendation": f"Multiple failures in {category}. Consider comprehensive review and update of this section.",
                "affected_requirements": [f["requirement_id"] for f in failures]
            })
    
    return recommendations

# Activity: Save results
async def save_evaluation_results(context: dict) -> dict:
    document_id = context["document_id"]
    evaluations = context["evaluations"]
    report = context["report"]
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.SERVICE_KEY)
    
    # Save evaluations
    for evaluation in evaluations:
        supabase.table("evaluations").insert(evaluation).execute()
    
    # Save report
    supabase.table("compliance_reports").insert(report).execute()
    
    return {"saved_evaluations": len(evaluations)}

# Activity: Update document status
async def update_document_status(context: dict) -> dict:
    document_id = context["document_id"]
    status = context["status"]
    error = context.get("error")
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.SERVICE_KEY)
    
    update_data = {
        "status": status,
        "processed_date": datetime.utcnow().isoformat()
    }
    
    if error:
        update_data["processing_error"] = error
    
    supabase.table("documents") \
        .update(update_data) \
        .eq("id", document_id) \
        .execute()
    
    return {"status": "updated"}
```

### Day 23-24: REST API

#### 5.3 FastAPI Application
```python
# api/main.py
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Dict
import asyncio
from pydantic import BaseModel

app = FastAPI(
    title="ISO 14971 Compliance API",
    version="1.0.0",
    description="Automated compliance evaluation for medical device documentation"
)

security = HTTPBearer()

# Pydantic models
class DocumentUploadResponse(BaseModel):
    document_id: str
    status: str
    message: str

class EvaluationResponse(BaseModel):
    requirement_id: str
    status: str
    rationale: str
    confidence: float
    citations: List[Dict]

class ComplianceReportResponse(BaseModel):
    document_id: str
    summary: Dict
    high_risk_items: List[Dict]
    recommendations: List[Dict]

# Dependency: Get organization ID from auth
async def get_org_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Decode JWT and extract org_id
    # This is simplified - implement proper JWT validation
    return "org_123"

# Upload document
@app.post("/api/v1/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    document_type: Optional[str] = None,
    org_id: str = Depends(get_org_id)
):
    """Upload a document for compliance evaluation"""
    
    # Validate file
    if not file.filename.endswith(('.pdf', '.docx', '.doc')):
        raise HTTPException(400, "Unsupported file type")
    
    if file.size > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(400, "File too large")
    
    # Upload to blob storage
    from services.document_upload import DocumentUploadService
    upload_service = DocumentUploadService()
    
    content = await file.read()
    document_id = await upload_service.upload_document(
        file_content=content,
        filename=file.filename,
        org_id=org_id,
        metadata={"document_type": document_type}
    )
    
    return DocumentUploadResponse(
        document_id=document_id,
        status="processing",
        message="Document uploaded successfully. Processing will begin shortly."
    )

# Get document status
@app.get("/api/v1/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    org_id: str = Depends(get_org_id)
):
    """Get processing status of a document"""
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.ANON_KEY)
    
    # Get document
    result = supabase.table("documents") \
        .select("*") \
        .eq("id", document_id) \
        .eq("org_id", org_id) \
        .single() \
        .execute()
    
    if not result.data:
        raise HTTPException(404, "Document not found")
    
    document = result.data
    
    response = {
        "document_id": document_id,
        "status": document["status"],
        "uploaded_at": document["upload_date"],
        "processed_at": document.get("processed_date")
    }
    
    # Add processing details if available
    if document["status"] == "evaluated":
        # Get summary
        report_result = supabase.table("compliance_reports") \
            .select("summary") \
            .eq("document_id", document_id) \
            .single() \
            .execute()
        
        if report_result.data:
            response["summary"] = report_result.data["summary"]
    
    return response

# Get evaluations
@app.get("/api/v1/documents/{document_id}/evaluations")
async def get_evaluations(
    document_id: str,
    status: Optional[str] = None,
    category: Optional[str] = None,
    org_id: str = Depends(get_org_id)
):
    """Get evaluation results for a document"""
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.ANON_KEY)
    
    # Build query
    query = supabase.table("evaluations") \
        .select("*, requirements(*)") \
        .eq("document_id", document_id)
    
    if status:
        query = query.eq("status", status)
    
    result = query.execute()
    
    # Filter by category if specified
    evaluations = result.data
    if category:
        evaluations = [
            e for e in evaluations
            if e.get("requirements", {}).get("category") == category
        ]
    
    return {
        "document_id": document_id,
        "total": len(evaluations),
        "evaluations": evaluations
    }

# Get compliance report
@app.get("/api/v1/documents/{document_id}/report")
async def get_compliance_report(
    document_id: str,
    org_id: str = Depends(get_org_id)
):
    """Get the compliance report for a document"""
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.ANON_KEY)
    
    # Get report
    result = supabase.table("compliance_reports") \
        .select("*") \
        .eq("document_id", document_id) \
        .eq("org_id", org_id) \
        .single() \
        .execute()
    
    if not result.data:
        raise HTTPException(404, "Report not found")
    
    return result.data

# Re-evaluate specific requirements
@app.post("/api/v1/documents/{document_id}/reevaluate")
async def reevaluate_requirements(
    document_id: str,
    requirement_ids: List[str],
    org_id: str = Depends(get_org_id)
):
    """Re-evaluate specific requirements"""
    
    # Trigger re-evaluation through Durable Functions
    from azure.durable_functions import DurableOrchestrationClient
    
    client = DurableOrchestrationClient(starter)
    instance_id = await client.start_new(
        "ReevaluationOrchestrator",
        None,
        {
            "document_id": document_id,
            "requirement_ids": requirement_ids,
            "org_id": org_id
        }
    )
    
    return {
        "document_id": document_id,
        "instance_id": instance_id,
        "status": "reevaluation_started",
        "requirements_count": len(requirement_ids)
    }

# Get requirements
@app.get("/api/v1/requirements")
async def get_requirements(
    category: Optional[str] = None,
    active: bool = True
):
    """Get all requirements"""
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.ANON_KEY)
    
    query = supabase.table("requirements") \
        .select("*") \
        .eq("active", active)
    
    if category:
        query = query.eq("category", category)
    
    result = query.execute()
    
    return {
        "total": len(result.data),
        "requirements": result.data
    }

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Metrics endpoint
@app.get("/metrics")
async def get_metrics(org_id: str = Depends(get_org_id)):
    """Get usage metrics"""
    
    from supabase import create_client
    supabase = create_client(SupabaseConfig.URL, SupabaseConfig.ANON_KEY)
    
    # Get counts
    docs_result = supabase.table("documents") \
        .select("status", count="exact") \
        .eq("org_id", org_id) \
        .execute()
    
    evals_result = supabase.table("evaluations") \
        .select("status", count="exact") \
        .execute()
    
    return {
        "documents": {
            "total": docs_result.count,
            "by_status": _group_by_status(docs_result.data)
        },
        "evaluations": {
            "total": evals_result.count,
            "by_status": _group_by_status(evals_result.data)
        }
    }

def _group_by_status(data: list) -> dict:
    """Group records by status"""
    from collections import Counter
    return dict(Counter(item["status"] for item in data))
```

### Day 25: Integration Testing

#### 5.4 End-to-End Tests
```python
# tests/test_integration.py
import pytest
import asyncio
from pathlib import Path
import time

@pytest.fixture
async def test_document():
    """Upload a test document"""
    test_file = Path("tests/fixtures/sample_risk_management_plan.pdf")
    
    with open(test_file, "rb") as f:
        files = {"file": ("test.pdf", f, "application/pdf")}
        response = await client.post(
            "/api/v1/documents/upload",
            files=files,
            headers={"Authorization": "Bearer test-token"}
        )
    
    assert response.status_code == 200
    return response.json()["document_id"]

async def test_full_pipeline(test_document):
    """Test complete document processing pipeline"""
    
    document_id = test_document
    
    # Wait for processing (with timeout)
    max_wait = 300  # 5 minutes
    start_time = time.time()
    
    while time.time() - start_time < max_wait:
        response = await client.get(
            f"/api/v1/documents/{document_id}/status"
        )
        
        status = response.json()["status"]
        
        if status == "evaluated":
            break
        elif status == "error":
            pytest.fail("Document processing failed")
        
        await asyncio.sleep(5)
    else:
        pytest.fail("Document processing timeout")
    
    # Check evaluations exist
    response = await client.get(
        f"/api/v1/documents/{document_id}/evaluations"
    )
    
    evaluations = response.json()["evaluations"]
    assert len(evaluations) > 0
    
    # Check report exists
    response = await client.get(
        f"/api/v1/documents/{document_id}/report"
    )
    
    report = response.json()
    assert "summary" in report
    assert report["summary"]["total_requirements"] > 0

async def test_search_and_retrieval():
    """Test search index and retrieval"""
    
    from services.indexing_service import IndexingService
    from services.evidence_extractor import EvidenceExtractor
    
    # Create test chunks
    chunks = [
        {
            "id": "test-chunk-1",
            "content": "The risk management plan defines the process",
            "metadata": {"page": 1},
            "type": "text"
        }
    ]
    
    # Index chunks
    indexer = IndexingService()
    await indexer.index_document_chunks(
        chunks=chunks,
        document_id="test-doc",
        org_id="test-org"
    )
    
    # Wait for indexing
    await asyncio.sleep(2)
    
    # Search for evidence
    extractor = EvidenceExtractor()
    requirement = {
        "id": "TEST-1",
        "text": "risk management plan",
        "evaluation_hints": ["plan", "process"]
    }
    
    evidence = await extractor.extract_evidence(
        requirement=requirement,
        document_id="test-doc",
        org_id="test-org"
    )
    
    assert evidence["artifacts"]
    assert any("risk management plan" in a["content"].lower() 
              for a in evidence["artifacts"])
```

---

## Phase 6: Deployment & Monitoring (Week 6)
**Goal:** Deploy to production and set up monitoring

### Day 26-27: Deployment Configuration

#### 6.1 Azure Resources Deployment
```yaml
# infrastructure/azure-deploy.yml
name: Deploy Azure Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'infrastructure/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Azure Login
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}
    
    - name: Deploy ARM Template
      uses: azure/arm-deploy@v1
      with:
        resourceGroupName: iso14971-compliance-rg
        template: ./infrastructure/main.bicep
        parameters: >
          storageAccountName=iso14971docs
          searchServiceName=iso14971search
          openAiServiceName=iso14971openai
          functionAppName=iso14971functions
```

#### 6.2 Function App Deployment
```json
// host.json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20
      }
    }
  },
  "extensions": {
    "durableTask": {
      "maxConcurrentActivityFunctions": 10,
      "maxConcurrentOrchestratorFunctions": 5
    }
  },
  "functionTimeout": "00:10:00"
}
```

### Day 28: Monitoring Setup

#### 6.3 Application Insights
```python
# monitoring/metrics.py
from applicationinsights import TelemetryClient
from typing import Dict, Any
import time

class MetricsCollector:
    def __init__(self):
        self.telemetry = TelemetryClient(
            instrumentation_key=Config.APP_INSIGHTS_KEY
        )
    
    def track_document_processing(
        self,
        document_id: str,
        duration_seconds: float,
        status: str,
        page_count: int
    ):
        """Track document processing metrics"""
        
        self.telemetry.track_event(
            "DocumentProcessed",
            properties={
                "document_id": document_id,
                "status": status,
                "page_count": str(page_count)
            },
            measurements={
                "duration_seconds": duration_seconds,
                "pages_per_second": page_count / duration_seconds if duration_seconds > 0 else 0
            }
        )
    
    def track_evaluation_metrics(
        self,
        document_id: str,
        total_requirements: int,
        passed: int,
        failed: int,
        needs_attention: int
    ):
        """Track evaluation results"""
        
        compliance_rate = (passed / total_requirements * 100) if total_requirements > 0 else 0
        
        self.telemetry.track_metric("compliance_rate", compliance_rate)
        self.telemetry.track_metric("requirements_evaluated", total_requirements)
        
        self.telemetry.track_event(
            "EvaluationCompleted",
            properties={
                "document_id": document_id
            },
            measurements={
                "total_requirements": total_requirements,
                "passed": passed,
                "failed": failed,
                "needs_attention": needs_attention,
                "compliance_rate": compliance_rate
            }
        )
    
    def track_api_request(
        self,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: float
    ):
        """Track API request metrics"""
        
        self.telemetry.track_request(
            name=f"{method} {endpoint}",
            url=endpoint,
            success=200 <= status_code < 400,
            duration=duration_ms,
            response_code=str(status_code)
        )
    
    def track_llm_usage(
        self,
        model: str,
        tokens_used: int,
        cost_usd: float,
        latency_ms: float
    ):
        """Track LLM usage and costs"""
        
        self.telemetry.track_metric("llm_tokens", tokens_used)
        self.telemetry.track_metric("llm_cost_usd", cost_usd)
        self.telemetry.track_metric("llm_latency_ms", latency_ms)
        
        self.telemetry.track_event(
            "LLMCall",
            properties={"model": model},
            measurements={
                "tokens": tokens_used,
                "cost_usd": cost_usd,
                "latency_ms": latency_ms
            }
        )
```

### Day 29-30: Final Testing & Documentation

#### 6.4 Load Testing
```python
# tests/test_load.py
import asyncio
import aiohttp
import time
from typing import List

async def upload_document(session: aiohttp.ClientSession, file_path: str):
    """Upload a single document"""
    
    with open(file_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('file',
                      f,
                      filename='test.pdf',
                      content_type='application/pdf')
        
        async with session.post(
            'http://localhost:8000/api/v1/documents/upload',
            data=data,
            headers={'Authorization': 'Bearer test-token'}
        ) as response:
            return await response.json()

async def load_test(num_documents: int = 10):
    """Run load test with concurrent uploads"""
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        
        start_time = time.time()
        
        for i in range(num_documents):
            task = upload_document(session, 'tests/fixtures/sample.pdf')
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        duration = time.time() - start_time
        
        successful = [r for r in results if not isinstance(r, Exception)]
        failed = [r for r in results if isinstance(r, Exception)]
        
        print(f"Load Test Results:")
        print(f"  Total: {num_documents}")
        print(f"  Successful: {len(successful)}")
        print(f"  Failed: {len(failed)}")
        print(f"  Duration: {duration:.2f}s")
        print(f"  Rate: {len(successful)/duration:.2f} docs/sec")
        
        return results

if __name__ == "__main__":
    asyncio.run(load_test(10))
```

---

## Delivery Checklist

### Week 1 Deliverables
- [ ] Azure resources provisioned
- [ ] Blob storage configured with Event Grid
- [ ] Supabase schema deployed
- [ ] Basic document upload working

### Week 2 Deliverables
- [ ] Document Intelligence extraction working
- [ ] Smart chunking implemented
- [ ] Tables preserved as atomic units

### Week 3 Deliverables
- [ ] Azure AI Search index created
- [ ] Embedding service operational
- [ ] Document indexing working
- [ ] Search retrieval tested

### Week 4 Deliverables
- [ ] Evidence extraction working
- [ ] LLM evaluation implemented
- [ ] Confidence metrics calculated
- [ ] Gap analysis generated

### Week 5 Deliverables
- [ ] Durable Functions orchestration deployed
- [ ] REST API endpoints working
- [ ] End-to-end pipeline tested
- [ ] Reports generating correctly

### Week 6 Deliverables
- [ ] Production deployment complete
- [ ] Monitoring configured
- [ ] Load testing passed
- [ ] Documentation complete

---

## Support & Troubleshooting

### Common Issues

1. **Document Intelligence Timeout**
   - Solution: Implement retry logic with exponential backoff
   - Consider breaking large documents into smaller pieces

2. **Search Index Not Returning Results**
   - Check index schema matches document structure
   - Verify embeddings are being generated correctly
   - Check filters aren't too restrictive

3. **LLM Rate Limiting**
   - Implement request queuing
   - Use exponential backoff
   - Consider multiple deployment regions

4. **High Costs**
   - Cache document understanding results
   - Use GPT-4o-mini for verification
   - Batch embedding operations

### Performance Optimization

1. **Parallel Processing**
   - Process requirements in parallel
   - Use fan-out/fan-in pattern
   - Optimize chunk size for embedding batches

2. **Caching Strategy**
   - Cache document structure (24 hours)
   - Cache embeddings permanently
   - Cache LLM evaluations by requirement + document hash

3. **Search Optimization**
   - Use filters aggressively
   - Limit result set size
   - Pre-filter by document_id and org_id

---

This implementation plan provides your developer with:
1. **Day-by-day tasks** with clear objectives
2. **Complete code examples** that can be copied and modified
3. **Testing strategies** at each phase
4. **Configuration files** ready to use
5. **Troubleshooting guide** for common issues

The modular approach allows for incremental development and testing, reducing risk and ensuring each component works before moving to the next phase.