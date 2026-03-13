#!/usr/bin/env python3
"""
Requirement presentation generator

Creates claim-based requirement presentation data for Results V2.
This is a second-pass synthesis layer that keeps the raw evaluator output intact
and uses a provider-neutral contract. The first implementation uses OpenAI
direct PDF input plus structured outputs.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

PRESENTATION_VERSION = "openai-structured-v1"
CLAIM_KINDS = {"assessment", "supporting", "gap", "verification", "ofi"}


class CitationPill(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str
    location: str
    excerpt: str
    provider: Optional[str] = None
    file_id: Optional[str] = None
    page_number: Optional[int] = None
    section_title: Optional[str] = None


class ClaimItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    kind: Literal["assessment", "supporting", "gap", "verification", "ofi"]
    citations: List[CitationPill] = Field(default_factory=list)


class AnalysisBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str
    body: str
    citations: List[CitationPill] = Field(default_factory=list)


class RequirementPresentationSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    confidence_level: Literal["low", "medium", "high"]
    inline_claims: List[ClaimItem] = Field(default_factory=list)
    modal_claims: List[ClaimItem] = Field(default_factory=list)
    full_analysis: List[AnalysisBlock] = Field(default_factory=list)
    generated_at: str
    presentation_version: str = PRESENTATION_VERSION


class _StructuredCitation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    supporting_quote: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    supported_claim: Optional[str] = None
    label: Optional[str] = None


class _StructuredClaim(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    kind: Literal["assessment", "supporting", "gap", "verification", "ofi"]
    citations: List[_StructuredCitation] = Field(default_factory=list)


class _StructuredAnalysisBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str
    body: str
    citations: List[_StructuredCitation] = Field(default_factory=list)


class _StructuredPresentationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    inline_claims: List[_StructuredClaim] = Field(default_factory=list)
    modal_claims: List[_StructuredClaim] = Field(default_factory=list)
    full_analysis: List[_StructuredAnalysisBlock] = Field(default_factory=list)


PRESENTATION_SYSTEM_PROMPT = """You create claim-based compliance review content from raw requirement evaluation output.

Rules:
1. Use only the supplied requirement data and attached PDF. Never invent support, gaps, or citations.
2. Write claim-first reviewer-facing statements. Do not lead with raw quotes or page references.
3. Inline claims should be short and scannable. They should communicate the gist of what is present, missing, or uncertain.
4. Modal claims can be slightly fuller than inline claims but should still be concise.
5. full_analysis should explain the reasoning in short prose blocks, not raw evidence dumps.
6. Distinguish FAIL from FLAGGED:
   - FAIL means the requirement is not adequately met.
   - FLAGGED means evidence is incomplete, indirect, or needs human verification.
7. PASS may include optional opportunities for improvement, but do not turn PASS into a failure.
8. No recommendations. No remediation instructions.
9. Every citation must be directly supported by the attached PDF.
10. If a claim has no direct support in the PDF, return an empty citations array for that claim.
11. Keep output compact:
   - inline claims: 1-2 sentences total across all inline claims
   - modal claims: one sentence each
   - full analysis blocks: maximum 2 sentences each
   - citations: maximum 1 per claim or analysis block
