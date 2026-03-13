#!/usr/bin/env python3
"""
Requirement presentation generator

Creates claim-based requirement presentation data for Results V2.
This is a second-pass synthesis layer that keeps the raw evaluator output intact
and uses a provider-neutral contract. The first implementation uses OpenAI
direct PDF input plus structured outputs.

Generation is split into two parallel calls per requirement:
  1. Inline claims  — small schema, tight token budget
  2. Modal analysis — separate schema, medium token budget

Splitting prevents truncation that occurred when generating everything in one
structured response for dense requirements.
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

PRESENTATION_VERSION = "openai-structured-v2"
FALLBACK_VERSION = "default-fallback-v2"
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


# ---------------------------------------------------------------------------
# Internal structured-output schemas (not exposed outside this module)
# ---------------------------------------------------------------------------


class _StructuredCitation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    supporting_quote: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    supported_claim: Optional[str] = None
    label: Optional[str] = None


class _InlineClaim(BaseModel):
    """Claim with citations — used by the inline call."""

    model_config = ConfigDict(extra="ignore")

    text: str
    kind: Literal["assessment", "supporting", "gap", "verification", "ofi"]
    citations: List[_StructuredCitation] = Field(default_factory=list)


class _ModalClaim(BaseModel):
    """Claim without citations — used by the modal call."""

    model_config = ConfigDict(extra="ignore")

    text: str
    kind: Literal["assessment", "supporting", "gap", "verification", "ofi"]


class _AnalysisBlockOnly(BaseModel):
    """Analysis block without citations — used by the modal call."""

    model_config = ConfigDict(extra="ignore")

    label: str
    body: str


class _InlineClaimsResponse(BaseModel):
    """Schema for the inline-claims generation call (small, with citations)."""

    model_config = ConfigDict(extra="ignore")

    inline_claims: List[_InlineClaim] = Field(default_factory=list)


class _ModalAnalysisResponse(BaseModel):
    """Schema for the modal-analysis generation call (medium, no citations)."""

    model_config = ConfigDict(extra="ignore")

    modal_claims: List[_ModalClaim] = Field(default_factory=list)
    full_analysis: List[_AnalysisBlockOnly] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# System prompts — one per call type
# ---------------------------------------------------------------------------

INLINE_SYSTEM_PROMPT = """You create short claim-based inline content for compliance review rows.

Rules:
1. Use only the supplied requirement data and the attached PDF. Never invent support, gaps, or citations.
2. Write claim-first reviewer-facing statements. Do not lead with raw quotes or page references.
3. Produce exactly 1-2 inline_claims. Communicate the gist of what is present, missing, or uncertain.
4. First claim must be kind "assessment": one sentence explaining why the requirement passed/failed/was flagged.
5. Second claim (if any) must be kind "gap", "verification", or "ofi" — the most important missing element.
6. Distinguish FAIL from FLAGGED: FAIL = requirement not met. FLAGGED = evidence incomplete or ambiguous.
7. No recommendations. No remediation instructions.
8. For each claim, attach all relevant citations directly supported by the PDF.
   - Each supporting_quote must be copied verbatim from the document and kept under 100 characters.
   - Include page_number when identifiable. Include section_title when a heading is visible nearby.
   - If a claim has no direct support in the PDF, return an empty citations array for that claim.
"""

MODAL_SYSTEM_PROMPT = """You create modal explanation content for a detailed compliance review view.

Rules:
1. Use only the supplied requirement data. Never invent support, gaps, or evidence.
2. Write claim-first reviewer-facing statements.
3. modal_claims: 2-4 concise claims. First is "assessment". Add "supporting", "gap", or "verification" claims.
4. full_analysis: 2-3 short prose blocks. Each has a label and a body of 1-2 sentences max.
   Labels should be descriptive: e.g. "Assessment summary", "Evidence analysis", "Gap analysis".
