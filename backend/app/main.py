"""FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analyze import router as analyze_router
from app.api.context import router as context_router
from app.core.errors import register_error_handlers
from app.services.deepfake_detector import detector_from_env

logger = logging.getLogger(__name__)


def configure_detector_from_env() -> None:
    """Activate the opt-in detector when ``VERIVOICE_DETECTOR_MODEL`` is set.

    This never downloads weights and never crashes startup: constructing the
    detector is cheap, and a missing optional dependency or unusable
    checkpoint surfaces later as detector status ``failed`` on a request. That
    failure must never be read as evidence of genuine audio.
    """
    try:
        detector = detector_from_env()
    except Exception:  # pragma: no cover - defensive: never block startup
        logger.exception(
            "Could not configure the deepfake detector from the environment; "
            "continuing with detector status 'not_configured'."
        )
        return
    if detector is not None:
        logger.info("Deepfake detector configured from VERIVOICE_DETECTOR_MODEL.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Configure optional integrations once, at application startup."""
    configure_detector_from_env()
    yield


cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "VERIVOICE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app = FastAPI(
    title="VeriVoice AI",
    description=(
        "Voice impersonation defense prototype with audio validation, "
        "contextual risk analysis, and verification guidance."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(
    context_router,
    prefix="/api/v1/context",
    tags=["context"],
)
app.include_router(analyze_router)
register_error_handlers(app)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    """Return a simple health status."""
    return {"status": "ok"}
