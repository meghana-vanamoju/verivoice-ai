"""FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analyze import router as analyze_router
from app.api.context import router as context_router
from app.core.errors import register_error_handlers

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
