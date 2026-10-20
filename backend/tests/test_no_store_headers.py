"""§10.2 / §15.2: every response carries no-store, Pragma and nosniff (CLAUDE.md rule 8)."""

from fastapi.testclient import TestClient

from app.main import create_app

EXPECTED = {
    "cache-control": "no-store",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
}


def _assert_headers(r):
    for k, v in EXPECTED.items():
        assert r.headers.get(k) == v, k


def test_ok_response(client):
    _assert_headers(client.get("/health"))


def test_404_response(client):
    r = client.get("/nope")
    assert r.status_code == 404
    _assert_headers(r)


def test_405_response(client):
    r = client.post("/health")
    assert r.status_code == 405
    _assert_headers(r)


def test_unhandled_error_response():
    app = create_app()

    @app.get("/boom")
    def boom():
        raise RuntimeError("x")

    r = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert r.status_code == 500
    _assert_headers(r)
