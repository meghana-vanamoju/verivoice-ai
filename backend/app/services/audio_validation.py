"""Audio validation service for VeriVoice AI.

Validates uploaded WAV, MP3, and MP4 audio files against technical constraints:
- Maximum file size (15 MB, configurable via MAX_AUDIO_SIZE_MB)
- Maximum duration (120 seconds, configurable via MAX_AUDIO_DURATION_SECONDS)
- Valid container format (validated via actual bytes, not filename/MIME type)

For MP3 files: decoded or converted to PCM for the existing pipeline.
For MP4 files: audio track extracted and analyzed.
WAV files: preserved existing behavior.

Technical validation confirms the file is a readable format and reports basic
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
import subprocess
import wave
import tempfile
import signal
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from ..schemas.schemas import AudioBaseModel, DetectorStatusModel, DetectorStatus

DEFAULT_MAX_AUDIO_SIZE_MB = 15
DEFAULT_MAX_AUDIO_DURATION_SECONDS = 120

# RIFF/WAVE container magic, used to tell "not a WAV file" (415) apart from
# "claims to be WAVE but cannot be read" (400).
_RIFF_MAGIC = b"RIFF"
_WAVE_MAGIC = b"WAVE"

# FFmpeg availability check
_FFMPEG_AVAILABLE: bool | None = None
_FFMPEG_PROBE: Any | None = None
_FFMPEG_RUN: Any | None = None


def _check_ffmpeg_availability() -> bool:
    """Check if ffmpeg/ffprobe binaries are available on the system.

    This is a best-effort check; the value is cached after the first call.
    Returns True only when both ``ffmpeg`` and ``ffprobe`` are executable.
    """
    global _FFMPEG_AVAILABLE, _FFMPEG_PROBE, _FFMPEG_RUN
    if _FFMPEG_AVAILABLE is not None:
        return _FFMPEG_AVAILABLE

    try:
        # Use subprocess to check executables without installing anything
        r1 = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        r2 = subprocess.run(["ffprobe", "-version"], capture_output=True, timeout=5)
        if r1.returncode == 0 and r2.returncode == 0:
            _FFMPEG_AVAILABLE = True
        else:
            _FFMPEG_AVAILABLE = False
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        _FFMPEG_AVAILABLE = False

    return _FFMPEG_AVAILABLE


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


def _probe_with_ffmpeg(file_bytes: bytes) -> dict[str, Any] | None:
    """Probe audio/file metadata using ffprobe.

    Returns a dict with stream info (duration, sample_rate, channels)
    when successful, or None when ffmpeg is unavailable or the file
    cannot be probed.
    """
    check = _check_ffmpeg_availability()
    if not check:
        return None
    try:
        import ffmpeg as _ffmpeg  # type: ignore[assignment]
        probe = _ffmpeg.probe(io.BytesIO(file_bytes), timeout=10)  # type: ignore[call-overload]
        return probe
    except Exception:
        return None


def _extract_audio_pcm_with_ffmpeg(
    file_bytes: bytes,
) -> tuple[list[float], int, int] | None:
    """Extract mono PCM float32 samples from an MP3 using ffmpeg.

    Returns (samples, sample_rate, channels) or None on failure.
    The audio is mixed to mono, resampled to 16 kHz (the detector's
    expected rate), and converted to float32 in [-1, 1].
    """
    check = _check_ffmpeg_availability()
    if not check:
        return None
    try:
        # Use subprocess directly to decode MP3 to raw 16-bit PCM
        proc = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel", "error",
                "-i", "pipe:0",
                "-vn",
                "-acodec", "pcm_s16le",
                "-ac", "1",
                "-ar", "16000",
                "-f", "s16le",
                "pipe:1",
            ],
            input=file_bytes,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            return None
        out = proc.stdout
        # Parse raw 16-bit little-endian mono samples
        samples: list[float] = []
        sample_count = len(out) // 2  # 2 bytes per sample
        for i in range(sample_count):
            sample = struct.unpack_from("<h", out, i * 2)[0] / 32768.0
            samples.append(float(sample))
        if not samples:
            return None
        return samples, 16000, 1
    except (subprocess.TimeoutExpired, Exception):
        return None


def _extract_audio_from_mp4_with_ffmpeg(
    file_bytes: bytes,
) -> tuple[list[float], int, int] | None:
    """Extract audio track from an MP4 file using ffmpeg.

    Returns (samples, sample_rate, channels) or None on failure.
    The audio is mixed to mono, resampled to 16 kHz, and converted
    to float32 in [-1, 1]. Returns None if the file has no audio track.
    """
    check = _check_ffmpeg_availability()
    if not check:
        return None
    try:
        # Use subprocess directly to extract audio from MP4 to raw PCM
        proc = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel", "error",
                "-i", "pipe:0",
                "-vn",
                "-acodec", "pcm_s16le",
                "-ac", "1",
                "-ar", "16000",
                "-f", "s16le",
                "pipe:1",
            ],
            input=file_bytes,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode != 0:
            return None
        out = proc.stdout
        # Parse raw 16-bit little-endian mono samples
        samples: list[float] = []
        sample_count = len(out) // 2
        for i in range(sample_count):
            sample = struct.unpack_from("<h", out, i * 2)[0] / 32768.0
            samples.append(float(sample))
        if not samples:
            return None
        return samples, 16000, 1
    except (subprocess.TimeoutExpired, Exception):
        return None


def _decode_mono_samples(
    file_bytes: bytes,
    n_channels: int,
    sampwidth: int,
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


def _detector_payload_for_samples(
    samples: list[float] | None, sample_rate_hz: int
) -> dict[str, Any]:
    """Run the configured detector (if any) on normalized audio samples.

    Validation stays independent: with no detector configured this returns
    ``not_configured`` without touching model code. Any inference problem
    maps to ``failed`` with null score — never a fabricated result.

    ``samples`` should be a list of mono float32 samples in [-1, 1].
    ``sample_rate_hz`` is the sample rate of those samples.
    """
    from .deepfake_detector import get_detector, run_detector

    if get_detector() is None:
        return _not_configured_detector()
    if samples is None:
        return {"status": "failed", "score": None, "label": "unknown"}
    return run_detector(samples, sample_rate_hz)


def _detector_payload_for_valid(
    file_bytes: bytes, meta: dict[str, Any]
) -> dict[str, Any]:
    """Run the configured detector (if any) on validated WAV audio.

    Thin wrapper around :func:`_detector_payload_for_samples` that decodes
    the WAV bytes into mono float32 samples first. Preserved for backward
    compatibility with existing callers and tests.
    """
    samples = _decode_mono_samples(
        file_bytes,
        meta["n_channels"],
        meta["sampwidth"],
        meta["n_frames"],
    )
    return _detector_payload_for_samples(samples, meta["frame_rate"])


def _detect_format(file_bytes: bytes) -> str:
    """Detect the audio format from actual file bytes.

    Order of checks matters: WAV is checked first (RIFF/WAVE magic),
    then MP3 (MPEG sync word), then MP4 (ISO base media file type).
    Returns one of: "WAV", "MP3", "MP4", or "unknown".
    """
    # WAV: RIFF container with WAVE form type. A short RIFF prefix
    # (fewer than 12 bytes) is treated as a WAV candidate so that
    # _parse_wav can report it as malformed rather than unsupported.
    if file_bytes[:4] == _RIFF_MAGIC:
        if len(file_bytes) < 12 or file_bytes[8:12] == _WAVE_MAGIC:
            return "WAV"
    # MP3: ID3v2 tag (very common) or raw MPEG audio frame sync.
    # ID3v2 tag starts with "ID3" followed by version and flags.
    if len(file_bytes) >= 3 and file_bytes[:3] == b"ID3":
        return "MP3"
    # Raw MPEG audio frame sync: 11 consecutive 1-bits (0xFFE0 mask).
    # byte[0] must be 0xFF and byte[1] upper 3 bits must be 111.
    if len(file_bytes) >= 2 and file_bytes[0] == 0xFF and (file_bytes[1] & 0xE0) == 0xE0:
        return "MP3"
    # MP4: ISO Base Media File Format. The first box is "ftyp" (file type)
    # at bytes 4-7, followed by a brand code (e.g., "isom", "mp42").
    if len(file_bytes) >= 12 and file_bytes[4:8] == b"ftyp":
        return "MP4"
    return "unknown"


def _validate_decoded_audio(
    pcm_bytes: bytes,
    sample_rate: int,
    channels: int,
) -> dict[str, Any]:
    """Validate decoded PCM audio bytes using the WAV validation pipeline.

    The passed bytes are raw 16-bit LE PCM. This function simulates a
    WAV container around them so the existing _parse_wav / _quality_warnings
    logic can be reused without modification.
    """
    # Build a minimal WAV-like metadata dict from the decoded PCM.
    # 16-bit signed little-endian, channels as given, sample_rate as given.
    n_frames = len(pcm_bytes) // (2 * max(channels, 1))
    duration_sec = n_frames / float(sample_rate) if sample_rate > 0 else 0.0

    # Use a bounded sample of frames for quality analysis, mirroring
    # the existing _quality_warnings approach.
    sample_frames = min(n_frames, _MAX_CLIPPING_FRAMES)

    # Determine sampwidth from the PCM data (16-bit = 2)
    sampwidth = 2

    # Run quality warnings on a small sample.
    # We read a few frames by slicing the raw bytes.
    try:
        frames_sample = pcm_bytes[: sample_frames * 2 * channels]
    except Exception:
        frames_sample = b""

    warnings = _quality_warnings(duration_sec, sampwidth, frames_sample)

    return {
        "valid": True,
        "format": _detect_format(pcm_bytes) if False else "WAV",
        "duration_seconds": round(duration_sec, 3),
        "sample_rate_hz": sample_rate,
        "channels": channels,
        "validation_warnings": warnings,
        "deepfake_detection": _not_configured_detector(),
    }


def validate_audio(audio_bytes: bytes) -> dict:
    """Validate raw audio bytes and return the agreed audio-service dict.

    Agreed interface: ``validate_audio(audio_bytes: bytes) -> dict`` with
    exact fields: ``valid``, ``format``, ``duration_seconds``,
    ``sample_rate_hz``, ``channels``, ``validation_warnings``, and
    ``deepfake_detection`` (``status``/``score``/``label``).

    Supports WAV (native), MP3 (decoded via FFmpeg), and MP4 (audio track
    extracted via FFmpeg). Validates actual media content, not filename or
    declared MIME type. Never raises on invalid input; rejected files return
    ``valid=False`` with a machine-readable warning.

    Without a configured detector, ``deepfake_detection`` is
    ``not_configured``/``None``/``unknown``; with one configured, it
    reflects the inference outcome (``completed`` or ``failed``). A valid
    file says nothing about voice authenticity.
    """
    if not isinstance(audio_bytes, (bytes, bytearray)):
        return _failure_dict("invalid_input_type")
    data = bytes(audio_bytes)
    if len(data) == 0:
        return _failure_dict("empty_file")
    if len(data) > MAX_AUDIO_SIZE_BYTES:
        result = _failure_dict("file_size_exceeds_limit")
        return result

    fmt = _detect_format(data)

    if fmt == "WAV":
        # Existing WAV validation path
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

    elif fmt == "MP3":
        # Check FFmpeg availability first
        if not _check_ffmpeg_availability():
            return _failure_dict("ffmpeg_unavailable")
        # Decode MP3 to raw PCM using FFmpeg, then validate the decoded audio
        pcm_result = _extract_audio_pcm_with_ffmpeg(data)
        if pcm_result is None:
            # FFmpeg available but decode failed
            return _failure_dict("malformed_audio")
        samples, sample_rate, channels = pcm_result
        # Validate the decoded audio using the adapted pipeline
        validated = _validate_decoded_audio(
            _pcm_bytes_from_samples(samples, channels),
            sample_rate,
            channels,
        )
        # Re-check duration limit on the decoded audio
        if validated["duration_seconds"] > MAX_AUDIO_DURATION_SECONDS:
            return _failure_dict("audio_duration_exceeds_limit")
        # Run the detector on the normalized (decoded) samples
        detector_payload = _detector_payload_for_samples(samples, sample_rate)
        return {
            "valid": validated["valid"],
            "format": "MP3",
            "duration_seconds": validated["duration_seconds"],
            "sample_rate_hz": validated["sample_rate_hz"],
            "channels": validated["channels"],
            "validation_warnings": validated["validation_warnings"],
            "deepfake_detection": detector_payload,
        }

    elif fmt == "MP4":
        # Check FFmpeg availability first
        if not _check_ffmpeg_availability():
            return _failure_dict("ffmpeg_unavailable")
        # Extract audio track from MP4 using FFmpeg, then validate the audio
        pcm_result = _extract_audio_from_mp4_with_ffmpeg(data)
        if pcm_result is None:
            # FFmpeg available but extract failed (likely no audio track or malformed)
            return _failure_dict("malformed_audio")
        samples, sample_rate, channels = pcm_result
        # Validate the decoded audio using the adapted pipeline
        validated = _validate_decoded_audio(
            _pcm_bytes_from_samples(samples, channels),
            sample_rate,
            channels,
        )
        # Re-check duration limit on the decoded audio
        if validated["duration_seconds"] > MAX_AUDIO_DURATION_SECONDS:
            return _failure_dict("audio_duration_exceeds_limit")
        # Run the detector on the normalized (extracted) samples
        detector_payload = _detector_payload_for_samples(samples, sample_rate)
        return {
            "valid": validated["valid"],
            "format": "MP4",
            "duration_seconds": validated["duration_seconds"],
            "sample_rate_hz": validated["sample_rate_hz"],
            "channels": validated["channels"],
            "validation_warnings": validated["validation_warnings"],
            "deepfake_detection": detector_payload,
        }

    else:
        # Unknown format — cannot determine if it's a supported type
        return _failure_dict("malformed_audio")


def _pcm_bytes_from_samples(
    samples: list[float], channels: int,
) -> bytes:
    """Convert a list of float32 mono samples to 16-bit PCM bytes.

    Each sample is clamped to [-1, 1] and packed as signed 16-bit little-endian.
    """
    import struct
    raw = bytearray()
    for s in samples:
        s = max(-1.0, min(1.0, s))
        val = int(s * 32767)
        raw.extend(struct.pack("<h", val))
    # If stereo, interleave; for mono just return the bytes
    if channels == 1:
        return bytes(raw)
    # Stereo: duplicate mono into two channels (simple upmix)
    result = bytearray()
    for i in range(0, len(raw), 2 * channels):
        result.extend(raw[i : i + 2] * channels)
    return bytes(result)


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

    fmt = _detect_format(bytes(file_bytes))

    if fmt == "WAV":
        # Existing WAV validation path
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

    elif fmt == "MP3":
        # Check FFmpeg availability first
        if not _check_ffmpeg_availability():
            return None, _error_ffmpeg_unavailable()
        # Decode MP3 to raw PCM using FFmpeg, then validate the decoded audio
        pcm_result = _extract_audio_pcm_with_ffmpeg(bytes(file_bytes))
        if pcm_result is None:
            return None, _error_malformed_audio_generic("Audio file is malformed or cannot be read.")
        samples, sample_rate, channels = pcm_result
        pcm_bytes = _pcm_bytes_from_samples(samples, channels)
        # Build a WAV-like metadata dict for the decoded audio
        n_frames = len(pcm_bytes) // (2 * max(channels, 1))
        duration_sec = n_frames / float(sample_rate) if sample_rate > 0 else 0.0
        if duration_sec > MAX_AUDIO_DURATION_SECONDS:
            return None, _error_duration_exceeded(duration_sec)
        # Run quality warnings on the decoded audio
        frames_sample = pcm_bytes[:min(n_frames, _MAX_CLIPPING_FRAMES) * 2 * channels]
        warnings = _quality_warnings(duration_sec, 2, frames_sample)
        # Run the detector on the normalized (decoded) samples
        detector_payload = _detector_payload_for_samples(samples, sample_rate)
        result = AudioBaseModel(
            valid=True,
            format="MP3",
            duration_sec=duration_sec,
            sample_rate_hz=sample_rate,
            channel_count=channels,
            warnings=warnings,
            deepfake_detection=detector_payload,
        )
        return result, None

    elif fmt == "MP4":
        # Check FFmpeg availability first
        if not _check_ffmpeg_availability():
            return None, _error_ffmpeg_unavailable()
        # Extract audio track from MP4 using FFmpeg, then validate the audio
        pcm_result = _extract_audio_from_mp4_with_ffmpeg(bytes(file_bytes))
        if pcm_result is None:
            return None, _error_malformed_audio_generic(
                "MP4 file contains no audio track or is malformed."
            )
        samples, sample_rate, channels = pcm_result
        pcm_bytes = _pcm_bytes_from_samples(samples, channels)
        n_frames = len(pcm_bytes) // (2 * max(channels, 1))
        duration_sec = n_frames / float(sample_rate) if sample_rate > 0 else 0.0
        if duration_sec > MAX_AUDIO_DURATION_SECONDS:
            return None, _error_duration_exceeded(duration_sec)
        frames_sample = pcm_bytes[:min(n_frames, _MAX_CLIPPING_FRAMES) * 2 * channels]
        warnings = _quality_warnings(duration_sec, 2, frames_sample)
        # Run the detector on the normalized (extracted) samples
        detector_payload = _detector_payload_for_samples(samples, sample_rate)
        result = AudioBaseModel(
            valid=True,
            format="MP4",
            duration_sec=duration_sec,
            sample_rate_hz=sample_rate,
            channel_count=channels,
            warnings=warnings,
            deepfake_detection=detector_payload,
        )
        return result, None

    else:
        # Unknown format — cannot determine if it's a supported type
        return None, _error_unsupported_format()


def _error_ffmpeg_unavailable() -> dict[str, Any]:
    """Return a 415 unsupported_format error when FFmpeg is required but unavailable."""
    return {
        "error": {
            "code": "unsupported_format",
            "message": (
                "MP3/MP4 processing requires FFmpeg, which is not installed. "
                "Please install FFmpeg to enable MP3/MP4 support."
            ),
            "details": None,
        },
        "status": 415,
    }


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
            "message": "Unsupported audio format. Only WAV, MP3, and MP4 files are supported.",
            "details": None,
        },
        "status": 415,
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
