"""Shared structured-output schemas for ISO requirement evaluations."""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict


class EvidenceItem(BaseModel):
    """Structured evidence item with location metadata."""

    text: str
    page: Optional[int] = None
    section: Optional[str] = None
    document_name: Optional[str] = None
    document_index: Optional[int] = None


class RequirementEvaluationSchema(BaseModel):
    """Pydantic model used to enforce structured LLM outputs."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["PASS", "FAIL", "FLAGGED", "NOT_APPLICABLE"]
    confidence: Literal["low", "medium", "high"]
    rationale: str
    evidence: List[Union[EvidenceItem, str]]
    gaps: List[str]
    recommendations: List[str]
