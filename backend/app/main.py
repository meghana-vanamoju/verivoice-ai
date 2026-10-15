"""FastAPI application for VeriVoice AI."""

from fastapi import FastAPI

app = FastAPI(
    title="VeriVoice AI",
    description="Voice impersonation defense prototype — audio validation, contextual risk analysis, and verification guidance.",
    version="0.1.0",
)


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    """Health check endpoint.

    Returns HTTP 200 with a simple JSON payload.
    """
    return {"status": "ok"}