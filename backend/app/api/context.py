"""HTTP endpoints for contextual risk analysis."""

from fastapi import APIRouter

from ..schemas.context_analysis import (
    ContextAnalysisRequest,
    ContextAnalysisResponse,
)
from ..services.context_service import analyze_context

router = APIRouter()


@router.post("/analyze", response_model=ContextAnalysisResponse)
def analyze_context_endpoint(
    request: ContextAnalysisRequest,
) -> ContextAnalysisResponse:
    result = analyze_context(request.context, request.transcript)
    return ContextAnalysisResponse.model_validate(result)
