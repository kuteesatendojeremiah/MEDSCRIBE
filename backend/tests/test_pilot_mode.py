"""Pilot mode: the app never silently answers with the sample consultation outside dev/demo
(Blueprint §10.5, CLAUDE.md rule 7). Content-free: only booleans and labels."""

from fastapi.testclient import TestClient

from app.main import create_app
from app.web import create_web_app
from tests.conftest import make_settings

LOCAL = dict(
    provider="local_whisper", provider_gate_approved=True, provider_allow_list=["local_whisper"]
)


def _web(tmp_path, **kw):
    (tmp_path / "index.html").write_text("<html></html>")
    return TestClient(create_web_app(make_settings(**kw), static_dir=tmp_path))


def test_info_mode_is_demo_for_mock_and_pilot_for_a_real_local_model():
    assert TestClient(create_app(make_settings())).get("/info").json()["mode"] == "demo"
    assert TestClient(create_app(make_settings(**LOCAL))).get("/info").json()["mode"] == "pilot"


def test_closed_gate_never_claims_pilot():
    closed = make_settings(provider="local_whisper")
    assert TestClient(create_app(closed)).get("/info").json()["mode"] == "demo"


def test_not_ready_when_pilot_environment_would_serve_the_mock(tmp_path):
    r = _web(tmp_path, environment="pilot").get("/api/ready")  # provider defaults to mock
    assert r.status_code == 503 and r.json()["provider"] is False


def test_ready_with_mock_in_dev_and_demo_environments(tmp_path):
    for env in ("dev", "demo"):
        assert _web(tmp_path, environment=env).get("/api/ready").status_code == 200


def test_ready_in_pilot_with_the_local_model(tmp_path):
    assert _web(tmp_path, environment="pilot", **LOCAL).get("/api/ready").status_code == 200
