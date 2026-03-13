#!/usr/bin/env python3
"""
Document Summarizer Service

Generates summaries of supporting documents for multi-document evaluations.
Uses OpenAI for fast, cost-effective summarization (model configurable via OPENAI_SUMMARY_MODEL).
These summaries are injected into the evaluation context so the agent
is aware of available supporting documentation.
"""

import asyncio
import hashlib
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

logger = logging.getLogger(__name__)

# Initialize OpenAI client
_openai_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """Get or create OpenAI client singleton."""
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client


DOCUMENT_SUMMARY_SYSTEM_PROMPT = """You are a regulatory document analyst preparing context summaries for compliance evaluations. Your task is to create a structured summary that captures the essential information from a supporting document.

The summary will be used by an evaluator to understand what evidence/context is available in supporting documents without reading the full content initially.

Create a summary following this structure:

DOCUMENT TYPE: [Identify the type - SOP, Work Instruction, Form, Template, Policy, Record, etc.]
DOCUMENT ID: [Document number/reference if visible, otherwise "Not specified"]
REVISION: [Version/revision if visible, otherwise "Not specified"]

PURPOSE:
[1-2 sentences describing what this document covers and its intended use]

KEY SECTIONS:
- [Section name]: [Brief description of what it covers]
- [Section name]: [Brief description]
[List the main sections/headings with brief descriptions]

IMPORTANT CONTENT:
- [Key point 1]
- [Key point 2]
[List important procedures, definitions, criteria, or requirements - focus on items that could serve as evidence for compliance evaluations]

CROSS-REFERENCES:
- [Referenced document/form/record]
[List any other documents, forms, or records mentioned that this document references]

COMPLIANCE-RELEVANT DETAILS:
- [Detail relevant to risk management, quality, or regulatory compliance]
[List any specific items related to: risk management activities, record-keeping requirements, review/approval processes, training requirements, verification/validation activities]

Keep the entire summary under 800 words. Focus on factual content that would help an evaluator determine if requirements are being met."""


