"""Privacy headers on every response (§10.2, CLAUDE.md rule 8)."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

PRIVACY_HEADERS = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


class NoStoreMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            response = await call_next(request)
        except Exception:  # content-free error code only (§10.1)
            response = JSONResponse({"error": "E_INTERNAL"}, status_code=500)
        for k, v in PRIVACY_HEADERS.items():
            response.headers[k] = v
        return response
