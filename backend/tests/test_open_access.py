"""ADR-0011: OPEN_ACCESS starts a guest session without a sign-in form. Demo only: it needs
SYNTHETIC_ONLY, is off by default, and every guest token keeps expiry, revocation and rate limits."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from tests.conftest import make_settings
from tests.test_render import FINAL


def _client(**kw):
    return TestClient(
        create_app(make_settings(dev_auth_enabled=False, **kw)), raise_server_exceptions=False
    )


def test_off_by_default_and_the_endpoint_is_hidden():
    c = _client()
    assert c.get("/auth/status").json()["open_access"] is False
    r = c.post("/auth/open")
    assert r.status_code == 404 and r.json()["error"] == "E_NOT_FOUND"


def test_open_access_is_refused_for_non_synthetic_deployments():
    with pytest.raises(ValidationError) as exc:
        make_settings(open_access=True, synthetic_only=False)
    assert "open_access" in str(exc.value)


def test_guest_session_works_without_credentials():
    c = _client(open_access=True)
    assert c.get("/auth/status").json()["open_access"] is True
    body = c.post("/auth/open").json()
    assert body["user"]["role"] == "doctor" and body["expires_in"] > 0
    h = {"Authorization": f"Bearer {body['token']}"}
    r = c.post("/render?mode=preview", json={"note": FINAL}, headers=h)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"


def test_guest_cannot_use_admin_routes():
    c = _client(open_access=True)
    h = {"Authorization": "Bearer " + c.post("/auth/open").json()["token"]}
    assert c.get("/admin/users", headers=h).status_code == 403


def test_each_guest_gets_its_own_identity_and_clearing_revokes_it():
    c = _client(open_access=True)
    a = c.post("/auth/open").json()
    b = c.post("/auth/open").json()
    assert a["user"]["username"] != b["user"]["username"]
    ha = {"Authorization": f"Bearer {a['token']}"}
    assert c.delete("/auth/session", headers=ha).status_code == 204
    assert c.post("/auth/refresh", headers=ha).status_code == 401  # revoked, cannot be revived


def test_starting_sessions_is_rate_limited_globally():
    c = _client(open_access=True, open_sessions_per_minute=3)
    codes = [c.post("/auth/open").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
    assert c.post("/auth/open").json()["error"] == "E_RATE_LIMITED"


def test_no_open_endpoint_when_disabled_even_with_dev_login_off():
    c = _client(open_access=False)
    assert c.post("/auth/dev-login", json={"name": "x"}).status_code == 404
    assert c.post("/auth/open").status_code == 404