async def summarize_document(
    file_path: Path,
    file_name: str,
    model: str = None
) -> Dict[str, Any]:
    """
    Generate a summary for a single supporting document.

    Args:
        file_path: Path to the PDF file
        file_name: Original filename for reference
        model: OpenAI model to use for summarization

    Returns:
        Dict with summary_text, tokens_used, model, and generated_at
    """
    try:
        client = get_openai_client()

        resolved_model = model or os.getenv("OPENAI_SUMMARY_MODEL", "gpt-5-mini")
        logger.info(f"Summarizing document: {file_name} with model {resolved_model}")

        # Upload the file to OpenAI for processing
        with open(file_path, "rb") as f:
            file_obj = client.files.create(file=f, purpose="assistants")

        try:
            with open(file_path, "rb") as f:
                import base64
                file_content = base64.standard_b64encode(f.read()).decode("utf-8")

            response = client.chat.completions.create(
                model=resolved_model,
                messages=[
                    {"role": "system", "content": DOCUMENT_SUMMARY_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Please summarize this document ({file_name}) following the structured format in your instructions."
                            },
                            {
                                "type": "file",
                                "file": {
                                    "filename": file_name,
                                    "file_data": f"data:application/pdf;base64,{file_content}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.3,
                max_tokens=1500
            )

            summary_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0

            logger.info(f"Summary generated for {file_name}: {tokens_used} tokens used")

            return {
                "summary_text": summary_text,
                "tokens_used": tokens_used,
                "model": resolved_model,
                "generated_at": datetime.utcnow().isoformat()
            }

        finally:
            # Clean up the uploaded file
            try:
                client.files.delete(file_obj.id)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {file_obj.id}: {e}")

    except Exception as e:
        logger.error(f"Failed to summarize document {file_name}: {e}")
        raise


async def summarize_document_from_bytes(
    file_bytes: bytes,
    file_name: str,
    model: str = None
) -> Dict[str, Any]:
    """
    Generate a summary for a document from bytes.

    Args:
        file_bytes: PDF file content as bytes
        file_name: Original filename for reference
        model: OpenAI model to use for summarization

    Returns:
        Dict with summary_text, tokens_used, model, and generated_at
    """
    try:
        import base64

        client = get_openai_client()
        resolved_model = model or os.getenv("OPENAI_SUMMARY_MODEL", "gpt-5-mini")
        logger.info(f"Summarizing document from bytes: {file_name} with model {resolved_model}")

        file_content = base64.standard_b64encode(file_bytes).decode("utf-8")

        response = client.chat.completions.create(
            model=resolved_model,
            messages=[
                {"role": "system", "content": DOCUMENT_SUMMARY_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Please summarize this document ({file_name}) following the structured format in your instructions."
                        },
                        {
                            "type": "file",
                            "file": {
                                "filename": file_name,
                                "file_data": f"data:application/pdf;base64,{file_content}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.3,
            max_tokens=1500
        )

        summary_text = response.choices[0].message.content
        tokens_used = response.usage.total_tokens if response.usage else 0

        logger.info(f"Summary generated for {file_name}: {tokens_used} tokens used")

        return {
            "summary_text": summary_text,
            "tokens_used": tokens_used,
            "model": resolved_model,
            "generated_at": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to summarize document {file_name}: {e}")
        raise


async def summarize_all_supporting_docs(
    documents: List[Dict[str, Any]],
    supabase_client,
    evaluation_id: str,
    max_concurrent: int = 3
) -> List[Dict[str, Any]]:
    """
    Generate summaries for all supporting documents in parallel.

    Args:
        documents: List of document dicts with 'id', 'file_name', 'storage_path'
        supabase_client: Supabase client for storage access and DB updates
        evaluation_id: The evaluation ID for status updates
        max_concurrent: Maximum concurrent summarization requests

    Returns:
        List of results with document_id, success status, and summary data
    """
    if not documents:
        logger.info("No supporting documents to summarize")
        return []

    logger.info(f"Summarizing {len(documents)} supporting documents for evaluation {evaluation_id}")

    # Update status to generating
    try:
        supabase_client.table("document_evaluations").update({
            "summaries_status": "generating"
        }).eq("id", evaluation_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update summaries_status: {e}")

    results = []
    semaphore = asyncio.Semaphore(max_concurrent)

    async def summarize_one(doc: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            doc_id = doc["id"]
            file_name = doc["file_name"]
            storage_path = doc["storage_path"]

            try:
                # Download file from Supabase Storage
                # The storage_path format: documents/evaluations/{eval_id}/supporting/{filename}
                bucket_name = "documents"
                file_path_in_bucket = storage_path.replace(f"{bucket_name}/", "", 1)

                response = supabase_client.storage.from_(bucket_name).download(file_path_in_bucket)
                file_bytes = response

                # Generate summary
                summary_result = await summarize_document_from_bytes(
                    file_bytes=file_bytes,
                    file_name=file_name
                )

                # Update the evaluation_documents record with summary
                supabase_client.table("evaluation_documents").update({
                    "summary_text": summary_result["summary_text"],
                    "summary_generated_at": summary_result["generated_at"],
                    "summary_model": summary_result["model"],
                    "summary_tokens_used": summary_result["tokens_used"]
                }).eq("id", doc_id).execute()

                return {
                    "document_id": doc_id,
                    "file_name": file_name,
                    "success": True,
                    "summary_text": summary_result["summary_text"],
                    "tokens_used": summary_result["tokens_used"]
                }

            except Exception as e:
                logger.error(f"Failed to summarize {file_name}: {e}")
                return {
                    "document_id": doc_id,
                    "file_name": file_name,
                    "success": False,
                    "error": str(e)
                }

    # Run all summarizations concurrently
    tasks = [summarize_one(doc) for doc in documents]
    results = await asyncio.gather(*tasks)

    # Update evaluation status
    all_success = all(r["success"] for r in results)
    try:
        supabase_client.table("document_evaluations").update({
            "summaries_status": "completed" if all_success else "failed"
        }).eq("id", evaluation_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update final summaries_status: {e}")

    success_count = sum(1 for r in results if r["success"])
    logger.info(f"Summarization complete: {success_count}/{len(documents)} successful")

    return results


def compute_file_hash(file_bytes: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(file_bytes).hexdigest()


async def get_document_summaries_for_evaluation(
    supabase_client,
    evaluation_id: str
) -> List[Dict[str, Any]]:
    """
    Retrieve all supporting document summaries for an evaluation.

    Args:
        supabase_client: Supabase client
        evaluation_id: The evaluation ID

    Returns:
        List of dicts with file_name, summary_text, and document metadata
    """
    try:
        response = supabase_client.table("evaluation_documents").select(
            "id, file_name, summary_text, summary_generated_at, display_order"
        ).eq("evaluation_id", evaluation_id).eq(
            "document_role", "supporting"
        ).order("display_order").execute()

        return response.data or []

    except Exception as e:
        logger.error(f"Failed to get document summaries for {evaluation_id}: {e}")
        return []


def format_summaries_for_context(summaries: List[Dict[str, Any]]) -> str:
    """
    Format document summaries for injection into the evaluation context.

    Args:
        summaries: List of summary dicts from get_document_summaries_for_evaluation

    Returns:
        Formatted string to include in the system/user prompt
    """
    if not summaries:
        return ""

    sections = []
    for summary in summaries:
        file_name = summary.get("file_name", "Unknown")
        summary_text = summary.get("summary_text", "Summary not available")

        sections.append(f"""=== SUPPORTING DOCUMENT: {file_name} ===
{summary_text}
""")

    header = f"""
SUPPORTING DOCUMENTATION CONTEXT
================================
The following {len(summaries)} supporting document(s) have been provided as evidence context.
Review these summaries to understand what additional documentation is available.
If you need specific details from any supporting document that are not in the summary,
you can request the full content using the request_document_content function.

"""

    return header + "\n".join(sections)
