from fastapi.testclient import TestClient

from app.web import create_web_app
from tests.conftest import make_settings


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# --- Stage B: the real deployed mount (app.web) and readiness (spec §4) -------------------------------


def _web(tmp_path, **kw):
    (tmp_path / "index.html").write_text("<html></html>")
    return TestClient(create_web_app(make_settings(**kw), static_dir=tmp_path))


def test_api_health_through_web_mount(tmp_path):
    r = _web(tmp_path).get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert r.headers["cache-control"] == "no-store"


def test_ready_reports_booleans_only_and_no_secrets(tmp_path):
    r = _web(tmp_path, token_secret="TOP-SECRET-VALUE").get("/api/ready")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"status", "frontend", "provider"}
    assert body["status"] == "ready" and body["frontend"] is True and body["provider"] is True
    assert "TOP-SECRET-VALUE" not in r.text
    assert r.headers["cache-control"] == "no-store"


def test_ready_is_503_when_frontend_bundle_missing(tmp_path):
    client = TestClient(create_web_app(make_settings(), static_dir=tmp_path / "missing"))
    r = client.get("/api/ready")
    assert r.status_code == 503 and r.json()["status"] == "not_ready"
