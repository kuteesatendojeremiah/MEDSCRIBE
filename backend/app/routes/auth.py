"""Auth routes (FR-01, §10.4). Doctor accounts with password sign-in; admin user management.

Facility SSO (OIDC/SAML) replaces password sign-in in production - ADR-0006. Identity only: nothing
here is linked to clinical content. Error bodies carry a code and a class, never user input.
"""

import secrets

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.security.accounts import AccountError
from app.security.deps import current_user, require_admin
from app.security.errors import ApiError
from app.security.tokens import Claims, TokenError

router = APIRouter(prefix="/auth")
admin = APIRouter(prefix="/admin")


def _public(a) -> dict:
    return {"username": a.username, "name": a.display_name, "role": a.role}


def _session_body(request: Request, token: str, username: str, name: str, role: str) -> dict:
    return {
        "token": token,
        "expires_in": request.app.state.settings.token_ttl_seconds,
        "user": {"username": username, "name": name, "role": role},
    }


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


class NewAccount(BaseModel):
    username: str = Field(max_length=64)
    name: str = Field(max_length=100)
    password: str = Field(max_length=200)


@router.get("/status")
def status(request: Request):
    """Content-free: lets the sign-in screen choose between first-run setup and sign-in."""
    s = request.app.state
    return {
        "setup_needed": s.accounts.is_empty() and not s.settings.open_access,
        "demo_login": s.settings.dev_auth_enabled,
        "open_access": s.settings.open_access,
    }


@router.post("/setup")
def setup(body: NewAccount, request: Request):
    """First run only: create the first administrator. Refused once any account exists."""
    accounts = request.app.state.accounts
    if not accounts.is_empty():
        raise ApiError(409, "E_SETUP_DONE", "terminal")
    try:
        acct = accounts.create(body.username, body.name, body.password, role="admin")
    except AccountError as exc:
        raise ApiError(422, exc.code, "recoverable") from None
    token = request.app.state.tokens.issue(acct.username, acct.display_name, acct.role)
    return _session_body(request, token, acct.username, acct.display_name, acct.role)


@router.post("/login")
def login(body: Credentials, request: Request):
    s = request.app.state
    key = body.username.strip().lower()
    if s.throttle.blocked(key):
        raise ApiError(429, "E_TOO_MANY_ATTEMPTS", "recoverable")
    acct = s.accounts.verify(body.username, body.password)
    if acct is None:
        s.throttle.failed(key)
        raise ApiError(
            401, "E_BAD_CREDENTIALS", "recoverable"
        )  # same answer for unknown user / bad password
    s.throttle.succeeded(key)
    token = s.tokens.issue(acct.username, acct.display_name, acct.role)
    return _session_body(request, token, acct.username, acct.display_name, acct.role)


class DevLogin(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@router.post("/dev-login")
def dev_login(body: DevLogin, request: Request):
    """Demo sign-in for tests and demonstrations only; off unless DEV_AUTH_ENABLED=true."""
    settings = request.app.state.settings
    if not settings.dev_auth_enabled:
        raise ApiError(404, "E_NOT_FOUND", "terminal")
    name = body.name.strip() or "Demo doctor"
    token = request.app.state.tokens.issue(name, name, "doctor")
    return {**_session_body(request, token, name, name, "doctor"), "name": name}


@router.post("/open")
def open_session(request: Request):
    """Guest session for the synthetic-data demo (ADR-0011): no form, no account. Off unless
    OPEN_ACCESS=true. The token is as short-lived and revocable as any other, with its own rate limit
    bucket, and starting sessions is itself rate limited so new guests cannot bypass the limits."""
    s = request.app.state
    if not s.settings.open_access:
        raise ApiError(404, "E_NOT_FOUND", "terminal")
    s.open_limiter.check("open")
    guest = f"guest-{secrets.token_hex(4)}"
    token = s.tokens.issue(guest, "Clinician", "doctor")
    return _session_body(request, token, guest, "Clinician", "doctor")


@router.post("/refresh")
def refresh(request: Request, claims: Claims = Depends(current_user)):
    """Heartbeat renewal (§6.2). Cannot extend past the absolute limit."""
    try:
        token = request.app.state.tokens.refresh(claims)
    except TokenError:
        raise ApiError(401, "E_TOKEN_EXPIRED", "terminal") from None
    return {"token": token, "expires_in": request.app.state.settings.token_ttl_seconds}


@router.delete("/session", status_code=204)
def sign_out(request: Request, claims: Claims = Depends(current_user)):
    """Sign out: revoke the token server-side (ADR-0003, ADR-0006)."""
    request.app.state.tokens.revoke(claims)
    return Response(status_code=204)


# ---- administrator: manage doctor accounts ------------------------------------------------------
@admin.get("/users")
def list_users(request: Request, _: Claims = Depends(require_admin)):
    return {"users": [_public(a) for a in request.app.state.accounts.list()]}


@admin.post("/users")
def add_user(body: NewAccount, request: Request, _: Claims = Depends(require_admin)):
    try:
        acct = request.app.state.accounts.create(body.username, body.name, body.password, "doctor")
    except AccountError as exc:
        raise ApiError(
            409 if exc.code == "E_USERNAME_TAKEN" else 422, exc.code, "recoverable"
        ) from None
    return {"user": _public(acct)}


class NewPassword(BaseModel):
    password: str = Field(max_length=200)


@admin.post("/users/{username}/password", status_code=204)
def reset_password(
    username: str, body: NewPassword, request: Request, _: Claims = Depends(require_admin)
):
    try:
        request.app.state.accounts.set_password(username, body.password)
    except AccountError as exc:
        raise ApiError(
            404 if exc.code == "E_USER_NOT_FOUND" else 422, exc.code, "recoverable"
        ) from None
    return Response(status_code=204)


@admin.delete("/users/{username}", status_code=204)
def remove_user(username: str, request: Request, claims: Claims = Depends(require_admin)):
    if username == claims.sub:
        raise ApiError(409, "E_CANNOT_REMOVE_SELF", "recoverable")
    try:
        request.app.state.accounts.remove(username)
    except AccountError as exc:
        raise ApiError(
            404 if exc.code == "E_USER_NOT_FOUND" else 409, exc.code, "recoverable"
        ) from None
    return Response(status_code=204)
