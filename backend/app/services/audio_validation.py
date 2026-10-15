"""Audio validation service for VeriVoice AI.

Validates uploaded WAV audio files against technical constraints:
- Maximum file size (15 MB, configurable via MAX_AUDIO_SIZE_MB)
- Maximum duration (120 seconds, configurable via MAX_AUDIO_DURATION_SECONDS)
- Valid WAV file format (validated via ``wave`` module on actual bytes)

Technical validation confirms the file is a readable WAV and reports basic
quality indicators. It does NOT establish whether a voice is genuine or
AI-generated.

Public interfaces:
- :func:`validate_audio` — lightweight dict interface agreed for FastAPI
  integration: ``validate_audio(audio_bytes) -> dict``.
- :func:`analyze_audio_file` — legacy tuple interface returning
  ``(AudioValidationResult | None, error | None)`` per the API contract's
  HTTP error mapping. Preserved for backward compatibility.
"""

import io
import os
import struct
import wave

from pydantic import BaseModel
from typing import Any

from ..schemas.schemas import AudioBaseModel, DetectorStatusModel, DetectorStatus

DEFAULT_MAX_AUDIO_SIZE_MB = 15
DEFAULT_MAX_AUDIO_DURATION_SECONDS = 120

# RIFF/WAVE container magic, used to tell "not a WAV file" (415) apart from
# "claims to be WAVE but cannot be read" (400).
_RIFF_MAGIC = b"RIFF"
_WAVE_MAGIC = b"WAVE"


def _int_from_env(name: str, default: int) -> int:
    """Read a positive integer setting from the environment, falling back safely."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        return default
    return value if value > 0 else default


# Configuration from .env.example (MAX_AUDIO_SIZE_MB / MAX_AUDIO_DURATION_SECONDS).
MAX_AUDIO_SIZE_MB: int = _int_from_env("MAX_AUDIO_SIZE_MB", DEFAULT_MAX_AUDIO_SIZE_MB)
MAX_AUDIO_SIZE_BYTES: int = MAX_AUDIO_SIZE_MB * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS: int = _int_from_env(
    "MAX_AUDIO_DURATION_SECONDS", DEFAULT_MAX_AUDIO_DURATION_SECONDS
)

NEAR_LIMIT_THRESHOLD_SECONDS: float = 115.0
VERY_SHORT_THRESHOLD_SECONDS: float = 0.5

# Quality-analysis constants
_CLIPPING_THRESHOLD_RATIO: float = 0.99  # peak >= 99% of full scale
_SILENCE_THRESHOLD_RATIO: float = 0.01  # peak < 1% of full scale
_MAX_CLIPPING_FRAMES: int = 8000  # frames sampled for peak analysis


class AudioValidationError(BaseModel):
    """Error response for audio validation failures."""

    code: str
    message: str
    details: Any | None = None

    model_config = {"from_attributes": True}


class AudioValidationResult(BaseModel):
    """Result of audio validation, matching the contract's AudioBaseModel."""

    valid: bool
    format: str
    duration_sec: float
    sample_rate_hz: int
    channel_count: int
    warnings: list[str]
    deepfake_detection: DetectorStatusModel

    model_config = {"from_attributes": True}

    @classmethod
    def not_configured(cls) -> dict[str, Any]:
        """Return the default not_configured detector status."""
        return {
            "status": "not_configured",
            "score": None,
            "label": "unknown",
        }


ERROR_CODES = {
    "missing_field": 422,
    "unsupported_format": 415,
    "malformed_audio": 400,
    "limit_exceeded": 413,
}


def _not_configured_detector() -> dict[str, Any]:
    """Detector payload used until a real detector is integrated/evaluated."""
    return {"status": "not_configured", "score": None, "label": "unknown"}


def _failure_dict(reason_warning: str) -> dict[str, Any]:
    """Base dict returned by validate_audio for rejected inputs."""
    return {
        "valid": False,
        "format": "unknown",
        "duration_seconds": 0.0,
        "sample_rate_hz": 0,
        "channels": 0,
        "validation_warnings": [reason_warning],
        "deepfake_detection": _not_configured_detector(),
    }


