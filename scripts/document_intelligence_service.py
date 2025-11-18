#!/usr/bin/env python3
"""
Azure Document Intelligence Service
Extracts markdown content from uploaded documents using Azure AI Document Intelligence
"""

import os
import logging
import re
from typing import List, Optional, Dict
from dataclasses import dataclass
from pathlib import Path

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest, DocumentContentFormat
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv
from bs4 import BeautifulSoup, Comment

# Load environment variables from project root
root_dir = Path(__file__).parent.parent
env_file = root_dir / ".env"
load_dotenv(env_file)

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
    DEFAULT_OUTPUT_FORMAT = DocumentContentFormat.MARKDOWN
    TABLE_PATTERN = re.compile(r"<table.*?>.*?</table>", re.IGNORECASE | re.DOTALL)

    def __init__(self, config: Optional[DocumentIntelligenceConfig] = None):
        self.config = config or DocumentIntelligenceConfig()
        
        if not self.config.endpoint or not self.config.key:
            raise ValueError("Azure Document Intelligence endpoint and key must be configured")
        
        self.client = DocumentIntelligenceClient(
            endpoint=self.config.endpoint,
            credential=AzureKeyCredential(self.config.key)
        )
    
    async def extract_markdown_from_url(
        self,
        document_url: str,
        *,
        output_format: str = "markdown",
        sanitize: bool = True,
        convert_tables: bool = True,
        strip_comments: bool = True
    ) -> Dict:
        """
        Extract markdown content from a document URL
        
        Args:
            document_url: URL of the document to process
            
        Returns:
            Dictionary containing markdown content and metadata
        """
        try:
            logger.info(f"Starting document analysis for URL: {document_url}")

            content_format = self._resolve_content_format(output_format)

            # Start the analysis
            poller = self.client.begin_analyze_document(
                "prebuilt-layout",
                AnalyzeDocumentRequest(url_source=document_url),
                output_content_format=content_format
            )
            
            # Wait for completion
            result = poller.result()
            
            # Extract markdown content
            markdown_content = result.content or ""

            sanitized_applied = False

            if sanitize and content_format == DocumentContentFormat.MARKDOWN:
                markdown_content = self._sanitize_markdown_content(
                    markdown_content,
                    convert_tables=convert_tables,
                    strip_comments=strip_comments
                )
                sanitized_applied = True

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
                    'content_format': content_format.value,
                    'post_processing': {
                        'sanitized': sanitized_applied,
                        'tables_converted': bool(convert_tables and sanitized_applied),
                        'comments_stripped': bool(strip_comments and sanitized_applied)
                    }
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
    
    async def extract_markdown_from_bytes(
        self,
        document_bytes: bytes,
        filename: str = "document",
        *,
        output_format: str = "markdown",
        sanitize: bool = True,
        convert_tables: bool = True,
        strip_comments: bool = True
    ) -> Dict:
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

            content_format = self._resolve_content_format(output_format)

            # Start the analysis
            poller = self.client.begin_analyze_document(
                "prebuilt-layout",
                AnalyzeDocumentRequest(bytes_source=document_bytes),
                output_content_format=content_format
            )
            
            # Wait for completion
            result = poller.result()
            
            # Extract markdown content
            markdown_content = result.content or ""

            sanitized_applied = False

            if sanitize and content_format == DocumentContentFormat.MARKDOWN:
                markdown_content = self._sanitize_markdown_content(
                    markdown_content,
                    convert_tables=convert_tables,
                    strip_comments=strip_comments
                )
                sanitized_applied = True

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
                    'content_format': content_format.value,
                    'filename': filename,
                    'post_processing': {
                        'sanitized': sanitized_applied,
                        'tables_converted': bool(convert_tables and sanitized_applied),
                        'comments_stripped': bool(strip_comments and sanitized_applied)
                    }
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
        filename: str = "document",
        *,
        output_format: str = "markdown",
        sanitize: bool = True,
        convert_tables: bool = True,
        strip_comments: bool = True
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
            result = await self.extract_markdown_from_url(
                document_url,
                output_format=output_format,
                sanitize=sanitize,
                convert_tables=convert_tables,
                strip_comments=strip_comments
            )
        elif document_bytes:
            result = await self.extract_markdown_from_bytes(
                document_bytes,
                filename,
                output_format=output_format,
                sanitize=sanitize,
                convert_tables=convert_tables,
                strip_comments=strip_comments
            )
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


    def _resolve_content_format(self, output_format: Optional[str]) -> DocumentContentFormat:
        """Map string format to DocumentContentFormat enum"""
        if not output_format:
            return self.DEFAULT_OUTPUT_FORMAT
        normalized = output_format.lower().strip()
        if normalized == 'text':
            return DocumentContentFormat.TEXT
        return DocumentContentFormat.MARKDOWN

    def _sanitize_markdown_content(
        self,
        markdown_content: str,
        *,
        convert_tables: bool = True,
        strip_comments: bool = True
    ) -> str:
        """Clean markdown content by removing HTML comments and converting tables"""
        cleaned = markdown_content or ""

        if strip_comments:
            cleaned = re.sub(r'<!--.*?-->', '', cleaned, flags=re.DOTALL)

        if convert_tables:
            cleaned = self._convert_tables_to_markdown(cleaned)

        # Normalize basic HTML line breaks and headings that may appear in output
        cleaned = re.sub(r'<br\s*/?>', '\n', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'</(p|div|section|article)>', '\n', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(
            r'<h([1-6])>(.*?)</h\1>',
            lambda match: '\n' + ('#' * int(match.group(1))) + ' ' + match.group(2).strip() + '\n',
            cleaned,
            flags=re.IGNORECASE
        )

        # Remove any residual HTML tags while preserving text content
        if re.search(r'<[^>]+>', cleaned):
            soup = BeautifulSoup(cleaned, 'html.parser')
            for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
                comment.extract()
            cleaned = soup.get_text('\n')

        cleaned = cleaned.replace('\r\n', '\n')
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        return cleaned.strip()

    def _convert_tables_to_markdown(self, markdown_content: str) -> str:
        """Convert HTML table fragments to GitHub-style markdown tables"""

        def table_to_markdown(match: re.Match) -> str:
            table_html = match.group(0)
            soup = BeautifulSoup(table_html, 'html.parser')
            table = soup.find('table')
            if table is None:
                return ''

            rows: List[List[str]] = []
            for tr in table.find_all('tr'):
                cells = []
                for cell in tr.find_all(['th', 'td']):
                    # Replace line breaks inside a cell with spaces to keep tables compact
                    cell_text = cell.get_text(separator=' ').strip().replace('|', '\\|')
                    cells.append(cell_text)
                if cells:
                    rows.append(cells)

            if not rows:
                return ''

            header = rows[0]
            column_count = len(header)

            def pad(row: List[str]) -> List[str]:
                return row + [''] * (column_count - len(row))

            markdown_lines = [
                '| ' + ' | '.join(pad(header)) + ' |',
                '| ' + ' | '.join(['---'] * column_count) + ' |'
            ]

            for data_row in rows[1:]:
                markdown_lines.append('| ' + ' | '.join(pad(data_row)) + ' |')

            return '\n' + '\n'.join(markdown_lines) + '\n'

        return self.TABLE_PATTERN.sub(table_to_markdown, markdown_content)


# Convenience function for quick usage
async def extract_document_markdown(
    document_url: Optional[str] = None,
    document_bytes: Optional[bytes] = None,
    filename: str = "document",
    config: Optional[DocumentIntelligenceConfig] = None,
    *,
    output_format: str = "markdown",
    sanitize: bool = True,
    convert_tables: bool = True,
    strip_comments: bool = True
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
        filename=filename,
        output_format=output_format,
        sanitize=sanitize,
        convert_tables=convert_tables,
        strip_comments=strip_comments
    )
