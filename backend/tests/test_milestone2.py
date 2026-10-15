"""Tests for VeriVoice AI backend – Milestone 2."""

from __future__ import annotations

from uuid import UUID

import pytest

# Import FastAPI app and TestClient (requires httpx)
try:
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    HAS_TESTCLIENT = True
except Exception as e:  # pragma: no cover
    TestClient = None  # type: ignore
    app = None  # type: ignore
    client = None  # type: ignore
    HAS_TESTCLIENT = False  # pragma: no cover
    _import_error = e  # pragma: no cover


# ---------------------------------------------------------------------------
# Schema import(s)
# ---------------------------------------------------------------------------
from app.schemas.schemas import (
    RiskLevel,
    FindingSeverity,
    DetectorStatus,
    FindingCode,
    VerificationGuidanceCode,
    AudioBaseModel,
    DetectorStatusModel,
    FindingBaseModel,
    VerificationGuidanceBaseModel,
    RiskBaseModel,
    AnalysisResponseBaseModel,
    ErrorDetailModel,
)


# ---------------------------------------------------------------------------
# Helper: synthetic valid audio dict
# ---------------------------------------------------------------------------
VALID_AUDIO = AudioBaseModel(
    valid=True,
    format="WAV",
    duration_sec=58.3,
    sample_rate_hz=44100,
    channel_count=2,
    warnings=[],
    deepfake_detection=DetectorStatusModel(
        status=DetectorStatus.not_configured,
        score=None,
        label="unknown",  # type: ignore[arg-type]  # validator sets this for not_configured
    ),
)

VALID_FINDING = FindingBaseModel(
    code=FindingCode.urgent_action,
    category="behavioral",
    severity=FindingSeverity.high,
    title="Urgent action requested",
    evidence="The caller pressures the recipient to act immediately without verification.",
    source="contextual_analysis",
    confidence=0.87,
)

VALID_RISK = RiskBaseModel(
    score=72,
    level=RiskLevel.high,
    basis="contextual_indicators + technical_anomalies",
    summary="High-risk indicators detected",
)

VALID_VG = VerificationGuidanceBaseModel(
    code=VerificationGuidanceCode.independent_contact,
    priority=RiskLevel.high,
    message="Independently contact the supposed sender through a known, trusted phone number or channel.",
)

