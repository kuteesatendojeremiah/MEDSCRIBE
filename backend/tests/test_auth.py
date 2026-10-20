"""FR-01, §10.4, rule 9: tokens in the Authorization header only; tampering is terminal."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.security.tokens import TokenError, TokenService
from tests.conftest import make_settings


def test_no_token_is_terminal_401(client):
    r = client.post("/transcribe", content=b"abc")
    assert r.status_code == 401
    assert r.json() == {"error": "E_TOKEN_MISSING", "class": "terminal"}


def test_tampered_token_is_terminal(client, auth):
    bad = auth["Authorization"][:-3] + "xyz"
    r = client.post("/transcribe", content=b"abc", headers={"Authorization": bad})
    assert r.status_code == 401
    assert r.json()["class"] == "terminal"


def test_token_in_url_is_never_accepted(client, auth):
    token = auth["Authorization"].split()[1]
    r = client.post(f"/transcribe?token={token}", content=b"abc")
    assert r.status_code == 401


def test_dev_login_can_be_disabled():
    c = TestClient(create_app(make_settings(dev_auth_enabled=False)), raise_server_exceptions=False)
    assert c.post("/auth/dev-login", json={"name": "x"}).status_code == 404


def test_refresh_returns_new_token_and_revoke_blocks_it(client, auth):
    r = client.post("/auth/refresh", headers=auth)
    assert r.status_code == 200
    new = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.delete("/auth/session", headers=new).status_code == 204
    assert client.post("/transcribe", content=b"abc", headers=new).status_code == 401


def test_token_expires_after_ttl():
    clock = [1000.0]
    svc = TokenService(make_settings(token_ttl_seconds=900), lambda: clock[0])
    tok = svc.issue("d")
    clock[0] += 899
    svc.verify(tok)
    clock[0] += 2
    with pytest.raises(TokenError):
        svc.verify(tok)


def test_refresh_can_never_pass_the_two_hour_limit():
    clock = [0.0]
    svc = TokenService(
        make_settings(token_ttl_seconds=900, token_absolute_seconds=7200),
        lambda: clock[0],
    )
    token = svc.issue("d")
    t = 0
    refreshed_after_limit = False
    for _ in range(40):  # keep renewing every 10 minutes for far longer than 2 hours
        t += 600
        clock[0] = float(t)
        try:
            claims = svc.verify(token)
            token = svc.refresh(claims)
            refreshed_after_limit = refreshed_after_limit or t >= 7200
        except TokenError:
            break
    assert t <= 7200 + 600
    assert not refreshed_after_limit


def test_rate_limit_is_recoverable():
    c = TestClient(
        create_app(make_settings(rate_limit_per_minute=2)),
        raise_server_exceptions=False,
    )
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    codes = [c.post("/transcribe", content=b"abc", headers=h).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
