"""``POST /api/v1/analyze`` — audio upload plus contextual risk analysis."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile

from ..core.errors import ApiError
from ..schemas.schemas import AnalysisResponseBaseModel
from ..services.analysis_service import run_analysis

router = APIRouter()


@router.post(
    "/api/v1/analyze",
    response_model=AnalysisResponseBaseModel,
    summary="Analyze an uploaded audio file against communication context",
)
async def analyze(
    audio: UploadFile | None = File(None),
    context: str | None = Form(None),
    transcript: str | None = Form(None),
    language: str | None = Form(None),
) -> AnalysisResponseBaseModel:
    """Validate the uploaded WAV and screen the supplied communication context.

    Only the contract's response fields are returned. Audio metadata and
    contextual indicators are heuristic warnings; they do not establish whether
    a voice is genuine or cloned, and no detector result is fabricated.
    """
    if audio is None:
        raise ApiError(
            422,
            "missing_field",
            "Required field 'audio' is missing or empty.",
        )
    if context is None or not context.strip():
        raise ApiError(
            422,
            "missing_field",
            "Required field 'context' is missing or empty.",
        )

    audio_bytes = await audio.read()
    return run_analysis(
        audio_bytes,
        context=context,
        transcript=transcript,
        language=language,
    )
