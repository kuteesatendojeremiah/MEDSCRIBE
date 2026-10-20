"""FR-04: transcribe with language, translation and speaker role; request-scoped memory only."""

import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings

ROLES = {"doctor", "patient", "relative", "other_clinician", "interpreter", "unknown"}


def test_default_case_is_kato_with_originals_and_translations(client, auth):
    r = client.post("/transcribe", content=b"fake-audio", headers=auth)
    assert r.status_code == 200
    segs = r.json()["segments"]
    assert len(segs) == 15
    assert segs[0]["original_text"].startswith("Musawo")
    assert segs[0]["english_text"].startswith("Doctor, I have chest pain")
    assert {s["speaker_role"] for s in segs} <= ROLES


def test_unknown_is_never_forced_for_inaudible(client, auth):
    segs = client.post("/transcribe", content=b"x", headers=auth).json()["segments"]
    inaudible = next(s for s in segs if s["original_text"] == "[inaudible]")
    assert inaudible["speaker_role"] == "unknown" and inaudible["confidence"] < 0.5


def test_response_is_no_store(client, auth):
    r = client.post("/transcribe", content=b"x", headers=auth)
    assert r.headers["cache-control"] == "no-store"


def test_empty_audio_rejected_recoverably(client, auth):
    r = client.post("/transcribe", content=b"", headers=auth)
    assert r.status_code == 400 and r.json()["class"] == "recoverable"


def test_provider_failure_is_recoverable_with_content_free_code(client, auth):
    r = client.post("/transcribe", content=b"MOCKCASE:fail\nxxx", headers=auth)
    assert r.status_code == 502
    assert r.json() == {"error": "E_PROVIDER_TIMEOUT", "class": "recoverable"}


def test_path_traversal_case_name_is_refused(client, auth):
    r = client.post("/transcribe", content=b"MOCKCASE:../../etc/passwd\n", headers=auth)
    assert r.status_code == 502 and r.json()["error"] == "E_UNKNOWN_CASE"


def test_upload_limit_enforced_from_header_and_stream():
    c = TestClient(create_app(make_settings(max_upload_bytes=10)), raise_server_exceptions=False)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = c.post("/transcribe", content=b"x" * 11, headers=h)
    assert r.status_code == 413 and r.json()["error"] == "E_UPLOAD_TOO_LARGE"
    chunked = c.post("/transcribe", content=iter([b"x" * 6, b"x" * 6]), headers=h)
    assert chunked.status_code == 413


def test_audio_is_not_written_to_disk(client, auth):
    """No temp files are created while transcribing (rule 3, §5.1)."""
    before = set(Path(tempfile.gettempdir()).glob("*"))
    cwd_before = set(os.listdir("."))
    client.post("/transcribe", content=b"A" * 100_000, headers=auth)
    assert set(os.listdir(".")) == cwd_before
    created = set(Path(tempfile.gettempdir()).glob("*")) - before
    assert not [p for p in created if p.is_file() and p.stat().st_size >= 100_000]
