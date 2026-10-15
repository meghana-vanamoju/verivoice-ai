"""Shared API error envelope and exception handlers.

Every error response uses the structure required by ``docs/api/API_CONTRACT.md``::

    {"error": {"code": "...", "message": "...", "details": null}}

Handlers are registered once in ``app.main`` so individual routes only need to
raise :class:`ApiError`.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """An error that maps directly onto the contract's error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def error_body(code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    """Build the contract error envelope body."""
    return {"error": {"code": code, "message": message, "details": details}}


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    """Return the contract envelope for a raised :class:`ApiError`."""
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message, exc.details),
    )


async def request_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Map FastAPI's validation errors (missing form fields) to ``missing_field``."""
    fields = sorted(
        {
            str(part)
            for error in exc.errors()
            for part in (error.get("loc") or ())
            if isinstance(part, str) and part not in {"body", "form", "file"}
        }
    )
    if fields:
        message = "Required field is missing or invalid: " + ", ".join(fields) + "."
    else:
        message = "Required field is missing or invalid."
    return JSONResponse(
        status_code=422,
        content=error_body("missing_field", message, None),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a generic 500 envelope.

    The message is deliberately generic: no stack trace, file path, exception
    text, or request content is ever returned to the client. Full details are
    logged server-side by the ASGI server.
    """
    return JSONResponse(
        status_code=500,
        content=error_body(
            "internal_error",
            "An unexpected error occurred while analysing the request.",
            None,
        ),
    )


def register_error_handlers(app: Any) -> None:
    """Register the contract error handlers on a FastAPI application."""
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
