"""Orchestrates the ``POST /api/v1/analyze`` flow and maps results onto the
API contract in ``docs/api/API_CONTRACT.md``.

The flow is deliberately split so the audio-validation and context-risk modules
keep their own responsibilities:

1. ``audio_validation.analyze_audio_file`` validates the uploaded bytes.
2. ``context_service.analyze_context`` (context-risk module) scores the text.
3. This module adapts both into the contract's response shape.

This adapter is the only place that translates between the context-risk module's
vocabulary and the contract's stable field names and code sets.
"""

from __future__ import annotations

import uuid
from typing import Any, Mapping

from ..core.errors import ApiError
from ..schemas.schemas import (
    AnalysisResponseBaseModel,
    FindingBaseModel,
    FindingCode,
    FindingSeverity,
    RiskBaseModel,
    RiskLevel,
    VerificationGuidanceBaseModel,
    VerificationGuidanceCode,
)
from .audio_validation import analyze_audio_file
from .context_service import analyze_context

# --- Contract risk bands: low 0-33, medium 34-66, high 67-100 -----------------
LOW_BAND_MAX = 33
MEDIUM_BAND_MAX = 66

# Contract limitations, stated verbatim so every response carries them.
_BASE_LIMITATIONS = (
    "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    "Contextual indicators are heuristic warnings, not proof of impersonation or fraud.",
    "Risk score is a heuristic indicator and not a calibrated probability of fraud.",
)

# The detector-specific limitation must match the actual detector status: a
# completed or failed detector must never be described as "not configured",
# and a failure must never read as evidence of genuine audio.
_DETECTOR_LIMITATIONS = {
    "not_configured": (
        "No deepfake detector is currently configured; results should not be "
        "interpreted as detector output."
    ),
    "completed": (
        "A deepfake detector ran and produced an uncalibrated spoof-likelihood "
        "score; this is not proof that the voice is genuine or cloned."
    ),
    "failed": (
        "The deepfake detector failed to run; the absence of detector output is "
        "not evidence that the voice is genuine."
    ),
}

# Retained for backward compatibility with callers/tests that import the
# default (no detector configured) limitation list.
ANALYSIS_LIMITATIONS = (
    _BASE_LIMITATIONS[0],
    _BASE_LIMITATIONS[1],
    _DETECTOR_LIMITATIONS["not_configured"],
    _BASE_LIMITATIONS[2],
)


def limitations_for_detector_status(status: str) -> list[str]:
    """Return the contract limitations reflecting the actual detector status."""
    key = getattr(status, "value", status)
    detector_limitation = _DETECTOR_LIMITATIONS.get(
        key, _DETECTOR_LIMITATIONS["not_configured"]
    )
    return [
        _BASE_LIMITATIONS[0],
        _BASE_LIMITATIONS[1],
        detector_limitation,
        _BASE_LIMITATIONS[2],
    ]

# Context-risk module code -> contract finding code.
CONTEXT_CODE_TO_FINDING_CODE: dict[str, FindingCode] = {
    "URGENCY": FindingCode.urgent_action,
    "SECRECY": FindingCode.secrecy,
    "CREDENTIAL_REQUEST": FindingCode.credential_request,
    "MONEY_TRANSFER": FindingCode.money_transfer,
    "PAYMENT_DETAILS_CHANGED": FindingCode.changed_details,
}

# Contract category and severity per finding code (contract "Example Finding Codes").
FINDING_CODE_CATEGORY: dict[FindingCode, str] = {
    FindingCode.urgent_action: "behavioral",
    FindingCode.secrecy: "behavioral",
    FindingCode.credential_request: "identity",
    FindingCode.identity_uncertainty: "identity",
    FindingCode.money_transfer: "financial",
    FindingCode.changed_details: "financial",
}

FINDING_CODE_SEVERITY: dict[FindingCode, FindingSeverity] = {
    FindingCode.urgent_action: FindingSeverity.high,
    FindingCode.credential_request: FindingSeverity.high,
    FindingCode.money_transfer: FindingSeverity.high,
    FindingCode.secrecy: FindingSeverity.medium,
    FindingCode.changed_details: FindingSeverity.medium,
    FindingCode.identity_uncertainty: FindingSeverity.medium,
}

# The contract's documented verification guidance; used as a fallback.
_INDEPENDENT_CONTACT_MESSAGE = (
    "Independently contact the supposed sender through a known, trusted phone number "
    "or channel. Do not use contact details provided in the suspicious communication."
)

_TECHNICAL_WARNING_BASIS = " + technical_anomalies"
_CONTEXTUAL_BASIS = "contextual_indicators"


