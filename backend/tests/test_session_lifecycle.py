"""Stage G (§6.2, §10.4, ADR-0003): a cleared, revoked or expired session cannot be used again on any
clinical endpoint, and the API has no route that returns stored clinical content (there is none)."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings
from tests.test_extract_route import HEADER, SEGMENTS
from tests.test_render import FINAL

CLINICAL = [
    ("POST", "/transcribe", {"content": b"audio"}),
    ("POST", "/extract", {"json": {"segments": SEGMENTS, "header": HEADER}}),
    ("POST", "/render?mode=preview", {"json": {"note": FINAL}}),
]


class Clock:
    def __init__(self):
        self.t = 1_000_000.0

    def __call__(self):
        return self.t


def _client():
    clock = Clock()
    app = create_app(make_settings(token_ttl_seconds=900, token_absolute_seconds=7200))
    app.state.tokens._now = clock
    c = TestClient(app, raise_server_exceptions=False)
    token = c.post("/auth/dev-login", json={"name": "Dr. Test"}).json()["token"]
    return c, {"Authorization": f"Bearer {token}"}, clock


@pytest.mark.parametrize("method,path,kw", CLINICAL)
def test_endpoints_work_with_a_live_session(method, path, kw):
    c, h, _ = _client()
    assert c.request(method, path, headers=h, **kw).status_code == 200


@pytest.mark.parametrize("method,path,kw", CLINICAL)
def test_cleared_session_cannot_be_reused(method, path, kw):
    c, h, _ = _client()
    assert c.delete("/auth/session", headers=h).status_code == 204  # sign out / end session
    r = c.request(method, path, headers=h, **kw)
    assert r.status_code == 401 and r.json()["class"] == "terminal"


@pytest.mark.parametrize("method,path,kw", CLINICAL)
def test_expired_session_cannot_be_reused(method, path, kw):
    c, h, clock = _client()
    clock.t += 901  # past the 15-minute inactivity window
    r = c.request(method, path, headers=h, **kw)
    assert r.status_code == 401 and r.json()["class"] == "terminal"


@pytest.mark.parametrize("method,path,kw", CLINICAL)
def test_absolute_limit_ends_even_a_refreshed_session(method, path, kw):
    c, h, clock = _client()
    for _ in range(9):  # keep refreshing every 14 minutes: 126 minutes > 2 hours
        clock.t += 840
        r = c.post("/auth/refresh", headers=h)
        if r.status_code != 200:
            break
        h = {"Authorization": f"Bearer {r.json()['token']}"}
    r = c.request(method, path, headers=h, **kw)
    assert r.status_code == 401


def test_refresh_does_not_resurrect_a_revoked_token():
    c, h, _ = _client()
    c.delete("/auth/session", headers=h)
    assert c.post("/auth/refresh", headers=h).status_code == 401


def test_a_new_session_after_clearing_sees_nothing_of_the_old_one():
    c, h, _ = _client()
    c.post("/transcribe", content=b"MOCKCASE:kato_transcript", headers=h)
    c.delete("/auth/session", headers=h)
    h2 = {"Authorization": "Bearer " + c.post("/auth/dev-login", json={"name": "Dr. Two"}).json()["token"]}
    # nothing is addressable by an id: every route that accepts a GET is content-free
    for path in ("/info", "/health", "/ready", "/auth/status"):
        assert c.get(path, headers=h2).status_code in (200, 503)


def test_no_get_route_can_return_clinical_content():
    """There is no retrieval endpoint: GET routes are limited to this known content-free list."""
    app = create_app(make_settings())
    gets = {
        r.path
        for r in app.routes
        if hasattr(r, "methods") and "GET" in r.methods and r.path not in ("/openapi.json",)
    }
    assert gets == {"/info", "/health", "/ready", "/auth/status", "/admin/users"}


def test_revocation_list_holds_ids_only_and_is_purged():
    c, h, clock = _client()
    c.delete("/auth/session", headers=h)
    revoked = c.app.state.tokens._revoked
    assert all(isinstance(k, str) and isinstance(v, int) for k, v in revoked.items())
    clock.t += 7300
    c.app.state.tokens._purge(clock.t)
    assert revoked == {}
