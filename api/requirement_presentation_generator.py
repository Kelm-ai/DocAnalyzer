#!/usr/bin/env python3
"""
Requirement presentation generator

Creates finding-centered requirement presentation data for Results V2.
This is a second-pass synthesis layer that keeps the raw evaluator output intact
and uses a provider-neutral contract. The current implementation keeps
deterministic evidence grouping separate from lightweight LLM text synthesis.
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

from evidence_utils import normalize_evidence_items
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)

PRESENTATION_VERSION = "openai-finding-v3"
DETAIL_LABEL = Literal["Document evidence", "Observed limitation", "Needs verification"]


class CitationPill(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str
    location: str
    excerpt: str
    provider: Optional[str] = None
    file_id: Optional[str] = None
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    document_name: Optional[str] = None
    supports: Optional[str] = None
    evidence_id: Optional[str] = None
    evidence_type: Optional[Literal["direct_quote", "cross_reference", "visual_or_table"]] = None


class StructuredEvidenceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page_number: Optional[int] = None
    section_title: Optional[str] = None
    quote: str
    supports: str
    document_name: Optional[str] = None
    evidence_id: Optional[str] = None
    evidence_type: Optional[Literal["direct_quote", "cross_reference", "visual_or_table"]] = None


class PresentationTextBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    citations: Optional[List[CitationPill]] = None


class EvidenceGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")

    claim_id: str
    label: DETAIL_LABEL
    text: str
    citations: List[CitationPill] = Field(default_factory=list)


class RequirementPresentationSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    confidence_level: Literal["low", "medium", "high"]
    inline_finding: PresentationTextBlock
    inline_caveat: Optional[PresentationTextBlock] = None
    modal_summary: str
    evidence_groups: List[EvidenceGroup] = Field(default_factory=list)
    generated_at: str
    presentation_version: str = PRESENTATION_VERSION


class _StructuredSynthesisResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    inline_finding: str
    inline_caveat: Optional[str] = None
    modal_summary: str


PRESENTATION_SYSTEM_PROMPT = """You create concise reviewer-facing compliance findings from raw requirement evaluation output.

Rules:
1. Use only the supplied requirement data and attached PDF. Never invent support, gaps, or citations.
2. Write plain-language reviewer-facing statements. Do not lead with raw quotes or page references.
3. Keep the inline finding short and scannable. It should communicate the gist of what is present, missing, or uncertain.
4. The optional inline caveat should describe the limitation or verification need in neutral language.
5. The modal summary should explain why the status was assigned in plain language. Be direct and brief — e.g. "Passed because the procedure clearly establishes a lifecycle-wide risk management process." Avoid jargon, listing sub-processes, or restating the requirement title.
6. Distinguish FAIL from FLAGGED:
   - FAIL means the requirement is not adequately met.
   - FLAGGED means evidence is incomplete, indirect, or needs human verification.
7. PASS may include optional limitations or opportunities for improvement, but do not turn PASS into a failure.
8. No recommendations. No remediation instructions.
9. Do not emit citations or evidence groups. Those are generated separately.
10. Keep output compact:
   - inline_finding: 1 sentence
   - inline_caveat: 1 sentence when needed, else omit
   - modal_summary: 1 plain-language sentence
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


