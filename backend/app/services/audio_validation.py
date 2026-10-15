"""Audio validation service for VeriVoice AI.

Validates uploaded WAV audio files against technical constraints:
- Maximum file size (15 MB)
- Maximum duration (120 seconds)
- Valid WAV file format (validated via wave module)

Does NOT claim that technical validation proves speaker authenticity.
"""

import io
import os
import wave
from typing import Any

from pydantic import BaseModel

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


class AudioValidationError(BaseModel):
    """Error response for audio validation failures."""

    code: str  # Error code from the API contract
    message: str  # Human-readable explanation
    details: Any | None = None  # Optional additional detail

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
    def not_configured(cls) -> dict[str, any]:
        """Return the default not_configured detector status."""
        return {
            "status": "not_configured",
            "score": None,
            "label": "unknown",
        }


# Standard error codes from the API contract
ERROR_CODES = {
    "missing_field": 422,
    "unsupported_format": 415,
    "malformed_audio": 400,
    "limit_exceeded": 413,
}


def analyze_audio_file(file_bytes: bytes, filename: str | str = "") -> tuple[AudioValidationResult | None, dict[str, any] | None]:
    """Validate an uploaded audio file and return structured results.

    Validates:
    - File size does not exceed MAX_AUDIO_SIZE_BYTES (15 MB)
    - File is a valid, readable WAV
    - Duration does not exceed MAX_AUDIO_DURATION_SECONDS (120 s)
    - Actual file contents are validated, not filename or declared MIME type

    Returns (result, error) tuple where one will be None.
    On success, result contains validated audio metadata and deepfake_detection
    status is `not_configured`. On failure, error contains code, message, and
    HTTP status from the contract.
    """
    # --- Step 1: Size validation (check actual bytes, not filename/MIME) ---
    if len(file_bytes) == 0:
        return None, _error_missing_field("audio")

    if len(file_bytes) > MAX_AUDIO_SIZE_BYTES:
        return None, _error_limit_exceeded(len(file_bytes))

    # --- Step 2: Container check — actual bytes, never the filename or MIME type ---
    if not _has_wave_container(file_bytes):
        return None, _error_unsupported_format()

    # --- Step 3: Format validation using wave module ---
    try:
        with io.BytesIO(file_bytes) as bio:
            with wave.open(bio) as wav:
                # Successfully parsed — it's a valid WAV
                n_channels = wav.getnchannels()
                sample_width = wav.getsampwidth()
                frame_rate = wav.getframerate()
                n_frames = wav.getnframes()

                # Calculate duration from frame count and sample rate
                duration_sec: float = n_frames / float(frame_rate) if frame_rate > 0 else 0.0

                # Check duration limit
                if duration_sec > MAX_AUDIO_DURATION_SECONDS:
                    return None, _error_duration_exceeded(duration_sec)

                # Build the validation result
                warnings: list[str] = []
                # Check for near-limit duration as a technical warning
                if duration_sec >= 115 and duration_sec <= 120:
                    warnings.append("audio_duration_near_limit")

                result: AudioValidationResult = AudioBaseModel(
                    valid=True,
                    format="WAV",
                    duration_sec=duration_sec,
                    sample_rate_hz=frame_rate,
                    channel_count=n_channels,
                    warnings=warnings,
                    deepfake_detection=AudioValidationResult.not_configured(),
                )
                return result, None

    except Exception as exc:  # Broad — invalid/ truncated/ malformed WAV
        # If wave.open fails, it's not a valid WAV file
        return None, _error_malformed_audio(exc)


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


def _error_missing_field(field_name: str) -> dict[str, any]:
    """Return a 422 missing_field error per the API contract."""
    return {
        "error": {
            "code": "missing_field",
            "message": f"Required field '{field_name}' is missing or empty.",
            "details": None,
        },
        "status": 422,
    }


def _error_unsupported_format() -> dict[str, any]:
    """Return a 415 unsupported_format error per the API contract."""
    return {
        "error": {
            "code": "unsupported_format",
            "message": "Unsupported audio format. Only WAV files are supported.",
            "details": None,
        },
        "status": 415,
    }


def _error_malformed_audio(exc: Exception) -> dict[str, any]:
    """Return a 400 malformed_audio error per the API contract."""
    return {
        "error": {
            "code": "malformed_audio",
            "message": f"Audio file is malformed or cannot be read: {str(exc)}",
            "details": None,
        },
        "status": 400,
    }


def _error_limit_exceeded(actual_size: int) -> dict[str, any]:
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


def _error_duration_exceeded(duration_sec: float) -> dict[str, any]:
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