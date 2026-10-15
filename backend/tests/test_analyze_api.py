"""Tests for POST /api/v1/analyze (Milestone 3 integration)."""

from __future__ import annotations

import io
import wave
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.audio_validation import (
    MAX_AUDIO_SIZE_BYTES,
    MAX_AUDIO_DURATION_SECONDS,
)
from app.services.analysis_service import risk_level_for_score
from app.schemas.schemas import RiskLevel

client = TestClient(app)

BENIGN_CONTEXT = "The team meeting is scheduled for next Tuesday."

HIGH_RISK_CONTEXT = (
    "Urgent, send the funds immediately. Keep this secret. "
    "Tell me your password and verification code. Use the new account."
)


def _make_wav_bytes(
    duration_sec: float = 2.0,
    sample_rate: int = 8000,
    channels: int = 1,
    sampwidth: int = 2,
) -> bytes:
    """Build a small synthetic WAV (silence) in memory."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sampwidth)
        wav.setframerate(sample_rate)
        n_frames = int(duration_sec * sample_rate * channels)
        wav.writeframes(b"\x00\x00" * n_frames if sampwidth == 2 else b"\x00" * n_frames)
    return buffer.getvalue()


def _post(
    audio: bytes | None = None,
    context: str | None = None,
    transcript: str | None = None,
    language: str | None = None,
    audio_name: str = "sample.wav",
):
    """POST a multipart /api/v1/analyze request; None means the field is omitted."""
    data: dict[str, str] = {}
    if context is not None:
        data["context"] = context
    if transcript is not None:
        data["transcript"] = transcript
    if language is not None:
        data["language"] = language

    if audio is None:
        return client.post("/api/v1/analyze", data=data)

    files = {"audio": (audio_name, io.BytesIO(audio), "audio/wav")}
    return client.post("/api/v1/analyze", files=files, data=data)


# ---------------------------------------------------------------------------
# Health endpoint preserved
# ---------------------------------------------------------------------------
class TestHealthPreserved:
    def test_health_still_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Successful analysis
# ---------------------------------------------------------------------------
class TestSuccessfulAnalysis:
    def test_valid_request_returns_200_and_contract_shape(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), BENIGN_CONTEXT)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "analysis_id",
            "status",
            "risk",
            "audio",
            "findings",
            "verification_guidance",
            "limitations",
        }
        # analysis_id is a valid UUID
        UUID(body["analysis_id"])
        assert body["status"] == "completed"

    def test_benign_context_yields_low_risk_and_no_findings(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), BENIGN_CONTEXT)
        body = response.json()

        assert body["risk"]["score"] == 0
        assert body["risk"]["level"] == "low"
        assert body["findings"] == []
        assert body["verification_guidance"]["code"] == "independent_contact"
        assert body["verification_guidance"]["message"]

    def test_audio_metadata_is_populated_from_validated_wav(self):
        response = _post(
            _make_wav_bytes(duration_sec=2.0, sample_rate=16000, channels=2),
            BENIGN_CONTEXT,
        )
        audio = response.json()["audio"]

        assert set(audio) == {
            "valid",
            "format",
            "duration_sec",
            "sample_rate_hz",
            "channel_count",
            "warnings",
            "deepfake_detection",
        }
        assert audio["valid"] is True
        assert audio["format"] == "WAV"
        assert audio["sample_rate_hz"] == 16000
        assert audio["channel_count"] == 2
        assert 1.9 <= audio["duration_sec"] <= 2.1
        # The shared fixture is digital silence by construction (all-zero
        # frames), so the silence heuristic must report exactly this warning.
        assert audio["warnings"] == ["silent_or_very_quiet_audio"]

    def test_contextual_signals_map_to_contract_finding_codes(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), HIGH_RISK_CONTEXT)
        body = response.json()

        assert body["risk"]["score"] == 100
        assert body["risk"]["level"] == "high"
        assert [f["code"] for f in body["findings"]] == [
            "urgent_action",
            "secrecy",
            "credential_request",
            "money_transfer",
            "changed_details",
        ]

        for finding in body["findings"]:
            assert set(finding) == {
                "code",
                "category",
                "severity",
                "title",
                "evidence",
                "source",
                "confidence",
            }
            assert finding["source"] == "contextual_analysis"
            assert finding["category"] in {"behavioral", "financial", "identity"}
            assert finding["severity"] in {"low", "medium", "high"}
            assert finding["title"]
            assert finding["evidence"]

    def test_risk_object_uses_contract_field_names(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), HIGH_RISK_CONTEXT)
        risk = response.json()["risk"]

        assert set(risk) == {"score", "level", "basis", "summary"}
        assert isinstance(risk["score"], int)
        assert 0 <= risk["score"] <= 100
        assert isinstance(risk["basis"], str) and risk["basis"]
        assert isinstance(risk["summary"], str) and risk["summary"]

    def test_technical_warning_is_reflected_in_risk_basis(self):
        # 118 s is within the limit but triggers the near-limit warning.
        response = _post(_make_wav_bytes(duration_sec=118.0), BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 200
        assert "audio_duration_near_limit" in body["audio"]["warnings"]
        assert body["risk"]["basis"] == "contextual_indicators + technical_anomalies"

    def test_limitations_are_included_and_cover_authenticity(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), BENIGN_CONTEXT)
        limitations = response.json()["limitations"]

        assert isinstance(limitations, list) and limitations
        assert all(isinstance(item, str) for item in limitations)
        assert any("speaker authenticity" in item for item in limitations)
        assert any("not a calibrated probability" in item for item in limitations)

    def test_misleading_filename_still_validates_actual_contents(self):
        response = _post(
            _make_wav_bytes(duration_sec=1.0),
            BENIGN_CONTEXT,
            audio_name="notes.txt",
        )
        assert response.status_code == 200
        assert response.json()["audio"]["valid"] is True

    def test_duration_at_limit_is_accepted(self):
        exactly_limit = float(MAX_AUDIO_DURATION_SECONDS)
        response = _post(
            _make_wav_bytes(duration_sec=exactly_limit, sample_rate=8000),
            BENIGN_CONTEXT,
        )
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Optional inputs
# ---------------------------------------------------------------------------
class TestOptionalInputs:
    def test_transcript_is_analyzed_in_addition_to_context(self):
        response = _post(
            _make_wav_bytes(duration_sec=1.0),
            context="A supplier called about an invoice.",
            transcript="Please wire the funds immediately.",
        )
        body = response.json()

        assert response.status_code == 200
        codes = [f["code"] for f in body["findings"]]
        assert "money_transfer" in codes
        assert "urgent_action" in codes
        assert body["risk"]["score"] >= 34  # 15 + 30

    def test_language_is_accepted_but_does_not_change_the_response_contract(self):
        with_language = _post(
            _make_wav_bytes(duration_sec=1.0),
            BENIGN_CONTEXT,
            language="en-US",
        )
        without_language = _post(_make_wav_bytes(duration_sec=1.0), BENIGN_CONTEXT)

        assert with_language.status_code == 200
        assert set(with_language.json()) == set(without_language.json())

    def test_empty_optional_fields_are_accepted(self):
        response = _post(
            _make_wav_bytes(duration_sec=1.0),
            BENIGN_CONTEXT,
            transcript="",
            language="",
        )
        assert response.status_code == 200
        assert response.json()["findings"] == []


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------
class TestRequestValidationErrors:
    def test_missing_audio_returns_422_missing_field(self):
        response = _post(context=BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 422
        assert body["error"]["code"] == "missing_field"
        assert "audio" in body["error"]["message"].lower()

    def test_missing_context_returns_422_missing_field(self):
        response = _post(_make_wav_bytes(duration_sec=1.0), context=None)
        body = response.json()

        assert response.status_code == 422
        assert body["error"]["code"] == "missing_field"
        assert "context" in body["error"]["message"].lower()

    @pytest.mark.parametrize("context", ["", "   ", "\n\t "])
    def test_blank_context_is_rejected(self, context):
        response = _post(_make_wav_bytes(duration_sec=1.0), context=context)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "missing_field"

    def test_empty_audio_file_returns_422_missing_field(self):
        response = _post(b"", BENIGN_CONTEXT)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "missing_field"


# ---------------------------------------------------------------------------
# Audio errors
# ---------------------------------------------------------------------------
class TestAudioErrors:
    def test_non_wav_bytes_return_415_unsupported_format(self):
        response = _post(b"this is definitely not audio", BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 415
        assert body["error"]["code"] == "unsupported_format"

    def test_riff_but_not_wave_returns_415(self):
        payload = b"RIFF\x24\x00\x00\x00AVI LIST" + b"\x00" * 16
        response = _post(payload, BENIGN_CONTEXT)

        assert response.status_code == 415
        assert response.json()["error"]["code"] == "unsupported_format"

    def test_truncated_wav_returns_400_malformed_audio(self):
        full = _make_wav_bytes(duration_sec=0.1)
        response = _post(full[:10], BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 400
        assert body["error"]["code"] == "malformed_audio"

    def test_oversize_upload_returns_413(self):
        oversized = b"x" * (MAX_AUDIO_SIZE_BYTES + 1)
        response = _post(oversized, BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 413
        assert body["error"]["code"] == "limit_exceeded"
        assert "maximum size" in body["error"]["message"]

    def test_over_duration_returns_413(self):
        too_long = _make_wav_bytes(duration_sec=MAX_AUDIO_DURATION_SECONDS + 1)
        response = _post(too_long, BENIGN_CONTEXT)
        body = response.json()

        assert response.status_code == 413
        assert body["error"]["code"] == "limit_exceeded"
        assert "maximum of" in body["error"]["message"]

    @pytest.mark.parametrize("status", [400, 413, 415, 422])
    def test_error_envelope_shape(self, status):
        """Every error uses {"error": {code, message, details}}."""
        if status == 400:
            response = _post(_make_wav_bytes(duration_sec=0.1)[:10], BENIGN_CONTEXT)
        elif status == 413:
            response = _post(b"x" * (MAX_AUDIO_SIZE_BYTES + 1), BENIGN_CONTEXT)
        elif status == 415:
            response = _post(b"not audio at all", BENIGN_CONTEXT)
        else:
            response = _post(context=BENIGN_CONTEXT)

        assert response.status_code == status
        body = response.json()
        assert set(body) == {"error"}
        assert set(body["error"]) == {"code", "message", "details"}
        assert isinstance(body["error"]["code"], str)
        assert isinstance(body["error"]["message"], str)
        assert body["error"]["details"] is None


# ---------------------------------------------------------------------------
# Detector semantics
# ---------------------------------------------------------------------------
class TestDetectorSemantics:
    def test_detector_is_always_not_configured(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), HIGH_RISK_CONTEXT)
        detection = response.json()["audio"]["deepfake_detection"]

        assert detection["status"] == "not_configured"
        assert detection["score"] is None
        assert detection["label"] == "unknown"

    def test_valid_audio_does_not_claim_speaker_authenticity(self):
        response = _post(_make_wav_bytes(duration_sec=2.0), BENIGN_CONTEXT)
        body = response.json()

        # Technically valid WAV...
        assert body["audio"]["valid"] is True
        assert body["risk"]["level"] == "low"
        # ...but no detector ran and nothing asserts the voice is genuine.
        assert body["audio"]["deepfake_detection"]["status"] == "not_configured"
        assert body["audio"]["deepfake_detection"]["score"] is None
        assert body["audio"]["deepfake_detection"]["label"] == "unknown"


# ---------------------------------------------------------------------------
# Internal errors
# ---------------------------------------------------------------------------
class TestInternalErrorHandling:
    def test_unexpected_error_returns_500_without_leaking_details(self, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("SECRET-INTERNAL-DETAIL /tmp/secret/path")

        monkeypatch.setattr(
            "app.services.analysis_service.analyze_context", boom
        )

        # raise_server_exceptions=False lets the registered 500 handler respond.
        quiet_client = TestClient(app, raise_server_exceptions=False)
        response = quiet_client.post(
            "/api/v1/analyze",
            files={"audio": ("s.wav", io.BytesIO(_make_wav_bytes(1.0)), "audio/wav")},
            data={"context": BENIGN_CONTEXT},
        )
        body = response.json()

        assert response.status_code == 500
        assert body["error"]["code"] == "internal_error"
        text = response.text
        assert "SECRET-INTERNAL-DETAIL" not in text
        assert "Traceback" not in text
        assert "/tmp/secret/path" not in text

    def test_unmapped_context_finding_code_is_not_silently_dropped(self, monkeypatch):
        def unknown_code(*args, **kwargs):
            return {
                "findings": [{"code": "SOME_NEW_RULE", "title": "New", "evidence": ["x"], "score": 10}],
                "score": 10,
                "level": "low",
                "guidance": ["Verify through a known channel."],
            }

        monkeypatch.setattr(
            "app.services.analysis_service.analyze_context", unknown_code
        )

        response = _post(_make_wav_bytes(duration_sec=1.0), BENIGN_CONTEXT)
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"


# ---------------------------------------------------------------------------
# Risk band mapping
# ---------------------------------------------------------------------------
class TestRiskBands:
    @pytest.mark.parametrize(
        ("score", "expected"),
        [
            (0, RiskLevel.low),
            (33, RiskLevel.low),
            (34, RiskLevel.medium),
            (66, RiskLevel.medium),
            (67, RiskLevel.high),
            (100, RiskLevel.high),
        ],
    )
    def test_band_boundaries(self, score, expected):
        assert risk_level_for_score(score) == expected