def risk_level_for_score(score: int) -> RiskLevel:
    """Map a 0-100 heuristic score onto the contract's three levels."""
    if score > MEDIUM_BAND_MAX:
        return RiskLevel.high
    if score > LOW_BAND_MAX:
        return RiskLevel.medium
    return RiskLevel.low


def _evidence_text(evidence: Any) -> str:
    """Flatten the context module's evidence list into a single readable string."""
    if isinstance(evidence, str):
        return evidence
    if isinstance(evidence, (list, tuple)):
        return ", ".join(str(item) for item in evidence if str(item).strip())
    return ""


def _finding_from_indicator(indicator: Mapping[str, Any]) -> FindingBaseModel:
    """Map one context-risk indicator onto a contract finding."""
    raw_code = str(indicator.get("code", ""))
    code = CONTEXT_CODE_TO_FINDING_CODE.get(raw_code)
    if code is None:
        # Fail loudly: silently dropping a risk indicator is worse than erroring.
        raise ApiError(
            500,
            "internal_error",
            "An unexpected error occurred while analysing the request.",
        )

    return FindingBaseModel(
        code=code,
        category=FINDING_CODE_CATEGORY[code],
        severity=FINDING_CODE_SEVERITY[code],
        title=str(indicator.get("title") or code.value),
        evidence=_evidence_text(indicator.get("evidence")),
        source="contextual_analysis",
        # The context-risk module does not emit confidence, and the contract
        # permits null. It must not be fabricated.
        confidence=None,
    )


def _guidance(
    context_result: Mapping[str, Any], priority: RiskLevel
) -> VerificationGuidanceBaseModel:
    """Collapse the context module's guidance list into the contract's single object."""
    raw = context_result.get("guidance") or []
    if isinstance(raw, str):
        raw = [raw]
    messages = [str(item).strip() for item in raw if str(item).strip()]
    message = " ".join(messages) if messages else _INDEPENDENT_CONTACT_MESSAGE
    return VerificationGuidanceBaseModel(
        code=VerificationGuidanceCode.independent_contact,
        priority=priority,
        message=message,
    )


def _audio_payload(audio_result: Any) -> dict[str, Any]:
    """Copy audio metadata into the contract's field names."""
    detection = audio_result.deepfake_detection
    return {
        "valid": audio_result.valid,
        "format": audio_result.format,
        "duration_sec": audio_result.duration_sec,
        "sample_rate_hz": audio_result.sample_rate_hz,
        "channel_count": audio_result.channel_count,
        "warnings": list(audio_result.warnings),
        "deepfake_detection": {
            "status": detection.status,
            "score": detection.score,
            "label": detection.label,
        },
    }


def _risk_summary(level: RiskLevel, findings: list[FindingBaseModel]) -> str:
    """Compose a human-readable summary from the detected findings."""
    if findings:
        listed = ", ".join(finding.title for finding in findings)
        return f"{level.value.capitalize()} risk indicators detected: {listed}."
    return "No contextual risk indicators were detected."


def run_analysis(
    audio_bytes: bytes,
    context: str,
    transcript: str | None = None,
    language: str | None = None,
) -> AnalysisResponseBaseModel:
    """Run audio validation and contextual risk analysis for one request.

    Raises :class:`ApiError` with the contract's code and HTTP status when the
    audio is invalid. ``language`` is accepted for interface stability but is not
    used by the current context-risk module; it is not a claim about the audio.
    """
    audio_result, audio_error = analyze_audio_file(audio_bytes)
    if audio_error is not None:
        raise ApiError(
            audio_error["status"],
            audio_error["error"]["code"],
            audio_error["error"]["message"],
            audio_error["error"].get("details"),
        )

    context_result = analyze_context(context, transcript)

    score = int(context_result.get("score", 0))
    score = max(0, min(100, score))
    level = risk_level_for_score(score)
    findings = [_finding_from_indicator(item) for item in context_result.get("findings", [])]

    basis = _CONTEXTUAL_BASIS
    if audio_result.warnings:
        basis = basis + _TECHNICAL_WARNING_BASIS

    detector_status = audio_result.deepfake_detection.status.value

    return AnalysisResponseBaseModel(
        analysis_id=str(uuid.uuid4()),
        status="completed",
        risk=RiskBaseModel(
            score=score,
            level=level,
            basis=basis,
            summary=_risk_summary(level, findings),
        ),
        audio=_audio_payload(audio_result),
        findings=findings,
        verification_guidance=_guidance(context_result, level),
        limitations=limitations_for_detector_status(detector_status),
    )
