"""Audio validation service for VeriVoice AI.

Validates uploaded WAV audio files against technical constraints:
- Maximum file size (15 MB)
- Maximum duration (120 seconds)
- Valid WAV file format (validated via wave module)

Does NOT claim that technical validation proves speaker authenticity.
"""

import io
import wave
import sys
from typing import Any

from pydantic import BaseModel

from ..schemas.schemas import AudioBaseModel, DetectorStatusModel, DetectorStatus

# Configuration from .env.example
MAX_AUDIO_SIZE_BYTES: int = 15 * 1024 * 1024  # 15 MB
MAX_AUDIO_DURATION_SECONDS: int = 120  # 120 seconds


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

    # --- Step 2: Format validation using wave module ---
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
            "message": f"Uploaded file exceeds maximum size of {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)} MB.",
            "details": {"actual_bytes": actual_size, "max_bytes": MAX_AUDIO_SIZE_BYTES},
        },
        "status": 413,
    }


def _error_duration_exceeded(duration_sec: float) -> dict[str, any]:
    """Return a 413 limit_exceeded error for audio duration."""
    return {
        "error": {
            "code": "limit_exceeded",
            "message": f"Audio duration exceeds maximum of {MAX_AUDIO_DURATION_SECONDS} seconds.",
            "details": {"actual_sec": round(duration_sec, 2), "max_sec": MAX_AUDIO_DURATION_SECONDS},
        },
        "status": 413,
    }