def _collect_items(items: Iterable[str]) -> List[str]:
    output: List[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = _strip_source_prefix(str(item or ""))
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
    return output


def _normalize_structured_evidence(items: Any) -> List[StructuredEvidenceItem]:
    normalized: List[StructuredEvidenceItem] = []
    for item in normalize_evidence_items(items):
        try:
            normalized.append(StructuredEvidenceItem.model_validate(item))
        except ValidationError:
            continue
    return normalized


def _extract_page_number(text: str) -> Optional[int]:
    page_match = re.search(r"\b[Pp]age\s+(\d+)\b", text)
    if page_match:
        return int(page_match.group(1))
    page_match = re.search(r"\(page\s+(\d+)\)", text, re.IGNORECASE)
    if page_match:
        return int(page_match.group(1))
    return None


def _extract_section_title(text: str) -> Optional[str]:
    prefix = text.split(":", 1)[0].strip()
    if not prefix or len(prefix) > 120:
        return None
    if '"' in prefix or "“" in prefix:
        return None
    return prefix


def _format_citation_label(
    page_number: Optional[int],
    section_title: Optional[str],
    document_name: Optional[str] = None,
    evidence_type: Optional[str] = None,
) -> str:
    if page_number is not None:
        return f"p.{page_number}"
    if isinstance(section_title, str) and section_title.strip():
        return section_title.strip()[:24]
    if isinstance(document_name, str) and document_name.strip():
        return document_name.strip()[:24]
    return "Evidence"


def _format_citation_location(
    page_number: Optional[int],
    section_title: Optional[str],
    document_name: Optional[str] = None,
    evidence_type: Optional[str] = None,
) -> str:
    parts: List[str] = []
    if isinstance(document_name, str) and document_name.strip():
        parts.append(document_name.strip())
    if isinstance(section_title, str) and section_title.strip():
        parts.append(section_title.strip())
    if page_number is not None:
        parts.append(f"Page {page_number}")
    return " • ".join(parts) if parts else "Evidence"


def _citation_sort_score(citation: CitationPill) -> int:
    score = 0
    if citation.page_number is not None:
        score += 4
    if citation.section_title:
        score += 2
    if citation.label != "Evidence":
        score += 1
    if citation.location != "Evidence":
        score += 1
    return score


def _normalize_match_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


def _extract_reference_tokens(text: str) -> set[str]:
    tokens = {
        token
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if len(token) >= 4
    }
    for pattern in (
        r"\b(?:figure|fig\.?|table|appendix|section)\s+\d+(?:\.\d+)*\b",
        r"\b[A-Z]{2,}-\d+(?:\.\d+)*\b",
        r"\b[A-Z]{2,}\d{2,}\b",
    ):
        for match in re.findall(pattern, text, flags=re.IGNORECASE):
            tokens.add(match.lower())
    return tokens


def _gap_evidence_score(gap_text: str, item: StructuredEvidenceItem) -> int:
    gap_clean = gap_text.strip()
    if not gap_clean:
        return 0

    combined = " ".join(
        part for part in (item.section_title, item.quote, item.supports, item.document_name) if part
    )
    if not combined:
        return 0

    gap_lower = gap_clean.lower()
    combined_lower = combined.lower()
    score = 0

    if item.section_title and item.section_title.lower() in gap_lower:
        score += 8
    if item.document_name and item.document_name.lower() in gap_lower:
        score += 6

    gap_refs = _extract_reference_tokens(gap_clean)
    combined_refs = _extract_reference_tokens(combined)
    score += 5 * len(gap_refs & combined_refs)

    gap_tokens = set(_normalize_match_text(gap_clean).split())
    combined_tokens = set(_normalize_match_text(combined).split())
    overlap = {
        token for token in (gap_tokens & combined_tokens)
        if len(token) >= 5
    }
    score += min(len(overlap), 4)

    return score


def _link_gap_to_evidence(gap_text: str, evidence: List[StructuredEvidenceItem], limit: int = 2) -> List[CitationPill]:
    if not gap_text.strip() or not evidence:
        return []

    ranked: List[Tuple[int, CitationPill]] = []
    for item in evidence:
        score = _gap_evidence_score(gap_text, item)
        if score <= 0:
            continue
        ranked.append((score, _citation_from_structured_evidence(item)))

    ranked.sort(key=lambda pair: (pair[0], _citation_sort_score(pair[1])), reverse=True)

    citations: List[CitationPill] = []
    seen: set[Tuple[str, str]] = set()
    for _, citation in ranked:
        key = (citation.location, citation.excerpt)
        if key in seen:
            continue
        seen.add(key)
        citations.append(citation)
        if len(citations) >= limit:
            break
    return citations


def _citation_from_structured_evidence(item: StructuredEvidenceItem) -> CitationPill:
    excerpt_source = item.quote or item.supports
    return CitationPill(
        label=_format_citation_label(item.page_number, item.section_title, item.document_name, item.evidence_type),
        location=_format_citation_location(item.page_number, item.section_title, item.document_name, item.evidence_type),
        excerpt=_truncate_sentence(excerpt_source, 300),
        provider="raw_evaluator",
        page_number=item.page_number,
        section_title=item.section_title,
        document_name=item.document_name,
        supports=item.supports,
        evidence_id=item.evidence_id,
        evidence_type=item.evidence_type,
    )


def _text_block(block_id: str, text: str) -> PresentationTextBlock:
    return PresentationTextBlock(id=block_id, text=text.strip())


def _default_document_evidence_text(status: str) -> Optional[str]:
    if status == "PASS":
        return "No usable citation was extracted for this result."
    if status == "FAIL":
        return "No direct supporting text was identified in the reviewed document for this requirement."
    if status == "FLAGGED":
        return "The extracted evidence is not specific enough to resolve this requirement without human review."
    return None


def _make_finding_text(status: str, rationale: str) -> str:
    summary = _first_sentence(rationale or _fallback_rationale(status), 160)
    if summary:
        return summary

    if status == "PASS":
        return "The document appears to address this requirement."
    if status == "FAIL":
        return "The document does not appear to adequately address this requirement."
    if status == "FLAGGED":
        return "This requirement still needs human verification."
    if status == "NOT_APPLICABLE":
        return "This requirement was marked not applicable."
    return "This requirement could not be evaluated successfully."


def _make_inline_caveat(status: str, gaps: List[str]) -> Optional[PresentationTextBlock]:
    if status == "PASS" and gaps:
        return _text_block("caveat", _first_sentence(gaps[0], 160))
    if status == "FAIL" and gaps:
        return _text_block("caveat", _first_sentence(gaps[0], 160))
    if status == "FLAGGED":
        caveat_text = _first_sentence(gaps[0], 160) if gaps else "Human review is still needed to confirm whether this requirement is met."
        return _text_block("caveat", caveat_text)
    return None


def _candidate_label(status: str, is_gap: bool) -> Optional[DETAIL_LABEL]:
    if not is_gap:
        return "Document evidence"
    if status == "FLAGGED":
        return "Needs verification"
    if status in {"PASS", "FAIL"}:
        return "Observed limitation"
    return None


def _candidate_claim_id(label: DETAIL_LABEL) -> str:
    return "finding" if label == "Document evidence" else "caveat"


def _label_priority(label: DETAIL_LABEL) -> int:
    if label == "Document evidence":
        return 0
    if label == "Observed limitation":
        return 1
    return 2


def _build_evidence_groups(
    status: str,
    evidence: List[StructuredEvidenceItem],
    gaps: List[str],
    max_citations_per_group: int,
    max_groups_per_requirement: int,
    max_citations_per_requirement: int,
) -> List[EvidenceGroup]:
    raw_groups: List[Tuple[int, EvidenceGroup, List[CitationPill]]] = []
    group_index = 0

    for item in evidence:
        label = _candidate_label(status, is_gap=False)
        if label is None:
            continue
        citations = [_citation_from_structured_evidence(item)]
        raw_groups.append(
            (
                group_index,
                EvidenceGroup(
                    claim_id=_candidate_claim_id(label),
                    label=label,
                    text=_truncate_sentence(item.supports, 320),
                    citations=[],
                ),
                citations,
            )
        )
        group_index += 1

    for item in gaps:
        label = _candidate_label(status, is_gap=True)
        if label is None:
            continue
        citations = _link_gap_to_evidence(item, evidence)
        raw_groups.append(
            (
                group_index,
                EvidenceGroup(
                    claim_id=_candidate_claim_id(label),
                    label=label,
                    text=_truncate_sentence(item, 320),
                    citations=[],
                ),
                citations,
            )
        )
        group_index += 1

    if not evidence:
        fallback_text = _default_document_evidence_text(status)
        if fallback_text:
            raw_groups.append(
                (
                    group_index,
                    EvidenceGroup(
                        claim_id="finding",
                        label="Document evidence",
                        text=fallback_text,
                        citations=[],
                    ),
                    [],
                )
            )
            group_index += 1

    if status == "FLAGGED" and not gaps:
        raw_groups.append(
            (
                group_index,
                EvidenceGroup(
                    claim_id="caveat",
                    label="Needs verification",
                    text="The available document evidence is incomplete or ambiguous enough that this requirement should be reviewed by a human.",
                    citations=[],
                ),
                [],
            )
        )

    raw_groups.sort(
        key=lambda item: (
            _label_priority(item[1].label),
            -max((_citation_sort_score(citation) for citation in item[2]), default=-1),
            item[0],
        )
    )

    built_groups: List[EvidenceGroup] = []
    seen_citations: set[Tuple[str, str, str]] = set()
    total_citations = 0
    seen_group_keys: set[Tuple[str, str, str]] = set()

    for _, group, citations in raw_groups:
        if len(built_groups) >= max_groups_per_requirement:
            break

        group_key = (group.claim_id, group.label, group.text.lower())
        if group_key in seen_group_keys:
            continue
        seen_group_keys.add(group_key)

        allowed_citations: List[CitationPill] = []
        remaining_citations = max(0, max_citations_per_requirement - total_citations)
        per_group_limit = min(max_citations_per_group, remaining_citations)

        for citation in citations:
            if len(allowed_citations) >= per_group_limit:
                break
            key = (group.claim_id, citation.location, citation.excerpt)
            if key in seen_citations:
                continue
            seen_citations.add(key)
            allowed_citations.append(citation)
            total_citations += 1

        built_groups.append(group.model_copy(update={"citations": allowed_citations}))

    return built_groups


def _default_presentation(
    requirement: Dict[str, Any],
    max_citations_per_group: int,
    max_groups_per_requirement: int,
    max_citations_per_requirement: int,
) -> RequirementPresentationSummary:
    status = _normalize_status(requirement.get("status"))
    confidence = _normalize_confidence(requirement.get("confidence", requirement.get("confidence_level")))
    rationale = str(requirement.get("rationale") or requirement.get("evaluation_rationale") or "").strip()
    evidence = _normalize_structured_evidence(
        requirement.get("structured_evidence")
        or requirement.get("evidence")
        or requirement.get("evidence_snippets")
        or []
    )
    gaps = _collect_items(requirement.get("gaps") or requirement.get("gaps_identified") or [])

    return RequirementPresentationSummary(
        status=status,
        confidence_level=confidence,
        inline_finding=_text_block("finding", _make_finding_text(status, rationale)),
        inline_caveat=_make_inline_caveat(status, gaps),
        modal_summary=_truncate_sentence(rationale or _make_finding_text(status, rationale), 300),
        evidence_groups=_build_evidence_groups(
            status=status,
            evidence=evidence,
            gaps=gaps,
            max_citations_per_group=max_citations_per_group,
            max_groups_per_requirement=max_groups_per_requirement,
            max_citations_per_requirement=max_citations_per_requirement,
        ),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def _apply_synthesis(
    baseline: RequirementPresentationSummary,
    payload: _StructuredSynthesisResponse,
) -> RequirementPresentationSummary:
    summary = baseline.model_copy(deep=True)

    finding_text = _truncate_sentence(payload.inline_finding, 500)
    if finding_text:
        summary.inline_finding.text = finding_text

    caveat_text = _truncate_sentence(payload.inline_caveat or "", 500)
    if caveat_text:
        summary.inline_caveat = _text_block("caveat", caveat_text)

    modal_summary = _truncate_sentence(payload.modal_summary, 300)
    if modal_summary:
        summary.modal_summary = modal_summary

    return summary


def _build_requirement_prompt(requirement: Dict[str, Any]) -> str:
    evidence = _normalize_structured_evidence(
        requirement.get("structured_evidence")
        or requirement.get("evidence")
        or requirement.get("evidence_snippets")
        or []
    )
    gaps = _collect_items(requirement.get("gaps") or requirement.get("gaps_identified") or [])

    evidence_lines = [
        f'- {item.document_name + " | " if item.document_name else ""}'
        f'{item.section_title or "Source"}'
        f'{f" | p.{item.page_number}" if item.page_number is not None else ""}'
        f' | "{item.quote}"'
        f' | supports: {item.supports}'
        for item in evidence
    ]

    return f"""Create finding-centered reviewer-facing content for this requirement.

Requirement:
- ID: {requirement.get("requirement_id")}
- Clause: {requirement.get("requirement_clause") or requirement.get("clause") or ""}
- Title: {requirement.get("requirement_title") or requirement.get("title") or ""}
- Status: {_normalize_status(requirement.get("status"))}
- Confidence: {_normalize_confidence(requirement.get("confidence", requirement.get("confidence_level")))}

Raw rationale:
{str(requirement.get("rationale") or requirement.get("evaluation_rationale") or "").strip()}

Evidence items:
{chr(10).join(evidence_lines) if evidence_lines else "- None provided"}

Gaps or OFIs:
{chr(10).join(f"- {item}" for item in gaps) if gaps else "- None provided"}

Return compact JSON for the UI:
- inline_finding: one short sentence
- inline_caveat: optional one-sentence limitation or verification note
- modal_summary: one plain-language sentence explaining why this status was assigned (e.g. "Passed because X is clearly documented.")

Do not return citations, evidence blocks, or evidence groups.
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
        self.max_output_tokens = max(512, int(os.getenv("OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS", "4000")))
        self.max_citations_per_group = max(1, int(os.getenv("OPENAI_PRESENTATION_MAX_CITATIONS_PER_GROUP", "10")))
        self.max_groups_per_requirement = max(1, int(os.getenv("OPENAI_PRESENTATION_MAX_GROUPS_PER_REQUIREMENT", "12")))
        self.max_citations_per_requirement = max(
            self.max_citations_per_group,
            int(os.getenv("OPENAI_PRESENTATION_MAX_CITATIONS_PER_REQUIREMENT", "40")),
        )
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
            baseline = _default_presentation(
                requirement,
                max_citations_per_group=self.max_citations_per_group,
                max_groups_per_requirement=self.max_groups_per_requirement,
                max_citations_per_requirement=self.max_citations_per_requirement,
            )

            try:
                parsed = await asyncio.to_thread(
                    self.client.responses.parse,  # type: ignore[union-attr]
                    model=self.model,
                    reasoning={"effort": self.reasoning_effort},
                    max_output_tokens=self.max_output_tokens,
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
                    text_format=_StructuredSynthesisResponse,
                    text={"verbosity": "low"},
                )
            except Exception as exc:
                logger.warning("OpenAI presentation parse failed for %s: %s", requirement_id, exc)
                return requirement_id, baseline.model_dump()

            payload = getattr(parsed, "output_parsed", None)
            if payload is None:
                logger.warning("OpenAI presentation parse returned no structured payload for %s", requirement_id)
                return requirement_id, baseline.model_dump()

            try:
                summary = _apply_synthesis(baseline, payload)
            except ValidationError as exc:
                logger.warning("Presentation normalization failed for %s: %s", requirement_id, exc)
                return requirement_id, baseline.model_dump()

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
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coroutine)
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coroutine)
            return future.result()
    except Exception as exc:
        logger.error("Requirement presentation sync wrapper failed: %s", exc)
        return {}
