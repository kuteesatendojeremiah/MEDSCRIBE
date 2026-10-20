"""Bounded request bodies (Blueprint §10.4 limits). Requests are read in chunks into one buffer
and refused as soon as they pass the limit, so an oversized upload never sits fully in memory."""

from fastapi import Request

from app.security.errors import ApiError


async def read_limited_body(
    request: Request, limit: int, code: str = "E_UPLOAD_TOO_LARGE"
) -> bytearray:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ApiError(413, code, "recoverable")
    buf = bytearray()  # one growing buffer: no second copy is made
    async for chunk in request.stream():
        if len(buf) + len(chunk) > limit:
            raise ApiError(413, code, "recoverable")
        buf.extend(chunk)
    return buf
