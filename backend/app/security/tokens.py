"""Short-lived signed session tokens (§10.4, §6.2). Identity only: no clinical content inside.

Revocation is a deny-list of token ids with expiry (ADR-0003). It holds ids only, never content.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Callable

from app.settings import Settings


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class Claims:
    sub: str  # username
    jti: str
    iat: int
    exp: int
    abs: int  # absolute limit; a token can never be renewed past this (§6.2)
    name: str = ""  # display name printed as the approver
    role: str = "doctor"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class TokenService:
    def __init__(self, settings: Settings, now: Callable[[], float] = time.time):
        self._secret = (settings.token_secret or secrets.token_hex(32)).encode()
        self._ttl = settings.token_ttl_seconds
        self._abs = settings.token_absolute_seconds
        self._now = now
        self._revoked: dict[str, int] = {}

    def _sign(self, body: str) -> str:
        return _b64(hmac.new(self._secret, body.encode(), hashlib.sha256).digest())

    def _encode(self, claims: Claims) -> str:
        body = _b64(json.dumps(claims.__dict__, separators=(",", ":")).encode())
        return f"{body}.{self._sign(body)}"

    def issue(self, sub: str, name: str = "", role: str = "doctor") -> str:
        now = int(self._now())
        return self._encode(
            Claims(
                sub=sub,
                jti=secrets.token_hex(8),
                iat=now,
                exp=now + self._ttl,
                abs=now + self._abs,
                name=name or sub,
                role=role,
            )
        )

    def verify(self, token: str) -> Claims:
        try:
            body, sig = token.split(".")
            if not hmac.compare_digest(sig, self._sign(body)):
                raise TokenError("bad signature")
            claims = Claims(**json.loads(_unb64(body)))
        except TokenError:
            raise
        except Exception as exc:  # malformed token of any kind
            raise TokenError("malformed") from exc
        now = self._now()
        if now >= claims.exp or now >= claims.abs:
            raise TokenError("expired")
        self._purge(now)
        if claims.jti in self._revoked:
            raise TokenError("revoked")
        return claims

    def refresh(self, claims: Claims) -> str:
        now = int(self._now())
        if now >= claims.abs:
            raise TokenError("absolute limit")
        exp = min(now + self._ttl, claims.abs)
        return self._encode(
            Claims(claims.sub, secrets.token_hex(8), now, exp, claims.abs, claims.name, claims.role)
        )

    def revoke(self, claims: Claims) -> None:
        self._revoked[claims.jti] = claims.exp
        self._purge(self._now())

    def _purge(self, now: float) -> None:
        for jti in [j for j, exp in self._revoked.items() if exp <= now]:
            del self._revoked[jti]
