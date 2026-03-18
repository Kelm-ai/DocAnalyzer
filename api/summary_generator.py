#!/usr/bin/env python3
"""
Executive Summary Generator

Generates an LLM-powered executive summary from evaluation results.
Uses OpenAI for fast, cost-effective summarization (model configurable via OPENAI_SUMMARY_MODEL).
"""

import json
import logging
import os
from datetime import datetime
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


SUMMARY_SYSTEM_PROMPT = """You are an expert regulatory compliance analyst specializing in ISO 14971 medical device risk management. Your task is to generate a concise executive summary from document evaluation results.

Rules:
1. The overview MUST be exactly 3 sentences: (1) Overall assessment, (2) Key areas of concern or strength, (3) Recommended next steps.
2. Only include findings that exist in the provided data - never invent or assume findings.
3. Critical gaps come from FAIL or FLAGGED requirements only.
4. Opportunities for improvement come from PASS requirements that have gaps noted.
5. Order all items by clause number (e.g., 4.1 before 4.2 before 5.1).
6. Keep findings and recommendations concise - one sentence each maximum."""


def _build_summary_prompt(
    document_name: str,
    requirements_results: List[Dict[str, Any]],
    overall_score: float
) -> str:
    """Build the user prompt with evaluation data."""

    # Format requirements for the prompt
    requirements_text = []
    for req in requirements_results:
        clause = req.get('requirement_clause') or req.get('clause', 'Unknown')
        title = req.get('title', 'Unknown')
        status = req.get('status', 'Unknown')
        gaps = req.get('gaps_identified') or req.get('gaps', [])
        recommendations = req.get('recommendations', [])

        req_lines = [
            f"Clause {clause}: {title}",
            f"  Status: {status}",
        ]
        if gaps:
            req_lines.append(f"  Gaps: {'; '.join(gaps[:3])}")  # Limit to first 3
        if recommendations:
            req_lines.append(f"  Recommendations: {'; '.join(recommendations[:3])}")

        requirements_text.append('\n'.join(req_lines))

    return f"""Document: {document_name}
Overall Compliance Score: {overall_score:.1f}%

EVALUATION RESULTS:
{chr(10).join(requirements_text)}

Generate a JSON response with this exact structure:
{{
  "overview": "Three sentence executive summary as described.",
  "critical_gaps": [
    {{"clause": "4.1", "title": "Requirement title", "finding": "The specific gap", "recommendation": "How to address it"}}
  ],
  "opportunities_for_improvement": [
    {{"clause": "4.2", "title": "Requirement title", "finding": "The OFI", "recommendation": "How to improve"}}
  ]
}}

Include critical_gaps only from FAIL/FLAGGED requirements.
Include opportunities_for_improvement only from PASS requirements that have gaps.
If there are no items for a category, use an empty array [].
Order items by clause number."""


async def generate_executive_summary(
    document_name: str,
    requirements_results: List[Dict[str, Any]],
    overall_score: float
) -> Optional[Dict[str, Any]]:
    """
    Generate an executive summary using OpenAI.

    Args:
        document_name: Name of the evaluated document
        requirements_results: List of requirement evaluation results
        overall_score: Overall compliance score (0-100)

    Returns:
        Executive summary dict or None if generation fails
    """
    try:
        client = get_openai_client()

        user_prompt = _build_summary_prompt(
            document_name=document_name,
            requirements_results=requirements_results,
            overall_score=overall_score
        )

        logger.info(f"Generating executive summary for {document_name}")

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_SUMMARY_MODEL", "gpt-5-mini"),
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=2000
        )

        content = response.choices[0].message.content
        if not content:
            logger.error("Empty response from OpenAI")
            return None

        summary = json.loads(content)

        # Add metadata
        summary["generated_at"] = datetime.utcnow().isoformat()

        # Validate structure
        if "overview" not in summary:
            logger.error("Missing 'overview' in summary response")
            return None

        # Ensure arrays exist
        if "critical_gaps" not in summary:
            summary["critical_gaps"] = []
        if "opportunities_for_improvement" not in summary:
            summary["opportunities_for_improvement"] = []

        logger.info(
            f"Executive summary generated: {len(summary.get('critical_gaps', []))} gaps, "
            f"{len(summary.get('opportunities_for_improvement', []))} OFIs"
        )

        return summary

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse summary JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to generate executive summary: {e}")
        return None


def generate_executive_summary_sync(
    document_name: str,
    requirements_results: List[Dict[str, Any]],
    overall_score: float
) -> Optional[Dict[str, Any]]:
    """
    Synchronous wrapper for generate_executive_summary.
    Use this when calling from non-async context.
    """
    import asyncio

    coroutine = generate_executive_summary(document_name, requirements_results, overall_score)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        try:
            return asyncio.run(coroutine)
        except Exception as e:
            logger.error(f"Sync wrapper failed: {e}")
            return None

    try:
        # If we're already in an async context, run the coroutine in a worker thread.
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coroutine)
            return future.result()
    except Exception as e:
        logger.error(f"Sync wrapper failed: {e}")
        return None
