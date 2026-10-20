"""§10.2: the single-container app serves the SPA and the API, both no-store, no service worker."""

from fastapi.testclient import TestClient

from app.web import create_web_app
from tests.conftest import make_settings


def make_client(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>Mediscribe</title>")
    (tmp_path / "app.js").write_text("console.log(1)")
    app = create_web_app(make_settings(), static_dir=tmp_path)
    return TestClient(app, raise_server_exceptions=False)


def test_pages_and_assets_are_no_store(tmp_path):
    c = make_client(tmp_path)
    for path in ("/", "/index.html", "/app.js"):
        r = c.get(path)
        assert r.status_code == 200, path
        assert r.headers["cache-control"] == "no-store", path
        assert r.headers["x-content-type-options"] == "nosniff", path


def test_api_is_mounted_under_api_and_is_no_store(tmp_path):
    c = make_client(tmp_path)
    r = c.get("/api/health")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    tok = c.post("/api/auth/dev-login", json={"name": "d"}).json()["token"]
    t = c.post("/api/transcribe", content=b"abc", headers={"Authorization": f"Bearer {tok}"})
    assert t.status_code == 200 and t.headers["cache-control"] == "no-store"


def test_no_service_worker_is_served(tmp_path):
    c = make_client(tmp_path)
    for path in ("/sw.js", "/service-worker.js", "/manifest.webmanifest"):
        assert c.get(path).status_code == 404