"""


def _normalize_status(value: Any) -> str:
    status = str(value or "").strip().upper()
    if status == "PARTIAL":
        return "FLAGGED"
    if status == "FAILED":
        return "FAIL"
    if status in {"PASS", "FAIL", "FLAGGED", "NOT_APPLICABLE", "ERROR"}:
        return status
    return "ERROR"


def _normalize_confidence(value: Any) -> Literal["low", "medium", "high"]:
    confidence = str(value or "").strip().lower()
    if confidence in {"low", "medium", "high"}:
        return confidence  # type: ignore[return-value]
    return "low"


def _truncate_items(items: Iterable[str], limit: int) -> List[str]:
    output: List[str] = []
    for item in items:
        value = str(item).strip()
        if not value:
            continue
        output.append(value)
        if len(output) >= limit:
            break
    return output


def _fallback_rationale(status: str) -> str:
    if status == "PASS":
        return "This requirement is adequately addressed in the reviewed documentation."
    if status == "FAIL":
        return "The reviewed documentation does not adequately address this requirement."
    if status == "FLAGGED":
        return "The evidence is incomplete or ambiguous and needs human verification."
    if status == "NOT_APPLICABLE":
        return "This requirement was marked not applicable for this evaluation."
    return "This requirement could not be evaluated successfully."


def _strip_source_prefix(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^\[[^\]]+\]\s*", "", cleaned)
    cleaned = cleaned.strip().strip('"').strip("'").strip()
    return re.sub(r"\s+", " ", cleaned)


def _truncate_sentence(text: str, limit: int = 220) -> str:
    cleaned = _strip_source_prefix(text)
    if len(cleaned) <= limit:
        return cleaned
    truncated = cleaned[: limit - 1].rstrip()
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return f"{truncated}..."


def _first_sentence(text: str, limit: int = 220) -> str:
    cleaned = _strip_source_prefix(text)
    if not cleaned:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return _truncate_sentence(parts[0] if parts else cleaned, limit)


def _default_presentation(requirement: Dict[str, Any]) -> RequirementPresentationSummary:
    status = _normalize_status(requirement.get("status"))
    confidence = _normalize_confidence(requirement.get("confidence", requirement.get("confidence_level")))
    rationale = str(requirement.get("rationale") or requirement.get("evaluation_rationale") or "").strip()
    evidence = _truncate_items(requirement.get("evidence") or requirement.get("evidence_snippets") or [], 2)
    gaps = _truncate_items(requirement.get("gaps") or requirement.get("gaps_identified") or [], 2)

    inline_claims: List[ClaimItem] = []
    modal_claims: List[ClaimItem] = []
    full_analysis: List[AnalysisBlock] = []

    assessment_text = _first_sentence(rationale or _fallback_rationale(status))
    evidence_text = _first_sentence(evidence[0]) if evidence else ""

    if status == "PASS":
        inline_claims.append(
            ClaimItem(
                text=assessment_text or "The requirement appears to be adequately addressed in the document.",
                kind="assessment",
                citations=[],
            )
        )
        modal_claims.append(
            ClaimItem(
                text=assessment_text or "The requirement appears to be adequately addressed in the document.",
                kind="assessment",
                citations=[],
            )
        )
        if evidence_text:
            modal_claims.append(ClaimItem(text=evidence_text, kind="supporting", citations=[]))
        for gap in gaps[:1]:
            claim_text = _first_sentence(gap)
            inline_claims.append(ClaimItem(text=claim_text, kind="ofi", citations=[]))
            modal_claims.append(ClaimItem(text=claim_text, kind="ofi", citations=[]))
    elif status == "FAIL":
        inline_claims.append(
            ClaimItem(
                text=assessment_text or "The document does not adequately satisfy this requirement.",
                kind="assessment",
                citations=[],
            )
        )
        modal_claims.append(
            ClaimItem(
                text=assessment_text or "The document does not adequately satisfy this requirement.",
                kind="assessment",
                citations=[],
            )
        )
        if evidence_text:
            modal_claims.append(ClaimItem(text=evidence_text, kind="supporting", citations=[]))
        for gap in gaps[:2]:
            claim_text = _first_sentence(gap)
            inline_claims.append(ClaimItem(text=claim_text, kind="gap", citations=[]))
            modal_claims.append(ClaimItem(text=claim_text, kind="gap", citations=[]))
    elif status == "FLAGGED":
        inline_claims.append(
            ClaimItem(
                text=assessment_text or "This requirement still needs human verification.",
                kind="assessment",
                citations=[],
            )
        )
        modal_claims.append(
            ClaimItem(
                text=assessment_text or "This requirement still needs human verification.",
                kind="assessment",
                citations=[],
            )
        )
        if evidence_text:
            modal_claims.append(ClaimItem(text=evidence_text, kind="supporting", citations=[]))
        for gap in gaps[:2]:
            claim_text = _first_sentence(gap)
            inline_claims.append(ClaimItem(text=claim_text, kind="verification", citations=[]))
            modal_claims.append(ClaimItem(text=claim_text, kind="verification", citations=[]))
    else:
        summary_text = rationale or _fallback_rationale(status)
        clean_summary = _first_sentence(summary_text)
        inline_claims.append(ClaimItem(text=clean_summary, kind="assessment", citations=[]))
        modal_claims.append(ClaimItem(text=clean_summary, kind="assessment", citations=[]))

    if rationale:
        full_analysis.append(
            AnalysisBlock(label="Assessment summary", body=_truncate_sentence(rationale, 320), citations=[])
        )
    if evidence:
        full_analysis.append(
            AnalysisBlock(
                label="Evidence analysis",
                body=" ".join(_truncate_sentence(item, 180) for item in evidence[:2]),
                citations=[],
            )
        )
    if gaps:
        full_analysis.append(
            AnalysisBlock(
                label="Opportunity analysis" if status == "PASS" else "Gap analysis",
                body=" ".join(_truncate_sentence(item, 180) for item in gaps[:2]),
                citations=[],
            )
        )

    return RequirementPresentationSummary(
        status=status,
        confidence_level=confidence,
        inline_claims=inline_claims[:3],
        modal_claims=(modal_claims or inline_claims)[:5],
        full_analysis=full_analysis[:3],
        generated_at=datetime.utcnow().isoformat(),
    )


def _format_citation_label(label: Optional[str], page_number: Optional[int], section_title: Optional[str]) -> str:
    if isinstance(label, str) and label.strip():
        return label.strip()
    if page_number is not None:
        return f"p.{page_number}"
    if isinstance(section_title, str) and section_title.strip():
        return section_title.strip()[:24]
    return "Source"


def _format_citation_location(page_number: Optional[int], section_title: Optional[str]) -> str:
    parts: List[str] = []
    if isinstance(section_title, str) and section_title.strip():
        parts.append(section_title.strip())
    if page_number is not None:
        parts.append(f"Page {page_number}")
    return " • ".join(parts) if parts else "Source"


def _normalize_citations(citations: Iterable[_StructuredCitation]) -> List[CitationPill]:
    normalized: List[CitationPill] = []
    seen: set[Tuple[str, str, str]] = set()

    for citation in citations:
        excerpt = citation.supporting_quote.strip()
        if not excerpt:
            continue

        label = _format_citation_label(citation.label, citation.page_number, citation.section_title)
        location = _format_citation_location(citation.page_number, citation.section_title)
        key = (label, location, excerpt)
        if key in seen:
            continue
        seen.add(key)

        normalized.append(
            CitationPill(
                label=label,
                location=location,
                excerpt=excerpt,
                provider="openai",
                page_number=citation.page_number,
                section_title=citation.section_title,
            )
        )

    return normalized[:2]


def _normalize_claims(claims: Iterable[_StructuredClaim], limit: int) -> List[ClaimItem]:
    normalized: List[ClaimItem] = []
    for claim in claims:
        text = claim.text.strip()
        if not text or claim.kind not in CLAIM_KINDS:
            continue
        normalized.append(
            ClaimItem(
                text=text,
                kind=claim.kind,
                citations=_normalize_citations(claim.citations),
            )
        )
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_analysis(blocks: Iterable[_StructuredAnalysisBlock], limit: int) -> List[AnalysisBlock]:
    normalized: List[AnalysisBlock] = []
    for block in blocks:
        label = block.label.strip()
        body = block.body.strip()
        if not label or not body:
            continue
        normalized.append(
            AnalysisBlock(
                label=label,
                body=body,
                citations=_normalize_citations(block.citations),
            )
        )
        if len(normalized) >= limit:
            break
    return normalized


def _build_requirement_prompt(requirement: Dict[str, Any]) -> str:
    evidence = _truncate_items(requirement.get("evidence") or requirement.get("evidence_snippets") or [], 2)
    gaps = _truncate_items(requirement.get("gaps") or requirement.get("gaps_identified") or [], 2)

    return f"""Create claim-based presentation content for this requirement.

