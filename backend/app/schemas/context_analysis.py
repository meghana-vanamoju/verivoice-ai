"""Request and response models for contextual risk analysis."""

from typing import Literal

from pydantic import BaseModel


class ContextAnalysisRequest(BaseModel):
    context: str
    transcript: str | None = None


class ContextFinding(BaseModel):
    code: str
    title: str
    evidence: list[str]
    score: int


class ContextAnalysisResponse(BaseModel):
    findings: list[ContextFinding]
    score: int
    level: Literal["low", "moderate", "high", "critical"]
    guidance: list[str]
