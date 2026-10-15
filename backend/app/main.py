"""FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.context import router as context_router

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
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
app.include_router(context_router, prefix="/api/v1/context", tags=["context"])


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    """Health check endpoint.

    Returns HTTP 200 with a simple JSON payload.
    """
    return {"status": "ok"}
