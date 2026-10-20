"""Findings from the code-review pass: bounded JSON bodies, no crash on odd hashes, content-free
validation errors (Blueprint §10.1, §10.4, §12)."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.render.hash import hashes_match, note_hash
from tests.conftest import make_settings

ROOT = Path(__file__).resolve().parents[2]
FINAL = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))


def authed(**kw):
    c = TestClient(create_app(make_settings(**kw)), raise_server_exceptions=False)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    return c, {"Authorization": f"Bearer {tok}"}


def test_oversized_json_body_is_refused_before_parsing_on_extract_and_render():
    c, h = authed(max_json_bytes=1000)
    big = {"segments": [], "header": {}, "pad": "x" * 5000}
    for path in ("/extract", "/render"):
        r = c.post(path, json=big, headers=h)
        assert r.status_code == 413, path
        assert r.json() == {"error": "E_BODY_TOO_LARGE", "class": "recoverable"}


def test_normal_sized_bodies_still_work():
    c, h = authed()
    r = c.post("/render?mode=preview", json={"note": FINAL}, headers=h)
    assert r.status_code == 200


def test_non_ascii_or_garbage_hash_is_a_clean_terminal_refusal_not_a_crash():
    c, h = authed()
    for bad in ("é" * 64, "", "0" * 63, "zz", "\u0000"):
        r = c.post("/render?mode=final", json={"note": FINAL, "approved_hash": bad}, headers=h)
        assert r.status_code == 409, repr(bad)
        assert r.json() == {"error": "E_HASH_MISMATCH", "class": "terminal"}


def test_hashes_match_handles_non_ascii_directly():
    assert hashes_match(FINAL, note_hash(FINAL)) is True
    assert hashes_match(FINAL, note_hash(FINAL).upper()) is True
    assert hashes_match(FINAL, "é") is False


def test_validation_errors_are_content_free_and_never_echo_the_input():
    c, h = authed()
    secret = "SYNTHETIC-MARKER-7Q4Z"
    r = c.post(f"/render?format={secret}", json={"note": FINAL}, headers=h)
    assert r.status_code == 422
    assert r.json() == {"error": "E_BAD_REQUEST", "class": "recoverable"}
    assert secret not in r.text
    r = c.post("/auth/dev-login", json={"name": secret, "extra": 1})
    assert secret not in r.text or r.status_code == 200  # dev login echoes only the typed name
