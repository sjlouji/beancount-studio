"""Application error hierarchy. Every error carries a machine code and HTTP status."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.logging_setup import get_logger

log = get_logger(__name__)


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class LedgerError(AppError):
    """A ledger-level failure (parse error, bad slice, file hash mismatch, ...)."""

    status_code = 400
    code = "ledger_error"


class FeatureDisabledError(AppError):
    status_code = 503
    code = "feature_disabled"


def _error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            log.error("app error %s: %s", exc.code, exc.message, exc_info=exc)
        else:
            log.info("app error %s: %s", exc.code, exc.message)
        response = JSONResponse(
            status_code=exc.status_code, content=_error_body(exc.code, exc.message, exc.details)
        )
        # Set by get_auth when the request carried a session cookie that no longer resolves.
        stale_cookie = getattr(request.state, "stale_session_cookie", None)
        if stale_cookie:
            response.delete_cookie(stale_cookie, path="/")
        return response

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body("validation_error", "Invalid request", {"errors": exc.errors()}),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error: %s", exc, exc_info=exc)
        return JSONResponse(
            status_code=500, content=_error_body("internal_error", "Internal server error")
        )
