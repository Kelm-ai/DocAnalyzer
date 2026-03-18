"""Shared structured-output schemas for ISO requirement evaluations."""

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class RequirementEvidenceSchema(BaseModel):
    """Structured evidence object emitted by the raw evaluator."""

    model_config = ConfigDict(extra="forbid")

    page_number: Optional[int] = None
    section_title: Optional[str] = None
    quote: str
    supports: str
    document_name: Optional[str] = None
    evidence_id: Optional[str] = None
    evidence_type: Optional[Literal["direct_quote", "cross_reference", "visual_or_table"]] = None


class RequirementEvaluationSchema(BaseModel):
    """Pydantic model used to enforce structured LLM outputs."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["PASS", "FAIL", "FLAGGED", "NOT_APPLICABLE"]
    confidence: Literal["low", "medium", "high"]
    rationale: str
    evidence: List[RequirementEvidenceSchema]
    gaps: List[str]
    recommendations: List[str]
