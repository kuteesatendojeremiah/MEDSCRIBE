"""POST /extract (FR-06, FR-08, §12.2): schema-validated note out; invalid output is recoverable."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings

ROOT = Path(__file__).resolve().parents[2]
SEGMENTS = json.loads((ROOT / "fixtures/synthetic/kato_transcript.json").read_text("utf8"))[
    "segments"
]
HEADER = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))[
    "header"
]


def post(client, auth, segments=SEGMENTS, header=HEADER):
    return client.post("/extract", json={"segments": segments, "header": header}, headers=auth)


def test_extract_returns_the_kato_note(client, auth):
    r = post(client, auth)
    assert r.status_code == 200
    note = r.json()["note"]
    frozen = json.loads(
        (ROOT / "fixtures/synthetic/kato_extraction_expected.json").read_text("utf8")
    )
    assert note == frozen
    assert r.headers["cache-control"] == "no-store"


def test_extract_requires_a_token(client):
    r = client.post("/extract", json={"segments": SEGMENTS, "header": HEADER})
    assert r.status_code == 401 and r.json()["class"] == "terminal"


def test_bad_request_is_recoverable_422(client, auth):
    r = client.post("/extract", json={"segments": "nope"}, headers=auth)
    assert r.status_code == 422 and r.json() == {
        "error": "E_BAD_REQUEST",
        "class": "recoverable",
    }


def test_invalid_provider_output_is_rejected_whole_and_recoverable(auth):
    class Bad:
        name = "bad"

        def extract(self, segments, present):
            return {"items": [{"section": "history", "text": "x"}]}  # schema-invalid

    app = create_app(make_settings())
    app.state.extract_provider = Bad()
    c = TestClient(app, raise_server_exceptions=False)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    r = post(c, {"Authorization": f"Bearer {tok}"})
    assert r.status_code == 502
    assert r.json() == {"error": "E_EXTRACT_INVALID", "class": "recoverable"}
    assert "items" not in r.text and "note" not in r.text  # no partial output


def test_extract_gate_error_when_a_real_provider_is_configured():
    c = TestClient(
        create_app(make_settings(provider="cloud_speech")),
        raise_server_exceptions=False,
    )
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    r = post(c, {"Authorization": f"Bearer {tok}"})
    assert r.status_code == 503 and r.json()["error"] == "E_PROVIDER_GATE_CLOSED"


def test_marker_in_transcript_is_not_logged(client, auth, caplog, capfd):
    import logging

    marker = "SYNTHETIC-MARKER-7Q4Z"
    segs = [dict(SEGMENTS[0], original_text=f"I have a cough {marker}", english_text=None)]
    with caplog.at_level(logging.DEBUG):
        post(client, auth, segs)
    out, err = capfd.readouterr()
    assert marker not in caplog.text and marker not in out and marker not in err
