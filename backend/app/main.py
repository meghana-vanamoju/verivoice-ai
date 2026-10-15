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
    title="VeriVoice AI API",
    description="Explainable contextual risk analysis for sensitive requests.",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
app.include_router(context_router, prefix="/api/v1/context", tags=["context"])