VALID_ANALYSIS = AnalysisResponseBaseModel(
    analysis_id="c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
    status="completed",
    risk=VALID_RISK,
    audio=VALID_AUDIO,
    findings=[VALID_FINDING],
    verification_guidance=VALID_VG,
    limitations=[
        "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    ],
)


# ---------------------------------------------------------------------------
# 1. Health endpoint
# ---------------------------------------------------------------------------
class TestHealth:
    """GET /health returns HTTP 200 and valid JSON."""

    def test_health_returns_200(self):  # type: ignore[no-redef]
        if not HAS_TESTCLIENT:
            pytest.skip("TestClient not available – install httpx/starlette")
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_returns_valid_json(self):  # type: ignore[no-redef]
        if not HAS_TESTCLIENT:
            pytest.skip("TestClient not available")
        response = client.get("/health")
        assert response.headers["content-type"] == "application/json"


# ---------------------------------------------------------------------------
# 2. Schema validation tests (no TestClient needed)
# ---------------------------------------------------------------------------
class TestSchemas:
    """Pydantic schema validation for contract types."""

    def test_risk_score_boundaries(self):  # type: ignore[no-redef]
        """Risk score 0 and 100 are accepted; out-of-range are rejected."""
        low = RiskBaseModel(score=0, level=RiskLevel.low, basis="low", summary="lo")
        high = RiskBaseModel(score=100, level=RiskLevel.high, basis="high", summary="hi")
        assert low.score == 0
        assert high.score == 100

        # Scores outside 0–100 should raise a validation error
        with pytest.raises(Exception):  # ValidationError
            RiskBaseModel(score=-1, level=RiskLevel.low, basis="low", summary="lo")
        with pytest.raises(Exception):  # ValidationError
            RiskBaseModel(score=101, level=RiskLevel.high, basis="high", summary="hi")

    def test_risk_level_enum(self):  # type: ignore[no-redef]
        """Only low/medium/high are accepted as risk levels."""
        for level in RiskLevel:
            r = RiskBaseModel(score=50, level=level, basis="b", summary="s")
            assert r.level == level

    def test_risk_level_out_of_range_rejected(self):  # type: ignore[no-redef]
        """A non-enum value for level should be rejected."""
        with pytest.raises(Exception):  # ValidationError
            RiskBaseModel(score=50, level="invalid", basis="b", summary="s")  # type: ignore[arg-type]

    def test_confidence_bounded_present(self):  # type: ignore[no-redef]
        """Confidence in [0, 1] is accepted when present."""
        f = FindingBaseModel(
            code=FindingCode.urgent_action,
            category="behavioral",
            severity=FindingSeverity.high,
            title="Test",
            evidence="Evidence",
            source="contextual_analysis",
            confidence=0.5,
        )
        assert f.confidence == 0.5

    def test_confidence_null_is_accepted(self):  # type: ignore[no-redef]
        """Confidence=None is accepted."""
        f = FindingBaseModel(
            code=FindingCode.urgent_action,
            category="behavioral",
            severity=FindingSeverity.high,
            title="Test",
            evidence="Evidence",
            source="contextual_analysis",
            confidence=None,
        )
        assert f.confidence is None

    def test_confidence_out_of_range_rejected(self):  # type: ignore[no-redef]
        """Confidence outside [0, 1] is rejected when present."""
        with pytest.raises(Exception):  # ValidationError
            FindingBaseModel(
                code=FindingCode.urgent_action,
                category="behavioral",
                severity=FindingSeverity.high,
                title="Test",
                evidence="Evidence",
                source="contextual_analysis",
                confidence=1.5,  # type: ignore[arg-type]
            )

    def test_detector_not_configured_defaults(self):  # type: ignore[no-redef]
        """When status is not_configured, score must be None and label must be 'unknown'."""
        ds = DetectorStatusModel(
            status=DetectorStatus.not_configured,
            score=None,
            label="unknown",
        )
        assert ds.status == DetectorStatus.not_configured
        assert ds.score is None
        assert ds.label == "unknown"

    def test_detector_completed_with_score(self):  # type: ignore[no-redef]
        """When status is completed, score and label should be set."""
        ds = DetectorStatusModel(
            status=DetectorStatus.completed,
            score=0.95,
            label="likely_deepfake",
        )
        assert ds.status == DetectorStatus.completed
        assert ds.score == 0.95
        assert ds.label == "likely_deepfake"

    def test_audio_validity_meaning(self):  # type: ignore[no-redef]
        """audio.valid=True means technical validation passed, not speaker authenticity."""
        audio = AudioBaseModel(
            valid=True,
            format="WAV",
            duration_sec=30.0,
            sample_rate_hz=44100,
            channel_count=1,
            warnings=[],
            deepfake_detection=DetectorStatusModel(
                status=DetectorStatus.not_configured,
                score=None,
                label="unknown",
            ),
        )
        assert audio.valid is True
        assert audio.deepfake_detection.status == DetectorStatus.not_configured
        assert audio.deepfake_detection.score is None
        assert audio.deepfake_detection.label == "unknown"

    def test_finding_code_enum(self):  # type: ignore[no-redef]
        """Only defined finding codes are accepted."""
        for code in FindingCode:
            f = FindingBaseModel(
                code=code,
                category="test",
                severity=FindingSeverity.medium,
                title="Test",
                evidence="Evidence",
                source="contextual_analysis",
            )
            assert f.code == code

    def test_finding_invalid_code_rejected(self):  # type: ignore[no-redef]
        """An invalid finding code should be rejected."""
        with pytest.raises(Exception):  # ValidationError
            FindingBaseModel(
                code="invalid_code",  # type: ignore[arg-type]
                category="test",
                severity=FindingSeverity.medium,
                title="Test",
                evidence="Evidence",
                source="contextual_analysis",
            )

    def test_verification_guidance_fields(self):  # type: ignore[no-redef]
        """Verification guidance has code, priority, and message."""
        vg = VerificationGuidanceBaseModel(
            code=VerificationGuidanceCode.independent_contact,
            priority=RiskLevel.high,
            message="Test message",
        )
        assert vg.code == VerificationGuidanceCode.independent_contact
        assert vg.priority == RiskLevel.high
        assert vg.message == "Test message"

    def test_analysis_response_complete(self):  # type: ignore[no-redef]
        """A full analysis response can be constructed from contract types."""
        assert isinstance(UUID(VALID_ANALYSIS.analysis_id), UUID)
        assert VALID_ANALYSIS.status == "completed"
        assert VALID_ANALYSIS.risk.score == 72
        assert VALID_ANALYSIS.risk.level == RiskLevel.high
        assert len(VALID_ANALYSIS.findings) >= 1
        assert VALID_ANALYSIS.verification_guidance.code == VerificationGuidanceCode.independent_contact
        assert isinstance(VALID_ANALYSIS.limitations, list)

    def test_error_detail_model(self):  # type: ignore[no-redef]
        """Error detail model validates correctly."""
        error = ErrorDetailModel(code="missing_field", message="Required field is missing", details=None)
        assert error.code == "missing_field"
        assert error.message == "Required field is missing"
        assert error.details is None

    def test_error_detail_model_with_details(self):  # type: ignore[no-redef]
        """Error detail model accepts arbitrary details object."""
        error = ErrorDetailModel(
            code="limit_exceeded",
            message="Upload exceeds maximum size",
            details={"max_mb": 15, "uploaded_mb": 16},
        )
        assert error.code == "limit_exceeded"
        assert error.details == {"max_mb": 15, "uploaded_mb": 16}


# ---------------------------------------------------------------------------
# 3. Boundary / integration tests
# ---------------------------------------------------------------------------
class TestBoundaries:
    """Risk score and level threshold boundaries."""

    def test_score_33_is_low(self):  # type: ignore[no-redef]
        r = RiskBaseModel(score=33, level=RiskLevel.low, basis="b", summary="s")
        assert r.level == RiskLevel.low

    def test_score_34_is_medium(self):  # type: ignore[no-redef]
        r = RiskBaseModel(score=34, level=RiskLevel.medium, basis="b", summary="s")
        assert r.level == RiskLevel.medium

    def test_score_66_is_medium(self):  # type: ignore[no-redef]
        r = RiskBaseModel(score=66, level=RiskLevel.medium, basis="b", summary="s")
        assert r.level == RiskLevel.medium

    def test_score_67_is_high(self):  # type: ignore[no-redef]
        r = RiskBaseModel(score=67, level=RiskLevel.high, basis="b", summary="s")
        assert r.level == RiskLevel.high

    def test_score_100_is_high(self):  # type: ignore[no-redef]
        r = RiskBaseModel(score=100, level=RiskLevel.high, basis="b", summary="s")
        assert r.level == RiskLevel.high