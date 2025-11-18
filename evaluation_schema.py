"""Shared structured-output schemas for ISO requirement evaluations."""

from typing import List, Literal

from pydantic import BaseModel, ConfigDict


class RequirementEvaluationSchema(BaseModel):
    """Pydantic model used to enforce structured LLM outputs."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["PASS", "FAIL", "FLAGGED", "NOT_APPLICABLE"]
    confidence: Literal["low", "medium", "high"]
    rationale: str
    evidence: List[str]
    gaps: List[str]
    recommendations: List[str]
