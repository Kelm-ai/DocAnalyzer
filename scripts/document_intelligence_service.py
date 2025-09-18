#!/usr/bin/env python3
"""
Azure Document Intelligence Service
Extracts markdown content from uploaded documents using Azure AI Document Intelligence
"""

import os
import logging
from typing import List, Optional, Dict
from dataclasses import dataclass

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest, DocumentContentFormat
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class DocumentIntelligenceConfig:
    """Configuration for Azure Document Intelligence"""
    endpoint: str = os.getenv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')
    key: str = os.getenv('AZURE_DOCUMENT_INTELLIGENCE_KEY')
    api_version: str = os.getenv('AZURE_DOCUMENT_INTELLIGENCE_API_VERSION', '2024-11-30')


class DocumentIntelligenceService:
    """Service for extracting markdown from documents using Azure AI Document Intelligence"""
    
    def __init__(self, config: Optional[DocumentIntelligenceConfig] = None):
        self.config = config or DocumentIntelligenceConfig()
        
        if not self.config.endpoint or not self.config.key:
            raise ValueError("Azure Document Intelligence endpoint and key must be configured")
        
        self.client = DocumentIntelligenceClient(
            endpoint=self.config.endpoint,
            credential=AzureKeyCredential(self.config.key)
        )
    
    async def extract_markdown_from_url(self, document_url: str) -> Dict:
        """
        Extract markdown content from a document URL
        
        Args:
            document_url: URL of the document to process
            
        Returns:
            Dictionary containing markdown content and metadata
        """
        try:
            logger.info(f"Starting document analysis for URL: {document_url}")
            
            # Start the analysis
            poller = self.client.begin_analyze_document(
                "prebuilt-layout",
                AnalyzeDocumentRequest(url_source=document_url),
                output_content_format=DocumentContentFormat.MARKDOWN
            )
            
            # Wait for completion
            result = poller.result()
            
            # Extract markdown content
            markdown_content = result.content
            
            # Split into pages if needed (service inserts PageBreak markers)
            pages = [p.strip() for p in markdown_content.split("<!-- PageBreak -->")] if markdown_content else []
            
            # Prepare response
            response = {
                'success': True,
                'markdown_content': markdown_content,
                'pages': pages,
                'page_count': len(pages),
                'metadata': {
                    'model_id': result.model_id,
                    'api_version': self.config.api_version,
                    'content_format': 'markdown'
                }
            }
            
            logger.info(f"Successfully extracted markdown from document. Pages: {len(pages)}")
            return response
            
        except Exception as e:
            logger.error(f"Error extracting markdown from URL {document_url}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'markdown_content': None,
                'pages': [],
                'page_count': 0
            }
    
    async def extract_markdown_from_bytes(self, document_bytes: bytes, filename: str = "document") -> Dict:
        """
        Extract markdown content from document bytes
        
        Args:
            document_bytes: Binary content of the document
            filename: Optional filename for logging
            
        Returns:
            Dictionary containing markdown content and metadata
        """
        try:
            logger.info(f"Starting document analysis for file: {filename}")
            
            # Start the analysis
            poller = self.client.begin_analyze_document(
                "prebuilt-layout",
                AnalyzeDocumentRequest(bytes_source=document_bytes),
                output_content_format=DocumentContentFormat.MARKDOWN
            )
            
            # Wait for completion
            result = poller.result()
            
            # Extract markdown content
            markdown_content = result.content
            
            # Split into pages if needed (service inserts PageBreak markers)
            pages = [p.strip() for p in markdown_content.split("<!-- PageBreak -->")] if markdown_content else []
            
            # Prepare response
            response = {
                'success': True,
                'markdown_content': markdown_content,
                'pages': pages,
                'page_count': len(pages),
                'metadata': {
                    'model_id': result.model_id,
                    'api_version': self.config.api_version,
                    'content_format': 'markdown',
                    'filename': filename
                }
            }
            
            logger.info(f"Successfully extracted markdown from {filename}. Pages: {len(pages)}")
            return response
            
        except Exception as e:
            logger.error(f"Error extracting markdown from {filename}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'markdown_content': None,
                'pages': [],
                'page_count': 0
            }
    
    async def extract_markdown_with_page_splitting(
        self, 
        document_url: Optional[str] = None, 
        document_bytes: Optional[bytes] = None,
        filename: str = "document"
    ) -> Dict:
        """
        Extract markdown and return both full content and individual pages
        
        Args:
            document_url: URL of document (if using URL source)
            document_bytes: Bytes of document (if using bytes source)
            filename: Filename for logging
            
        Returns:
            Dictionary with full markdown and individual pages
        """
        if document_url:
            result = await self.extract_markdown_from_url(document_url)
        elif document_bytes:
            result = await self.extract_markdown_from_bytes(document_bytes, filename)
        else:
            return {
                'success': False,
                'error': 'Either document_url or document_bytes must be provided',
                'markdown_content': None,
                'pages': [],
                'page_count': 0
            }
        
        return result
    
    def validate_configuration(self) -> bool:
        """
        Validate that the service is properly configured
        
        Returns:
            True if configuration is valid, False otherwise
        """
        try:
            if not self.config.endpoint:
                logger.error("Azure Document Intelligence endpoint not configured")
                return False
            
            if not self.config.key:
                logger.error("Azure Document Intelligence key not configured")
                return False
            
            # Test connection (this will raise an exception if credentials are invalid)
            # We don't actually call the service here, just validate the client can be created
            test_client = DocumentIntelligenceClient(
                endpoint=self.config.endpoint,
                credential=AzureKeyCredential(self.config.key)
            )
            
            logger.info("Document Intelligence service configuration validated successfully")
            return True
            
        except Exception as e:
            logger.error(f"Document Intelligence service configuration validation failed: {str(e)}")
            return False


# Convenience function for quick usage
async def extract_document_markdown(
    document_url: Optional[str] = None,
    document_bytes: Optional[bytes] = None,
    filename: str = "document",
    config: Optional[DocumentIntelligenceConfig] = None
) -> Dict:
    """
    Convenience function to extract markdown from a document
    
    Args:
        document_url: URL of document to process
        document_bytes: Bytes of document to process  
        filename: Filename for logging
        config: Optional custom configuration
        
    Returns:
        Dictionary containing markdown content and metadata
    """
    service = DocumentIntelligenceService(config)
    return await service.extract_markdown_with_page_splitting(
        document_url=document_url,
        document_bytes=document_bytes,
        filename=filename
    )