"""Doctor accounts (Blueprint §10.4: facility sign-in, identity only, never linked to clinical content).

A small JSON identity file: username, display name, role and a salted PBKDF2 password hash. It holds NO
clinical content (rule 1 concerns clinical data; identities are not clinical). Production replaces this
with facility SSO (OIDC/SAML) - ADR-0006. Writes are atomic; hashes are compared in constant time.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ITERATIONS = 240_000
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
MIN_PASSWORD = 10


class AccountError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Account:
    username: str
    display_name: str
    role: str  # "admin" | "doctor"


def _hash(password: str, salt: bytes, iterations: int = ITERATIONS) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return base64.b64encode(dk).decode()


class AccountStore:
    def __init__(self, path: Path):
        self._path = Path(path)
        self._lock = threading.Lock()

    # -- storage -----------------------------------------------------------------------------
    def _read(self) -> list[dict]:
        try:
            return json.loads(self._path.read_text(encoding="utf8")).get("users", [])
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def _write(self, users: list[dict]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self._path.parent, prefix=".accounts-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf8") as f:
                json.dump({"users": users}, f, indent=2)
            os.replace(tmp, self._path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    # -- queries ----------------------------------------------------------------------------------
    def is_empty(self) -> bool:
        return not self._read()

    def list(self) -> list[Account]:
        return [Account(u["username"], u["display_name"], u["role"]) for u in self._read()]

    def get(self, username: str) -> Optional[Account]:
        for a in self.list():
            if a.username == username:
                return a
        return None

    # -- commands ---------------------------------------------------------------------------------
    @staticmethod
    def _validate(username: str, display_name: str, password: str) -> None:
        if not USERNAME_RE.match(username):
            raise AccountError("E_USERNAME_INVALID")
        if not display_name.strip() or len(display_name) > 80:
            raise AccountError("E_NAME_INVALID")
        if len(password) < MIN_PASSWORD or len(password) > 200:
            raise AccountError("E_PASSWORD_WEAK")

    def create(
        self, username: str, display_name: str, password: str, role: str = "doctor"
    ) -> Account:
        username = username.strip().lower()
        self._validate(username, display_name, password)
        if role not in ("admin", "doctor"):
            raise AccountError("E_ROLE_INVALID")
        with self._lock:
            users = self._read()
            if any(u["username"] == username for u in users):
                raise AccountError("E_USERNAME_TAKEN")
            salt = secrets.token_bytes(16)
            users.append(
                {
                    "username": username,
                    "display_name": display_name.strip(),
                    "role": role,
                    "salt": base64.b64encode(salt).decode(),
                    "iterations": ITERATIONS,
                    "hash": _hash(password, salt),
                    "created": int(time.time()),
                }
            )
            self._write(users)
        return Account(username, display_name.strip(), role)

    def verify(self, username: str, password: str) -> Optional[Account]:
        """Constant-time check; the same work is done for unknown users so timing does not reveal them."""
        username = username.strip().lower()
        user = next((u for u in self._read() if u["username"] == username), None)
        salt = base64.b64decode(user["salt"]) if user else b"\0" * 16
        iterations = user["iterations"] if user else ITERATIONS
        candidate = _hash(password, salt, iterations)
        ok = hmac.compare_digest(candidate, user["hash"] if user else "x" * len(candidate))
        return (
            Account(user["username"], user["display_name"], user["role"]) if user and ok else None
        )

    def set_password(self, username: str, password: str) -> None:
        if len(password) < MIN_PASSWORD or len(password) > 200:
            raise AccountError("E_PASSWORD_WEAK")
        with self._lock:
            users = self._read()
            user = next((u for u in users if u["username"] == username), None)
            if not user:
                raise AccountError("E_USER_NOT_FOUND")
            salt = secrets.token_bytes(16)
            user.update(
                salt=base64.b64encode(salt).decode(),
                iterations=ITERATIONS,
                hash=_hash(password, salt),
            )
            self._write(users)

    def remove(self, username: str) -> None:
        with self._lock:
            users = self._read()
            user = next((u for u in users if u["username"] == username), None)
            if not user:
                raise AccountError("E_USER_NOT_FOUND")
            if user["role"] == "admin" and sum(u["role"] == "admin" for u in users) == 1:
                raise AccountError("E_LAST_ADMIN")  # never lock everyone out
            self._write([u for u in users if u["username"] != username])


class LoginThrottle:
    """Slows password guessing: after N failures for a username within the window, logins are refused."""

    def __init__(self, max_failures: int = 5, window_s: int = 300, now=time.monotonic):
        self._max, self._window, self._now = max_failures, window_s, now
        self._fails: dict[str, list[float]] = {}

    def blocked(self, key: str) -> bool:
        t = self._now()
        recent = [x for x in self._fails.get(key, []) if t - x < self._window]
        if recent:
            self._fails[key] = recent
        else:
            self._fails.pop(key, None)
        return len(recent) >= self._max

    def failed(self, key: str) -> None:
        self._fails.setdefault(key, []).append(self._now())

    def succeeded(self, key: str) -> None:
        self._fails.pop(key, None)