5. Distinguish FAIL from FLAGGED: FAIL = not met. FLAGGED = evidence incomplete or needs verification.
6. No recommendations. No remediation instructions.
"""


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


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
        presentation_version=FALLBACK_VERSION,
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


def _sanitize(s: str) -> str:
    return s.strip().replace('\x00', '')


def _normalize_citations(citations: Iterable[_StructuredCitation]) -> List[CitationPill]:
    normalized: List[CitationPill] = []
    seen: set[Tuple[str, str, str]] = set()

    for citation in citations:
        excerpt = _sanitize(citation.supporting_quote)[:100]
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

    return normalized


def _normalize_inline_claims(claims: Iterable[_InlineClaim], limit: int) -> List[ClaimItem]:
    normalized: List[ClaimItem] = []
    for claim in claims:
        text = _sanitize(claim.text)
        if not text or claim.kind not in CLAIM_KINDS:
            continue
        normalized.append(ClaimItem(text=text, kind=claim.kind, citations=_normalize_citations(claim.citations)))
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_modal_claims(claims: Iterable[_ModalClaim], limit: int) -> List[ClaimItem]:
    normalized: List[ClaimItem] = []
    for claim in claims:
        text = _sanitize(claim.text)
        if not text or claim.kind not in CLAIM_KINDS:
            continue
        normalized.append(ClaimItem(text=text, kind=claim.kind, citations=[]))
        if len(normalized) >= limit:
            break
    return normalized


def _normalize_analysis(blocks: Iterable[_AnalysisBlockOnly], limit: int) -> List[AnalysisBlock]:
    normalized: List[AnalysisBlock] = []
    for block in blocks:
        label = block.label.strip()
        body = block.body.strip()
        if not label or not body:
            continue
        normalized.append(AnalysisBlock(label=label, body=body, citations=[]))
        if len(normalized) >= limit:
            break
    return normalized


# ---------------------------------------------------------------------------
# Per-call prompt builders
# ---------------------------------------------------------------------------


def _requirement_context_block(requirement: Dict[str, Any]) -> str:
    evidence = _truncate_items(requirement.get("evidence") or requirement.get("evidence_snippets") or [], 3)
    gaps = _truncate_items(requirement.get("gaps") or requirement.get("gaps_identified") or [], 3)
    return (
        f"- ID: {requirement.get('requirement_id')}\n"
        f"- Clause: {requirement.get('requirement_clause') or requirement.get('clause') or ''}\n"
        f"- Title: {requirement.get('requirement_title') or requirement.get('title') or ''}\n"
        f"- Status: {_normalize_status(requirement.get('status'))}\n"
        f"- Confidence: {_normalize_confidence(requirement.get('confidence', requirement.get('confidence_level')))}\n"
        f"\nRaw rationale:\n"
        f"{str(requirement.get('rationale') or requirement.get('evaluation_rationale') or '').strip()}\n"
        f"\nEvidence items:\n"
        f"{chr(10).join(f'- {item}' for item in evidence) if evidence else '- None provided'}\n"
        f"\nGaps or OFIs:\n"
        f"{chr(10).join(f'- {item}' for item in gaps) if gaps else '- None provided'}"
    )


def _build_inline_prompt(requirement: Dict[str, Any]) -> str:
    return (
        "Create short inline claims with citations for this requirement evaluation.\n\n"
        "Requirement:\n"
        f"{_requirement_context_block(requirement)}\n\n"
        "Return JSON with:\n"
        "- inline_claims: exactly 1-2 claims\n"
        "- First claim is always kind 'assessment'\n"
        "- Second claim (if needed) is kind 'gap', 'verification', or 'ofi'\n"
        "- Each claim may have multiple citations drawn verbatim from the attached PDF (each under 100 chars)\n"
    )


def _build_modal_prompt(requirement: Dict[str, Any]) -> str:
    return (
        "Create modal explanation content for this requirement evaluation.\n\n"
        "Requirement:\n"
        f"{_requirement_context_block(requirement)}\n\n"
        "Return JSON with:\n"
        "- modal_claims: 2-4 concise claims (first is 'assessment'; others explain supporting evidence, gaps, or verification needs)\n"
        "- full_analysis: 2-3 short prose blocks (label + 1-2 sentence body each)\n"
    )



# ---------------------------------------------------------------------------
# Generator classes
# ---------------------------------------------------------------------------


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

    async def _generate_inline_claims(
        self,
        requirement: Dict[str, Any],
        file_ref: Dict[str, str],
        semaphore: asyncio.Semaphore,
    ) -> Optional[_InlineClaimsResponse]:
        requirement_id = str(requirement.get("requirement_id") or "")
        async with semaphore:
            try:
                parsed = await asyncio.to_thread(
                    self.client.responses.parse,  # type: ignore[union-attr]
                    model=self.model,
                    reasoning={"effort": self.reasoning_effort},
                    max_output_tokens=1000,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": _build_inline_prompt(requirement)},
                                {"type": "input_file", "file_id": file_ref["file_id"]},
                            ],
                        }
                    ],
                    instructions=INLINE_SYSTEM_PROMPT,
                    text_format=_InlineClaimsResponse,
                    text={"verbosity": "low"},
                )
            except Exception as exc:
                logger.warning("Inline claims generation failed for %s: %s", requirement_id, exc)
                return None

        payload = getattr(parsed, "output_parsed", None)
        if payload is None:
            logger.warning("Inline claims parse returned no payload for %s", requirement_id)
            return None
        return payload



    async def _generate_modal_analysis(
        self,
        requirement: Dict[str, Any],
        file_ref: Dict[str, str],
        semaphore: asyncio.Semaphore,
    ) -> Optional[_ModalAnalysisResponse]:
        requirement_id = str(requirement.get("requirement_id") or "")
        async with semaphore:
            try:
                parsed = await asyncio.to_thread(
                    self.client.responses.parse,  # type: ignore[union-attr]
                    model=self.model,
                    reasoning={"effort": self.reasoning_effort},
                    max_output_tokens=800,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": _build_modal_prompt(requirement)},
                                {"type": "input_file", "file_id": file_ref["file_id"]},
                            ],
                        }
                    ],
                    instructions=MODAL_SYSTEM_PROMPT,
                    text_format=_ModalAnalysisResponse,
                    text={"verbosity": "low"},
                )
            except Exception as exc:
                logger.warning("Modal analysis generation failed for %s: %s", requirement_id, exc)
                return None

        payload = getattr(parsed, "output_parsed", None)
        if payload is None:
            logger.warning("Modal analysis parse returned no payload for %s", requirement_id)
            return None
        return payload

    async def _generate_requirement_presentation(
        self,
        requirement: Dict[str, Any],
        file_ref: Dict[str, str],
        semaphore: asyncio.Semaphore,
    ) -> Optional[Tuple[str, Dict[str, Any]]]:
        requirement_id = str(requirement.get("requirement_id") or "")
        if not requirement_id:
            return None

        # Both calls are independent — run in parallel
        inline_result, modal_result = await asyncio.gather(
            asyncio.create_task(self._generate_inline_claims(requirement, file_ref, semaphore)),
            asyncio.create_task(self._generate_modal_analysis(requirement, file_ref, semaphore)),
            return_exceptions=True,
        )

        inline_payload: Optional[_InlineClaimsResponse] = (
            inline_result if not isinstance(inline_result, Exception) else None
        )
        modal_payload: Optional[_ModalAnalysisResponse] = (
            modal_result if not isinstance(modal_result, Exception) else None
        )

        inline_claims: List[ClaimItem] = []
        modal_claims: List[ClaimItem] = []
        full_analysis: List[AnalysisBlock] = []

        if inline_payload and inline_payload.inline_claims:
            inline_claims = _normalize_inline_claims(inline_payload.inline_claims, 2)

        if modal_payload:
            if modal_payload.modal_claims:
                modal_claims = _normalize_modal_claims(modal_payload.modal_claims, 6)
            if modal_payload.full_analysis:
                full_analysis = _normalize_analysis(modal_payload.full_analysis, 4)

        # Inline claims are load-bearing — fall back entirely if they failed
        if not inline_claims:
            logger.info("Falling back to default inline presentation for %s", requirement_id)
            return requirement_id, _default_presentation(requirement).model_dump()

        # Modal can degrade independently — use inline claims (stripped of citations) as fallback
        if not modal_claims:
            modal_claims = [ClaimItem(text=c.text, kind=c.kind, citations=[]) for c in inline_claims]

        try:
            summary = RequirementPresentationSummary(
                status=_normalize_status(requirement.get("status")),
                confidence_level=_normalize_confidence(
                    requirement.get("confidence", requirement.get("confidence_level"))
                ),
                inline_claims=inline_claims,
                modal_claims=modal_claims,
                full_analysis=full_analysis,
                generated_at=datetime.utcnow().isoformat(),
            )
        except ValidationError as exc:
            logger.warning("Presentation merge failed for %s: %s", requirement_id, exc)
            return requirement_id, _default_presentation(requirement).model_dump()

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
