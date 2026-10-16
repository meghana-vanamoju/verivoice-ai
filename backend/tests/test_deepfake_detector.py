"""Tests for the pluggable deepfake detector and its validation integration.

All unit tests use mocked inference (no model weights required). The real
pretrained-weight integration test skips unless VERIVOICE_DETECTOR_MODEL
points at an explicitly downloaded checkpoint.
"""

import io
import os
import wave

import pytest

from app.services import deepfake_detector as dd
from app.services.audio_validation import validate_audio, analyze_audio_file


def _make_wav_bytes(duration_sec=1.0, sample_rate=8000, channels=1):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        n_frames = int(duration_sec * sample_rate)
        wav.writeframes(b"\x00\x01" * n_frames * channels)
    return buffer.getvalue()


@pytest.fixture(autouse=True)
def _clear_detector():
    dd.clear_detector()
    yield
    dd.clear_detector()


def test_no_detector_returns_not_configured():
    out = validate_audio(_make_wav_bytes())
    assert out["valid"] is True
    assert out["deepfake_detection"] == {
        "status": "not_configured",
        "score": None,
        "label": "unknown",
    }


def test_successful_inference_returns_completed():
    dd.set_detector(dd.FnDetector(lambda s, sr: (82.5, "spoof")))
    out = validate_audio(_make_wav_bytes())
    assert out["valid"] is True
    det = out["deepfake_detection"]
    assert det["status"] == "completed"
    assert det["score"] == pytest.approx(82.5)
    assert det["label"] == "spoof"


def test_inference_failure_returns_failed():
    def _boom(samples, sr):
        raise RuntimeError("model exploded")

    dd.set_detector(dd.FnDetector(_boom))
    out = validate_audio(_make_wav_bytes())
    assert out["valid"] is True  # validation independent of detector
    assert out["deepfake_detection"] == {
        "status": "failed",
        "score": None,
        "label": "unknown",
    }


@pytest.mark.parametrize(
    "bad", [(None, "spoof"), (float("nan"), "spoof"), (150.0, "spoof"),
            (42.0, "definitely-fake"), ("high", "spoof")]
)
def test_invalid_model_outputs_return_failed(bad):
    dd.set_detector(dd.FnDetector(lambda s, sr: bad))
    out = validate_audio(_make_wav_bytes())
    assert out["deepfake_detection"]["status"] == "failed"
    assert out["deepfake_detection"]["score"] is None
    assert out["deepfake_detection"]["label"] == "unknown"


def test_detector_not_run_on_invalid_audio():
    calls = []
    dd.set_detector(dd.FnDetector(lambda s, sr: calls.append(1) or (10.0, "bonafide")))
    out = validate_audio(b"not audio at all")
    assert out["valid"] is False
    assert calls == []
    assert out["deepfake_detection"]["status"] == "not_configured"


def test_analyze_audio_file_carries_detector_result():
    dd.set_detector(dd.FnDetector(lambda s, sr: (12.0, "bonafide")))
    result, error = analyze_audio_file(_make_wav_bytes())
    assert error is None
    assert result.deepfake_detection.status == "completed"
    assert result.deepfake_detection.score == pytest.approx(12.0)
    assert result.deepfake_detection.label == "bonafide"


def test_resample_and_prepare_input():
    assert dd.resample_mono([0.0, 1.0], 2, 2) == [0.0, 1.0]
    up = dd.resample_mono([0.0, 1.0], 2, 4)
    assert len(up) == 4 and up[0] == pytest.approx(0.0) and up[-1] == pytest.approx(1.0)
    prepped = dd.prepare_detector_input([0.5] * 16000, 16000, max_seconds=1.0)
    assert len(prepped) == 16000
    cropped = dd.prepare_detector_input([0.5] * 32000, 16000, max_seconds=1.0)
    assert len(cropped) == 16000


def test_set_detector_rejects_invalid_object():
    with pytest.raises(TypeError):
        dd.set_detector(object())


def test_configure_detector_from_env_activates_detector(monkeypatch):
    """VERIVOICE_DETECTOR_MODEL must actually wire the detector at startup.

    Constructing the detector is cheap (weights load lazily), so setting the
    variable should leave a detector configured rather than silently doing
    nothing.
    """
    from app.main import configure_detector_from_env

    monkeypatch.setenv("VERIVOICE_DETECTOR_MODEL", "/nonexistent/checkpoint")
    configure_detector_from_env()
    assert isinstance(dd.get_detector(), dd.HFWav2Vec2Detector)


def test_configure_detector_from_env_unset_leaves_not_configured(monkeypatch):
    from app.main import configure_detector_from_env

    monkeypatch.delenv("VERIVOICE_DETECTOR_MODEL", raising=False)
    configure_detector_from_env()
    assert dd.get_detector() is None


def test_broken_configured_detector_reports_failed_not_genuine():
    """A configured-but-unloadable detector must surface as 'failed'."""
    dd.set_detector(dd.HFWav2Vec2Detector(model_path="/nonexistent/checkpoint"))
    out = validate_audio(_make_wav_bytes())

    assert out["valid"] is True
    assert out["deepfake_detection"]["status"] == "failed"
    assert out["deepfake_detection"]["score"] is None
    assert out["deepfake_detection"]["label"] == "unknown"


def test_real_pretrained_weights_integration():
    """Real-weight integration: runs only with explicit local checkpoint.

    Set VERIVOICE_DETECTOR_MODEL to a previously downloaded HF
    wav2vec2 deepfake checkpoint to execute; otherwise skipped. The
    checkpoint is never downloaded by the test itself.
    """
    model_path = os.environ.get("VERIVOICE_DETECTOR_MODEL", "").strip()
    if not model_path or not os.path.exists(model_path):
        pytest.skip("No local detector checkpoint (VERIVOICE_DETECTOR_MODEL)")
    pytest.importorskip("torch")
    pytest.importorskip("transformers")
    detector = dd.HFWav2Vec2Detector(model_path=model_path)
    dd.set_detector(detector)
    out = validate_audio(_make_wav_bytes(duration_sec=2.0, sample_rate=16000))
    assert out["valid"] is True
    assert out["deepfake_detection"]["status"] == "completed"
