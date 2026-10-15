"""Pluggable voice-deepfake detector interface for VeriVoice AI.

The detector is deliberately separate from basic WAV validation
(:mod:`app.services.audio_validation`): validation must always work even
when no detector is configured, and the detector only runs on audio that
has already passed validation.

Detector contract
-----------------
A detector is any object with::

    detect(samples: list[float], sample_rate_hz: int) -> tuple[float | None, str]

returning ``(score, label)`` where ``score`` is a spoof-likelihood in the
range 0-100 (or ``None`` when no valid result exists) and ``label`` is one
of ``"bonafide"``, ``"spoof"``, ``"unknown"``.

Status mapping used by the audio service:

- ``completed`` — inference succeeded; ``score`` 0-100, ``label`` set.
- ``failed`` — a detector is configured but inference errored or returned
  an invalid result; ``score`` is ``None``, ``label`` is ``"unknown"``.
- ``not_configured`` — no detector set; ``score`` is ``None``.

Score semantics
---------------
The reference implementation
(:class:`HFWav2Vec2Detector`) returns the classifier's probability for the
"fake/spoof" class scaled to 0-100. This is an **uncalibrated
spoof-likelihood, not a reliable probability** that the voice is fake: it
is sensitive to unseen synthesis methods, codecs, noise, and duration, and
must never be presented as proof that a voice is real or fake.

Safety notes
------------
- No weights are downloaded automatically. The HF checkpoint is loaded only
  from an explicit local path or model id passed to
  :func:`configure_hf_detector`, so a large (~360 MB) download never happens
  silently. Checkpoints load via ``transformers`` (safetensors format);
  arbitrary ``torch.load`` of untrusted pickles is never used.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


BONAFIDE_LABEL = "bonafide"
SPOOF_LABEL = "spoof"
UNKNOWN_LABEL = "unknown"

EXPECTED_LABELS = (BONAFIDE_LABEL, SPOOF_LABEL, UNKNOWN_LABEL)

# Long recordings are cropped to this many seconds for inference so a 120 s
# upload cannot cause excessive CPU inference time.
MAX_DETECTOR_SECONDS = 10.0
DETECTOR_SAMPLE_RATE_HZ = 16000


@runtime_checkable
class DeepfakeDetectorProtocol(Protocol):
    """Structural interface for detector implementations."""

    def detect(
        self, samples: list[float], sample_rate_hz: int
    ) -> tuple[float | None, str]:
        """Return (spoof-likelihood 0-100 or None, label)."""
        ...  # pragma: no cover


@dataclass
class FnDetector:
    """Thin wrapper turning a plain function into a detector (for tests)."""

    fn: Any
    name: str = "fn-detector"

    def detect(
        self, samples: list[float], sample_rate_hz: int
    ) -> tuple[float | None, str]:
        return self.fn(samples, sample_rate_hz)


@dataclass
class HFWav2Vec2Detector:
    """Reference detector: HF wav2vec2 audio-classification checkpoint.

    The checkpoint directory (or HF model id, resolved only on explicit
    user action — never downloaded silently) must contain a sequence /
    audio classification model with ``id2label`` mapping to fake/bonafide
    classes plus its feature extractor / processor.

    Preprocessing (per common wav2vec2 deepfake recipes): mono mix-down,
    linear-interpolation resample to 16 kHz, first-``MAX_DETECTOR_SECONDS``
    crop, float32 in [-1, 1].

    Parameters
    ----------
    model_path: local checkpoint dir (or HF id previously cached/downloaded
        explicitly by the operator).
    fake_label_names: label strings treated as the "spoof" class
        (case-insensitive substrings, e.g. ``{"fake", "spoof", "synthetic"}``).
    threshold: spoof-likelihood >= threshold (0-100) is labelled "spoof".
    """

    model_path: str
    fake_label_names: set[str] = field(
        default_factory=lambda: {"fake", "spoof", "synthetic", "generated"}
    )
    threshold: float = 50.0
    _runtime: Any = field(default=None, repr=False, compare=False)

    def _ensure_runtime(self) -> Any:
        if self._runtime is not None:
            return self._runtime
        try:
            from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
        except Exception as exc:
            raise RuntimeError(
                "Detector dependencies (torch, transformers) are not installed."
            ) from exc
        import torch as _torch

        model = AutoModelForAudioClassification.from_pretrained(self.model_path)
        try:
            extractor = AutoFeatureExtractor.from_pretrained(self.model_path)
        except Exception:
            from transformers import Wav2Vec2FeatureExtractor

            extractor = Wav2Vec2FeatureExtractor(sampling_rate=DETECTOR_SAMPLE_RATE_HZ)
        model.eval()
        self._runtime = (model, extractor, _torch)
        return self._runtime

    def _spoof_index(self, id2label: dict[Any, str]) -> int | None:
        for idx, name in id2label.items():
            lowered = str(name).lower()
            if any(key in lowered for key in self.fake_label_names):
                return int(idx)
        return None

    def detect(
        self, samples: list[float], sample_rate_hz: int
    ) -> tuple[float | None, str]:
        model, extractor, torch = self._ensure_runtime()
        if not samples:
            return None, UNKNOWN_LABEL
        processed = prepare_detector_input(
            samples,
            sample_rate_hz,
            target_rate=DETECTOR_SAMPLE_RATE_HZ,
            max_seconds=MAX_DETECTOR_SECONDS,
        )
        inputs = extractor(
            processed, sampling_rate=DETECTOR_SAMPLE_RATE_HZ, return_tensors="pt"
        )
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits[0]
            probs = torch.nn.functional.softmax(logits, dim=-1).tolist()
        id2label = getattr(getattr(model, "config", None), "id2label", None) or {
            0: "bonafide",
            1: "spoof",
        }
        spoof_idx = self._spoof_index(id2label)
        if spoof_idx is None or spoof_idx >= len(probs):
            return None, UNKNOWN_LABEL
        score = float(probs[spoof_idx]) * 100.0
        if not math.isfinite(score) or not 0.0 <= score <= 100.0:
            return None, UNKNOWN_LABEL
        label = SPOOF_LABEL if score >= self.threshold else BONAFIDE_LABEL
        return score, label


# Module-level active detector (None = not configured).
_active_detector: DeepfakeDetectorProtocol | None = None


def get_detector() -> DeepfakeDetectorProtocol | None:
    """Return the active detector, or None when unconfigured."""
    return _active_detector


def set_detector(detector: DeepfakeDetectorProtocol | None) -> None:
    """Install (or clear with None) the active detector.

    Intended for application wiring and unit tests (mocked inference).
    """
    global _active_detector
    if detector is not None and not isinstance(detector, DeepfakeDetectorProtocol):
        raise TypeError("detector must implement DeepfakeDetectorProtocol or be None")
    _active_detector = detector


def configure_hf_detector(model_path: str, **kwargs: Any) -> HFWav2Vec2Detector:
    """Configure the HF wav2vec2 detector from an explicit checkpoint path.

    No download happens here beyond what ``transformers`` resolves for the
    given path; operators must approve/fetch the (~360 MB) weights first.
    """
    if not model_path or not isinstance(model_path, str):
        raise ValueError("model_path must be a non-empty string")
    detector = HFWav2Vec2Detector(model_path=model_path, **kwargs)
    set_detector(detector)
    return detector


def clear_detector() -> None:
    """Remove the active detector (back to ``not_configured``)."""
    set_detector(None)


def detector_from_env() -> HFWav2Vec2Detector | None:
    """Configure from ``VERIVOICE_DETECTOR_MODEL`` when set, else None."""
    model_path = os.environ.get("VERIVOICE_DETECTOR_MODEL", "").strip()
    if not model_path:
        return None
    return configure_hf_detector(model_path)


def resample_mono(samples: list[float], src_rate: int, dst_rate: int) -> list[float]:
    """Linear-interpolation resample (stdlib only, no scipy/librosa needed)."""
    if src_rate == dst_rate or not samples:
        return list(samples)
    if src_rate <= 0 or dst_rate <= 0:
        raise ValueError("sample rates must be positive")
    duration = len(samples) / float(src_rate)
    out_len = max(1, int(round(duration * dst_rate)))
    if len(samples) == 1:
        return [samples[0]] * out_len
    out: list[float] = []
    scale = (len(samples) - 1) / float(max(out_len - 1, 1))
    for i in range(out_len):
        pos = i * scale
        lo = int(pos)
        hi = min(lo + 1, len(samples) - 1)
        frac = pos - lo
        out.append(samples[lo] * (1.0 - frac) + samples[hi] * frac)
    return out


def prepare_detector_input(
    samples: list[float],
    sample_rate_hz: int,
    target_rate: int = DETECTOR_SAMPLE_RATE_HZ,
    max_seconds: float = MAX_DETECTOR_SECONDS,
) -> list[float]:
    """Mono float32 resample + first-N-seconds crop for detector inference."""
    resampled = resample_mono(list(samples), sample_rate_hz, target_rate)
    max_len = max(1, int(max_seconds * target_rate))
    return resampled[:max_len]


def sanitize_detector_output(result: Any) -> tuple[float | None, str]:
    """Validate a raw ``(score, label)`` pair; invalid -> (None, 'unknown')."""
    try:
        score, label = result
    except Exception:
        return None, UNKNOWN_LABEL
    if label not in EXPECTED_LABELS:
        return None, UNKNOWN_LABEL
    if score is None:
        return None, UNKNOWN_LABEL
    try:
        value = float(score)
    except (TypeError, ValueError):
        return None, UNKNOWN_LABEL
    if not math.isfinite(value) or not 0.0 <= value <= 100.0:
        return None, UNKNOWN_LABEL
    return value, label


def run_detector(
    samples: list[float], sample_rate_hz: int
) -> dict[str, Any]:
    """Run the active detector, mapping outcomes to contract statuses.

    Returns ``{"status": ..., "score": ..., "label": ...}`` with
    ``not_configured`` when no detector is set, ``completed`` on success,
    and ``failed`` (score None, label "unknown") on any error/invalid output.
    Never raises and never fabricates a result.
    """
    detector = get_detector()
    if detector is None:
        return {"status": "not_configured", "score": None, "label": UNKNOWN_LABEL}
    try:
        raw = detector.detect(samples, sample_rate_hz)
        score, label = sanitize_detector_output(raw)
        if score is None or label == UNKNOWN_LABEL:
            return {"status": "failed", "score": None, "label": UNKNOWN_LABEL}
        return {"status": "completed", "score": round(score, 3), "label": label}
    except Exception:
        return {"status": "failed", "score": None, "label": UNKNOWN_LABEL}
