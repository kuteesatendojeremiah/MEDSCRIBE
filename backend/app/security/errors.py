"""Content-free API errors (§6.3, §10.1): a code and an error class, never content."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, klass: str = "recoverable"):
        super().__init__(code)
        self.status = status
        self.code = code
        self.klass = klass  # "recoverable" keeps the draft, "terminal" clears it (§6.3)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse({"error": exc.code, "class": exc.klass}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, __: RequestValidationError):
        # FastAPI's default body echoes the rejected input back; ours never does (§10.1).
        return JSONResponse({"error": "E_BAD_REQUEST", "class": "recoverable"}, status_code=422)
