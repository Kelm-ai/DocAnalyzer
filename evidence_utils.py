"""Helpers for normalizing raw evaluator evidence into a stable structured shape."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional


EvidenceType = Literal["direct_quote", "cross_reference", "visual_or_table"]
EVIDENCE_TYPE_VALUES: tuple[EvidenceType, ...] = (
    "direct_quote",
    "cross_reference",
    "visual_or_table",
)

_SPECIFIC_REFERENCE_PATTERNS = (
    r"\b(?:SOP|WI|QAP|QMS|POL|DOC|FORM|FRM|TEMPLATE|MANUAL|RECORD)\b",
    r"\b[A-Z]{2,}(?:[-/][A-Z0-9]+)+\b",
    r"\b[A-Z]{2,}\d{2,}\b",
)
_CROSS_REFERENCE_PHRASES = (
    "see ",
    "refer to",
    "referenced in",
    "in accordance with",
    "according to",
    "per ",
    "maintained in",
    "defined in",
)


def _normalize_optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return re.sub(r"\s+", " ", text)


def _sanitize_quote(value: Any, limit: int = 300) -> str:
    text = _normalize_optional_text(value) or ""
    text = text.strip().strip('"').strip("'").strip()
    if len(text) <= limit:
        return text
    truncated = text[: limit - 1].rstrip()
    if " " in truncated:
        truncated = truncated.rsplit(" ", 1)[0]
    return f"{truncated}..."


def _clean_legacy_text(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^\[[^\]]+\]\s*", "", cleaned)
    cleaned = cleaned.strip().strip('"').strip("'").strip()
    return re.sub(r"\s+", " ", cleaned)


def _normalize_evidence_id(value: Any) -> Optional[str]:
    text = _normalize_optional_text(value)
    if not text:
        return None
    normalized = text.upper()
    return normalized[:24]


def _normalize_evidence_type(value: Any) -> Optional[EvidenceType]:
    text = (_normalize_optional_text(value) or "").lower()
    if text in EVIDENCE_TYPE_VALUES:
        return text  # type: ignore[return-value]
    return None


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


def _derive_quote_from_legacy(text: str) -> str:
    quote_matches = re.findall(r"[\"“](.*?)[\"”]", text)
    for match in quote_matches:
        quote = _sanitize_quote(match, 300)
        if quote:
            return quote
    return _sanitize_quote(text, 300)


def _derive_supports_from_legacy(text: str) -> str:
    cleaned = _clean_legacy_text(text)
    if not cleaned:
        return ""
    return _sanitize_quote(cleaned, 350)


def _looks_like_specific_cross_reference(text: str) -> bool:
    lowered = (text or "").lower()
    if not lowered:
        return False
    if not any(phrase in lowered for phrase in _CROSS_REFERENCE_PHRASES):
        return False
    return any(re.search(pattern, text) for pattern in _SPECIFIC_REFERENCE_PATTERNS)


def _infer_evidence_type(
    quote: str,
    supports: str,
    explicit_type: Optional[EvidenceType],
) -> Optional[EvidenceType]:
    if explicit_type:
        return explicit_type
    combined = " ".join(part for part in (quote, supports) if part).strip()
    if not combined:
        return None
    lowered = combined.lower()
    if _looks_like_specific_cross_reference(combined):
        return "cross_reference"
    if any(token in lowered for token in ("table", "figure", "chart", "appendix", "signature")):
        return "visual_or_table"
    if quote:
        return "direct_quote"
    return None


def assess_evidence_item_quality(item: Any) -> Dict[str, Any]:
    normalized = normalize_evidence_items([item])
    if not normalized:
        return {
            "evidence_id": None,
            "evidence_type": None,
            "flags": ["missing_quote", "missing_supports", "missing_location"],
            "has_quote": False,
            "has_supports": False,
            "has_page_number": False,
            "has_location": False,
            "is_cross_reference": False,
            "is_specific_cross_reference": False,
            "usable_for_pass": False,
        }

    evidence = normalized[0]
    quote = evidence.get("quote") or ""
    supports = evidence.get("supports") or ""
    evidence_type = _normalize_evidence_type(evidence.get("evidence_type"))
    has_quote = bool(quote)
    has_supports = bool(supports)
    has_page_number = evidence.get("page_number") is not None
    has_location = has_page_number or bool(evidence.get("section_title")) or bool(evidence.get("document_name"))
    combined = " ".join(part for part in (quote, supports) if part)
    is_specific_cross_reference = _looks_like_specific_cross_reference(combined)
    is_cross_reference = evidence_type == "cross_reference" or is_specific_cross_reference

    flags: List[str] = []
    if not has_quote:
        flags.append("missing_quote")
    if not has_supports:
        flags.append("missing_supports")
    if not has_page_number:
        flags.append("missing_page_number")
    if not has_location:
        flags.append("missing_location")
    if is_cross_reference:
        flags.append("cross_reference_only")

    usable_for_pass = has_supports and ((has_quote and not is_cross_reference) or is_specific_cross_reference)

    return {
        "evidence_id": evidence.get("evidence_id"),
        "evidence_type": evidence_type,
        "flags": flags,
        "has_quote": has_quote,
        "has_supports": has_supports,
        "has_page_number": has_page_number,
        "has_location": has_location,
        "is_cross_reference": is_cross_reference,
        "is_specific_cross_reference": is_specific_cross_reference,
        "usable_for_pass": usable_for_pass,
    }


def has_usable_pass_evidence(items: Any) -> bool:
    return any(
        assess_evidence_item_quality(item).get("usable_for_pass", False)
        for item in (items if isinstance(items, list) else [items])
    )


def normalize_evidence_items(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []

    items = value if isinstance(value, list) else [value]
    normalized: List[Dict[str, Any]] = []
    seen: set[tuple[Optional[int], Optional[str], str, str, Optional[str], Optional[str], Optional[str]]] = set()

    for item in items:
        page_number: Optional[int] = None
        section_title: Optional[str] = None
        quote = ""
        supports = ""
        document_name: Optional[str] = None
        evidence_id: Optional[str] = None
        evidence_type: Optional[EvidenceType] = None

        if isinstance(item, dict):
            raw_page = item.get("page_number")
            try:
                page_number = int(raw_page) if raw_page is not None else None
            except (TypeError, ValueError):
                page_number = None
            section_title = _normalize_optional_text(item.get("section_title"))
            quote = _sanitize_quote(item.get("quote"), 300)
            supports = _sanitize_quote(item.get("supports"), 350)
            document_name = _normalize_optional_text(item.get("document_name"))
            evidence_id = _normalize_evidence_id(item.get("evidence_id") or item.get("id"))
            evidence_type = _normalize_evidence_type(item.get("evidence_type") or item.get("type"))

            if not quote:
                quote = _sanitize_quote(item.get("supporting_quote"), 300)
            if not quote:
                quote = _sanitize_quote(item.get("excerpt"), 300)
            if not supports:
                supports = _sanitize_quote(item.get("why_it_matters"), 350)
        else:
            cleaned = _clean_legacy_text(str(item or ""))
            if not cleaned:
                continue
            page_number = _extract_page_number(cleaned)
            section_title = _extract_section_title(cleaned)
            quote = _derive_quote_from_legacy(cleaned)
            supports = _derive_supports_from_legacy(cleaned)
            evidence_type = _infer_evidence_type(quote, supports, None)

        if not quote and not supports:
            continue
        evidence_type = _infer_evidence_type(quote, supports, evidence_type)

        key = (page_number, section_title, quote, supports, document_name, evidence_id, evidence_type)
        if key in seen:
            continue
        seen.add(key)

        normalized.append(
            {
                "page_number": page_number,
                "section_title": section_title,
                "quote": quote,
                "supports": supports,
                "document_name": document_name,
                "evidence_id": evidence_id,
                "evidence_type": evidence_type,
            }
        )

    return normalized


def evidence_item_to_legacy_snippet(item: Dict[str, Any]) -> str:
    normalized = normalize_evidence_items([item])
    if not normalized:
        return ""

    evidence = normalized[0]
    prefix = f"[{evidence['document_name']}] " if evidence.get("document_name") else ""
    evidence_kind = "Cross-reference" if evidence.get("evidence_type") == "cross_reference" else None
    source = evidence.get("section_title") or "Source"
    page_part = f" • p.{evidence['page_number']}" if evidence.get("page_number") is not None else ""
    quote = evidence.get("quote") or ""
    supports = evidence.get("supports") or ""
    snippet_prefix = f"{evidence_kind} • " if evidence_kind else ""
    snippet = f"{prefix}{snippet_prefix}{source}{page_part}:"
    if quote:
        snippet += f' "{quote}"'
    elif supports:
        snippet += f" {supports}"
    if supports:
        snippet += f" — {supports}"
    return snippet