def _peak_ratio(frames: bytes, sampwidth: int) -> float | None:
    """Peak amplitude as a fraction of full scale, or None if unsupported.

    Reliably supported for 8-bit unsigned and 16-bit signed PCM only.
    24/32-bit widths are skipped (no warning fabricated).
    """
    if not frames or sampwidth not in (1, 2):
        return None
    try:
        if sampwidth == 1:
            # 8-bit WAV is unsigned; center on 128.
            peak = max(abs(b - 128) for b in frames[::4])  # subsample
            return peak / 128.0
        # 16-bit signed little-endian.
        step = 4  # subsample every 2nd sample (2 bytes each)
        count = len(frames) // 2
        peak = 0
        for i in range(0, count, step // 2):
            (sample,) = struct.unpack_from("<h", frames, i * 2)
            magnitude = abs(sample)
            if magnitude > peak:
                peak = magnitude
                if peak >= 32767:
                    break
        return peak / 32768.0
    except Exception:
        return None


def _quality_warnings(
    duration_sec: float,
    sampwidth: int,
    frames: bytes,
) -> list[str]:
    """Build non-fatal quality warnings (never fail validation on quality)."""
    warnings: list[str] = []
    if duration_sec >= NEAR_LIMIT_THRESHOLD_SECONDS:
        warnings.append("audio_duration_near_limit")
    if 0 < duration_sec < VERY_SHORT_THRESHOLD_SECONDS:
        warnings.append("very_short_audio")
    ratio = _peak_ratio(frames, sampwidth)
    if ratio is not None:
        if ratio >= _CLIPPING_THRESHOLD_RATIO:
            warnings.append("possible_clipping_detected")
        elif ratio <= _SILENCE_THRESHOLD_RATIO:
            warnings.append("silent_or_very_quiet_audio")
    return warnings


def _parse_wav(file_bytes: bytes) -> tuple[dict[str, Any], str | None]:
    """Parse WAV bytes. Returns (metadata, failure_warning_or_None)."""
    try:
        with io.BytesIO(file_bytes) as bio:
            with wave.open(bio) as wav:
                n_channels = wav.getnchannels()
                sampwidth = wav.getsampwidth()
                frame_rate = wav.getframerate()
                n_frames = wav.getnframes()
                if frame_rate <= 0 or n_channels <= 0 or n_frames < 0:
                    return {}, "malformed_audio"
                if n_frames == 0:
                    return {}, "empty_audio_data"
                duration_sec = n_frames / float(frame_rate)
                # Read a bounded sample of frames for quality analysis.
                sample_frames = min(n_frames, _MAX_CLIPPING_FRAMES)
                try:
                    wav.rewind()
                    frames = wav.readframes(sample_frames)
                except Exception:
                    frames = b""
                meta = {
                    "n_channels": n_channels,
                    "sampwidth": sampwidth,
                    "frame_rate": frame_rate,
                    "n_frames": n_frames,
                    "duration_sec": duration_sec,
                    "frames": frames,
                }
                return meta, None
    except (wave.Error, EOFError, struct.error):
        return {}, "malformed_audio"
    except Exception:
        # Never expose internal exceptions or stack traces.
        return {}, "malformed_audio"


def _has_wave_container(file_bytes: bytes) -> bool:
    """True when the bytes are a WAVE container candidate.

    Only the actual file contents are inspected; the declared filename and MIME
    type are never trusted. A short prefix that still begins with the RIFF magic
    is treated as a (truncated) WAV so that :func:`wave.open` reports it as
    unreadable rather than as an unsupported format.
    """
    if file_bytes[:4] != _RIFF_MAGIC:
        return False
    if len(file_bytes) < 12:
        return True
    return file_bytes[8:12] == _WAVE_MAGIC


def _decode_mono_samples(
    file_bytes: bytes,
    n_channels: int,
    sampwidth: int,
    frame_rate: int,
    n_frames: int,
) -> list[float] | None:
    """Decode full PCM to mono float32 in [-1, 1]; None if unsupported.

    Only 8-bit unsigned and 16-bit signed PCM are decoded (the widths the
    quality heuristics support). Other widths return None so the caller can
    report detector ``failed`` instead of fabricating a result.
    """
    try:
        with io.BytesIO(file_bytes) as bio:
            with wave.open(bio) as wav:
                raw = wav.readframes(n_frames)
    except Exception:
        return None
    try:
        if sampwidth == 1:
            values = [(b - 128) / 128.0 for b in raw]
        elif sampwidth == 2:
            count = len(raw) // 2
            values = [
                struct.unpack_from("<h", raw, i * 2)[0] / 32768.0 for i in range(count)
            ]
        else:
            return None
    except Exception:
        return None
    if n_channels > 1 and values:
        frames = len(values) // n_channels
        mono = [
            sum(values[f * n_channels + c] for c in range(n_channels)) / n_channels
            for f in range(frames)
        ]
        return mono
    return values


def _detector_payload_for_valid(
    file_bytes: bytes, meta: dict[str, Any]
) -> dict[str, Any]:
    """Run the configured detector (if any) on validated audio.

    Validation stays independent: with no detector configured this returns
    ``not_configured`` without touching model code. Any inference problem
    maps to ``failed`` with null score — never a fabricated result.
    """
    from .deepfake_detector import get_detector, run_detector

    if get_detector() is None:
        return _not_configured_detector()
    samples = _decode_mono_samples(
        file_bytes,
        meta["n_channels"],
        meta["sampwidth"],
        meta["frame_rate"],
        meta["n_frames"],
    )
    if samples is None:
        return {"status": "failed", "score": None, "label": "unknown"}
    return run_detector(samples, meta["frame_rate"])


def validate_audio(audio_bytes: bytes) -> dict:
    """Validate raw audio bytes and return the agreed audio-service dict.

    Agreed interface: ``validate_audio(audio_bytes: bytes) -> dict`` with
    exact fields: ``valid``, ``format``, ``duration_seconds``,
    ``sample_rate_hz``, ``channels``, ``validation_warnings``, and
    ``deepfake_detection`` (``status``/``score``/``label``).

    Never raises on invalid input; rejected files return ``valid=False``
    with a machine-readable warning. Without a configured detector,
    ``deepfake_detection`` is ``not_configured``/``None``/``unknown``; with
    one configured, it reflects the inference outcome (``completed`` or
    ``failed``). A valid file says nothing about voice authenticity.
    """
    if not isinstance(audio_bytes, (bytes, bytearray)):
        return _failure_dict("invalid_input_type")
    data = bytes(audio_bytes)
    if len(data) == 0:
        return _failure_dict("empty_file")
    if len(data) > MAX_AUDIO_SIZE_BYTES:
        result = _failure_dict("file_size_exceeds_limit")
        return result
    meta, failure = _parse_wav(data)
    if failure is not None:
        return _failure_dict(failure)
    duration_sec = meta["duration_sec"]
    if duration_sec > MAX_AUDIO_DURATION_SECONDS:
        return _failure_dict("audio_duration_exceeds_limit")
    warnings = _quality_warnings(duration_sec, meta["sampwidth"], meta["frames"])
    return {
        "valid": True,
        "format": "WAV",
        "duration_seconds": round(duration_sec, 3),
        "sample_rate_hz": meta["frame_rate"],
        "channels": meta["n_channels"],
        "validation_warnings": warnings,
        "deepfake_detection": _detector_payload_for_valid(data, meta),
    }


def analyze_audio_file(
    file_bytes: bytes, filename: str = ""
) -> tuple[AudioValidationResult | None, dict[str, Any] | None]:
    """Validate an uploaded audio file and return structured results.

    Validates:
    - File size does not exceed MAX_AUDIO_SIZE_BYTES
    - Actual bytes are a WAVE container (else 415 unsupported_format)
    - File is a valid, readable WAV (else 400 malformed_audio)
    - Duration does not exceed MAX_AUDIO_DURATION_SECONDS
    - Actual file contents are validated, not filename or declared MIME type

    Returns (result, error) tuple where one will be None.
    Error messages are generic and never expose internal exceptions or
    stack traces.
    """
    _ = filename  # contents are validated, not the filename/MIME type
    if not isinstance(file_bytes, (bytes, bytearray)) or len(file_bytes) == 0:
        return None, _error_missing_field("audio")
    if len(file_bytes) > MAX_AUDIO_SIZE_BYTES:
        return None, _error_limit_exceeded(len(file_bytes))
    # Container check — actual bytes, never the filename or MIME type.
    if not _has_wave_container(bytes(file_bytes)):
        return None, _error_unsupported_format()
    meta, failure = _parse_wav(bytes(file_bytes))
    if failure is not None:
        if failure == "empty_audio_data":
            return None, _error_malformed_audio_generic("Audio contains no audio frames.")
        return None, _error_malformed_audio_generic(
            "Audio file is malformed or cannot be read."
        )
    duration_sec: float = meta["duration_sec"]
    if duration_sec > MAX_AUDIO_DURATION_SECONDS:
        return None, _error_duration_exceeded(duration_sec)
    warnings = _quality_warnings(duration_sec, meta["sampwidth"], meta["frames"])
    detector_payload = _detector_payload_for_valid(bytes(file_bytes), meta)
    result: AudioValidationResult = AudioBaseModel(
        valid=True,
        format="WAV",
        duration_sec=duration_sec,
        sample_rate_hz=meta["frame_rate"],
        channel_count=meta["n_channels"],
        warnings=warnings,
        deepfake_detection=detector_payload,
    )
    return result, None


def _error_missing_field(field_name: str) -> dict[str, Any]:
    """Return a 422 missing_field error per the API contract."""
    return {
        "error": {
            "code": "missing_field",
            "message": f"Required field '{field_name}' is missing or empty.",
            "details": None,
        },
        "status": 422,
    }


def _error_unsupported_format() -> dict[str, Any]:
    """Return a 415 unsupported_format error per the API contract."""
    return {
        "error": {
            "code": "unsupported_format",
            "message": "Unsupported audio format. Only WAV files are supported.",
            "details": None,
        },
        "status": 415,
    }


def _error_malformed_audio(exc: Exception) -> dict[str, Any]:
    """Return a 400 malformed_audio error per the API contract.

    The message stays generic: internal exception text is never exposed.
    """
    _ = exc
    return {
        "error": {
            "code": "malformed_audio",
            "message": "Audio file is malformed or cannot be read.",
            "details": None,
        },
        "status": 400,
    }


def _error_malformed_audio_generic(message: str) -> dict[str, Any]:
    """Return a 400 malformed_audio error without leaking internals."""
    return {
        "error": {
            "code": "malformed_audio",
            "message": message,
            "details": None,
        },
        "status": 400,
    }


def _error_limit_exceeded(actual_size: int) -> dict[str, Any]:
    """Return a 413 limit_exceeded error per the API contract."""
    return {
        "error": {
            "code": "limit_exceeded",
            "message": (
                f"Uploaded file exceeds maximum size of {MAX_AUDIO_SIZE_MB} MB "
                f"(received {actual_size} bytes)."
            ),
            # The contract defines details as always null in the baseline.
            "details": None,
        },
        "status": 413,
    }


def _error_duration_exceeded(duration_sec: float) -> dict[str, Any]:
    """Return a 413 limit_exceeded error for audio duration."""
    return {
        "error": {
            "code": "limit_exceeded",
            "message": (
                f"Audio duration exceeds maximum of {MAX_AUDIO_DURATION_SECONDS} seconds "
                f"(measured {duration_sec:.1f} seconds)."
            ),
            "details": None,
        },
        "status": 413,
    }