Requirement:
- ID: {requirement.get("requirement_id")}
- Clause: {requirement.get("requirement_clause") or requirement.get("clause") or ""}
- Title: {requirement.get("requirement_title") or requirement.get("title") or ""}
- Status: {_normalize_status(requirement.get("status"))}
- Confidence: {_normalize_confidence(requirement.get("confidence", requirement.get("confidence_level")))}

Raw rationale:
{str(requirement.get("rationale") or requirement.get("evaluation_rationale") or "").strip()}

Evidence items:
{chr(10).join(f"- {item}" for item in evidence) if evidence else "- None provided"}

Gaps or OFIs:
{chr(10).join(f"- {item}" for item in gaps) if gaps else "- None provided"}

Return claim-first JSON for the UI:
- inline_claims: 1 to 4 short claims that explain the gist
- modal_claims: 1 to 6 short claims for the detailed modal
- full_analysis: 1 to 4 short prose blocks

Citations:
- Attach citations to claims or analysis blocks only when they are directly supported by the attached PDF
- Each citation must include an exact supporting quote
- Include page_number when you can identify it
- Include section_title when visible in the document
- Do not invent citations for unsupported statements
- Keep the response compact and within the requested limits
"""


class BaseRequirementPresentationGenerator(ABC):
    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def generate(
        self,
        evaluation_id: str,
        summary: Dict[str, Any],
        supabase_client: Any,
    ) -> Dict[str, Dict[str, Any]]:
        raise NotImplementedError


class OpenAIPdfPresentationGenerator(BaseRequirementPresentationGenerator):
    def __init__(self, client: Optional[OpenAI] = None, model: Optional[str] = None) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.enabled = os.getenv("REQUIREMENT_PRESENTATION_ENABLED", "true").lower() in {"1", "true", "yes"}
        self.provider = os.getenv("REQUIREMENT_PRESENTATION_PROVIDER", "openai").lower()
        self.model = (
            model
            or os.getenv("OPENAI_PRESENTATION_MODEL")
            or os.getenv("OPENAI_MODEL")
            or os.getenv("OPENAI_VISION_MODEL")
            or "gpt-5"
        )
        self.reasoning_effort = os.getenv("OPENAI_PRESENTATION_REASONING_EFFORT", "low")
        self.max_concurrency = max(1, int(os.getenv("OPENAI_PRESENTATION_CONCURRENCY", "2")))
        self.client = client if client is not None else (OpenAI(api_key=self.api_key) if self.api_key else None)

    def is_available(self) -> bool:
        return bool(self.enabled and self.provider == "openai" and self.client is not None)

    async def generate(
        self,
        evaluation_id: str,
        summary: Dict[str, Any],
        supabase_client: Any,
    ) -> Dict[str, Dict[str, Any]]:
        if not self.is_available():
            return {}

        file_ref = await self._resolve_primary_file(evaluation_id, summary, supabase_client)
        if file_ref is None:
            logger.warning("Skipping requirement presentations for %s: missing OpenAI file input", evaluation_id)
            return {}

        semaphore = asyncio.Semaphore(self.max_concurrency)
        tasks = [
            self._generate_requirement_presentation(result, file_ref, semaphore)
            for result in summary.get("requirements_results", [])
        ]
        generated = await asyncio.gather(*tasks, return_exceptions=True)

        presentations: Dict[str, Dict[str, Any]] = {}
        for item in generated:
            if isinstance(item, Exception):
                logger.warning("Requirement presentation generation failed: %s", item)
                continue
            if not item:
                continue
            requirement_id, payload = item
            presentations[requirement_id] = payload
        return presentations

    async def _resolve_primary_file(
        self,
        evaluation_id: str,
        summary: Dict[str, Any],
        supabase_client: Any,
    ) -> Optional[Dict[str, str]]:
        primary_doc: Optional[Dict[str, Any]] = None
        try:
            response = (
                supabase_client.table("evaluation_documents")
                .select("id, file_name, openai_file_id")
                .eq("evaluation_id", evaluation_id)
                .eq("document_role", "primary")
                .limit(1)
                .execute()
            )
            rows = response.data or []
            primary_doc = rows[0] if rows else None
        except Exception as exc:
            logger.warning("Failed to load primary document row for presentation synthesis %s: %s", evaluation_id, exc)

        file_name = (
            (primary_doc or {}).get("file_name")
            or summary.get("document_info", {}).get("file_name")
            or "Primary document"
        )
        existing_file_id = (primary_doc or {}).get("openai_file_id")
        if existing_file_id:
            return {"file_id": existing_file_id, "file_name": file_name}

        document_path = summary.get("document_info", {}).get("file_path")
        if not document_path:
            return None

        path = Path(document_path)
        if not path.exists():
            logger.warning("Primary document path missing during presentation synthesis: %s", document_path)
            return None

        with path.open("rb") as file_obj:
            upload = await asyncio.to_thread(
                self.client.files.create,  # type: ignore[union-attr]
                file=file_obj,
                purpose="user_data",
            )

        uploaded_file_id = upload.id
        if primary_doc and primary_doc.get("id"):
            try:
                supabase_client.table("evaluation_documents").update(
                    {
                        "openai_file_id": uploaded_file_id,
                        "openai_uploaded_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", primary_doc["id"]).execute()
            except Exception as exc:
                logger.warning("Failed to persist OpenAI file ref for %s: %s", evaluation_id, exc)

        return {"file_id": uploaded_file_id, "file_name": file_name}

    async def _generate_requirement_presentation(
        self,
        requirement: Dict[str, Any],
        file_ref: Dict[str, str],
        semaphore: asyncio.Semaphore,
    ) -> Optional[Tuple[str, Dict[str, Any]]]:
        requirement_id = str(requirement.get("requirement_id") or "")
        if not requirement_id:
            return None

        async with semaphore:
            try:
                parsed = await asyncio.to_thread(
                    self.client.responses.parse,  # type: ignore[union-attr]
                    model=self.model,
                    reasoning={"effort": self.reasoning_effort},
                    max_output_tokens=700,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": _build_requirement_prompt(requirement)},
                                {"type": "input_file", "file_id": file_ref["file_id"]},
                            ],
                        }
                    ],
                    instructions=PRESENTATION_SYSTEM_PROMPT,
                    text_format=_StructuredPresentationResponse,
                    text={"verbosity": "low"},
                )
            except Exception as exc:
                logger.warning("OpenAI presentation parse failed for %s: %s", requirement_id, exc)
                return requirement_id, _default_presentation(requirement).model_dump()

            payload = getattr(parsed, "output_parsed", None)
            if payload is None:
                logger.warning("OpenAI presentation parse returned no structured payload for %s", requirement_id)
                return requirement_id, _default_presentation(requirement).model_dump()

            try:
                summary = RequirementPresentationSummary(
                    status=_normalize_status(requirement.get("status")),
                    confidence_level=_normalize_confidence(
                        requirement.get("confidence", requirement.get("confidence_level"))
                    ),
                    inline_claims=_normalize_claims(payload.inline_claims, 4),
                    modal_claims=_normalize_claims(payload.modal_claims or payload.inline_claims, 6),
                    full_analysis=_normalize_analysis(payload.full_analysis, 4),
                    generated_at=datetime.utcnow().isoformat(),
                )
            except ValidationError as exc:
                logger.warning("Presentation normalization failed for %s: %s", requirement_id, exc)
                return requirement_id, _default_presentation(requirement).model_dump()

            if not summary.inline_claims:
                return requirement_id, _default_presentation(requirement).model_dump()
            if not summary.modal_claims:
                summary.modal_claims = list(summary.inline_claims)

            return requirement_id, summary.model_dump()


async def generate_requirement_presentations(
    evaluation_id: str,
    summary: Dict[str, Any],
    supabase_client: Any,
) -> Dict[str, Dict[str, Any]]:
    generator: BaseRequirementPresentationGenerator = OpenAIPdfPresentationGenerator()
    return await generator.generate(evaluation_id=evaluation_id, summary=summary, supabase_client=supabase_client)


def generate_requirement_presentations_sync(
    evaluation_id: str,
    summary: Dict[str, Any],
    supabase_client: Any,
) -> Dict[str, Dict[str, Any]]:
    try:
        coroutine = generate_requirement_presentations(
            evaluation_id=evaluation_id,
            summary=summary,
            supabase_client=supabase_client,
        )
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coroutine)
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coroutine)
            return future.result()
    except Exception as exc:
        logger.error("Requirement presentation sync wrapper failed: %s", exc)
        return {}
