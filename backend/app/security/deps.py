"""FastAPI dependencies: bearer token from the Authorization header only (§10.4, rule 9)."""

from fastapi import Request

from app.security.errors import ApiError
from app.security.tokens import Claims, TokenError


def current_user(request: Request) -> Claims:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "E_TOKEN_MISSING", "terminal")
    try:
        claims = request.app.state.tokens.verify(token)
    except TokenError:
        raise ApiError(401, "E_TOKEN_INVALID", "terminal") from None
    request.app.state.limiter.check(claims.sub)
    return claims


def require_admin(request: Request) -> Claims:
    claims = current_user(request)
    if claims.role != "admin":
        raise ApiError(403, "E_FORBIDDEN", "recoverable")
    return claims
