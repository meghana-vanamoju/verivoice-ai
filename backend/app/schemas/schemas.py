"""Pydantic schemas for VeriVoice AI API contract."""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, validator


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class FindingSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class DetectorStatus(str, Enum):
    not_configured = "not_configured"
    completed = "completed"
    failed = "failed"


class FindingCode(str, Enum):
    urgent_action = "urgent_action"
    money_transfer = "money_transfer"
    credential_request = "credential_request"
    secrecy = "secrecy"
    changed_details = "changed_details"
    identity_uncertainty = "identity_uncertainty"


class VerificationGuidanceCode(str, Enum):
    independent_contact = "independent_contact"


class AudioBaseModel(BaseModel):
    valid: bool = Field(
        ..., description="Technical audio validation succeeded; does not mean speaker is authentic"
    )
    format: str = Field(..., description="Detected format, e.g. WAV")
    duration_sec: float = Field(..., ge=0, description="Measured duration in seconds")
    sample_rate_hz: int = Field(
        ..., ge=1, description="Sample rate in Hz"
    )
    channel_count: int = Field(
        ...,
        ge=1,
        description=(
            "Number of audio channels. No upper bound is enforced: the "
            "audio-validation module accepts unusual channel counts rather "
            "than failing a technically valid WAV."
        ),
    )
    warnings: list[str] = Field(
        default_factory=list, description="List of technical warnings"
    )
    deepfake_detection: "DetectorStatusModel" = Field(
        ..., description="Deepfake detection status and results"
    )

    class Config:
        json_encoders = {}


class DetectorStatusModel(BaseModel):
    status: DetectorStatus = Field(
        ..., description="One of: not_configured, completed, failed"
    )
    score: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Detector score if available; null when not configured/available",
    )
    label: Optional[str] = Field(
        None, description="Detector label if available; 'unknown' when not configured/available"
    )

    class Config:
        json_encoders = {}


class FindingBaseModel(BaseModel):
    code: FindingCode = Field(
        ..., description="Stable finding code"
    )
    category: str = Field(
        ..., description="Category of the finding"
    )
    severity: FindingSeverity = Field(
        ..., description="low | medium | high"
    )
    title: str = Field(
        ..., description="Human-readable title"
    )
    evidence: str = Field(
        ..., description="Description of the evidence supporting this finding"
    )
    source: Literal["contextual_analysis", "technical_validation"] = Field(
        ...,
        description="Source of the finding: 'contextual_analysis' or 'technical_validation'",
    )
    confidence: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Confidence score 0-1, or null if not applicable",
    )

    class Config:
        json_encoders = {}


class VerificationGuidanceBaseModel(BaseModel):
    code: VerificationGuidanceCode = Field(
        ..., description="Action code, e.g. independent_contact"
    )
    priority: RiskLevel = Field(
        ..., description="low | medium | high"
    )
    message: str = Field(
        ..., description="Human-readable guidance message"
    )

    class Config:
        json_encoders = {}


class RiskBaseModel(BaseModel):
    score: int = Field(
        ..., ge=0, le=100, description="Heuristic warning indicator 0-100"
    )
    level: RiskLevel = Field(
        ..., description="low (0-33), medium (34-66), high (67-100)"
    )
    basis: str = Field(
        ..., description="Summary of the basis for the risk assessment"
    )
    summary: str = Field(
        ..., description="Human-readable summary"
    )

    class Config:
        json_encoders = {}


class AnalysisResponseBaseModel(BaseModel):
    analysis_id: str = Field(
        ..., description="Unique identifier for this analysis session (UUID string)"
    )
    status: Literal["completed", "failed"] = Field(
        ..., description="Analysis status"
    )
    risk: RiskBaseModel = Field(
        ..., description="Risk assessment"
    )
    audio: AudioBaseModel = Field(
        ..., description="Audio validation metadata"
    )
    findings: list[FindingBaseModel] = Field(
        default_factory=list,
        description="List of stable finding codes",
    )
    verification_guidance: VerificationGuidanceBaseModel = Field(
        ..., description="Verification guidance"
    )
    limitations: list[str] = Field(
        default_factory=list,
        description="Explicit limitations of the system",
    )

    class Config:
        json_encoders = {}


class ErrorDetailModel(BaseModel):
    code: str = Field(
        ..., description="Machine-readable error code"
    )
    message: str = Field(
        ..., description="Human-readable explanation"
    )
    details: Optional[object] = Field(
        None,
        description="Optional additional detail; always null in baseline contract",
    )

    class Config:
        json_encoders = {}