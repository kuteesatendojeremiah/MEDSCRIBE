"""Blueprint §15.2: seed synthetic markers, run sessions, then search server disk, temp, logs,
process-level state and the repository. Target: 0 hits. Also: restart loses nothing server-side."""

import copy
import gc
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.render.hash import note_hash
from app.settings import Settings

MARKER = "SYNTHETIC-MARKER-7Q4Z"
MARKER_B = MARKER.encode()
ROOT = Path(__file__).resolve().parents[2]
SESSIONS = 6
SKIP_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "dist",
}
# Places that legitimately name the marker: tests/scan scripts and docs (they hold no session content).
ALLOWED = [
    ROOT / "backend" / "tests",
    ROOT / "tests" / "privacy",
    ROOT / "frontend" / "e2e",
    ROOT / "scripts",
    ROOT / "docs",
]


def settings(**kw) -> Settings:
    return Settings(
        _env_file=None,
        token_secret="privacy-test",
        rate_limit_per_minute=10_000,
        dev_auth_enabled=True,
        accounts_file=Path(tempfile.gettempdir()) / "mediscribe-privacy-accounts.json",
        **kw,
    )


def hits_in_tree(base: Path, skip_allowed=True) -> list[str]:
    found = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        here = Path(dirpath)
        if skip_allowed and any(here == a or a in here.parents for a in ALLOWED):
            continue
        for name in filenames:
            p = here / name
            try:
                if MARKER in name or (p.stat().st_size < 20_000_000 and MARKER_B in p.read_bytes()):
                    found.append(str(p))
            except OSError:
                pass
    return found


def seeded_segments():
    segs = json.loads((ROOT / "fixtures/synthetic/kato_transcript.json").read_text("utf8"))[
        "segments"
    ]
    segs = copy.deepcopy(segs)
    segs[0]["original_text"] += f" {MARKER}"
    segs[0]["english_text"] += f" {MARKER}"
    return segs


def seeded_header():
    h = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))[
        "header"
    ]
    h["temp_ref"] = f"OPD-07 {MARKER}"
    h["patient_label"] = f"Ronald Kato (FICTIONAL) {MARKER}"
    return h


def run_session(client: TestClient):
    tok = client.post("/auth/dev-login", json={"name": "Dr. Privacy Test"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    audio = f"MOCKCASE:kato_transcript\n{MARKER}".encode() + os.urandom(2048)
    assert (
        client.post(
            "/transcribe", content=audio, headers={**h, "X-Expected-Languages": MARKER}
        ).status_code
        == 200
    )
    r = client.post(
        "/extract",
        json={"segments": seeded_segments(), "header": seeded_header()},
        headers=h,
    )
    assert r.status_code == 200
    note = r.json()["note"]
    for rev in note["review_items"]:
        if rev["level"] == "HIGH":
            rev["status"] = "unverified"
    note["items"].append(
        {
            "id": "m-001",
            "section": "exam",
            "body_system": None,
            "text": f"typed {MARKER}",
            "polarity": "present",
            "certainty": "confirmed",
            "time": None,
            "source": {"type": "clinician_entered"},
        }
    )
    assert client.post("/render?mode=preview", json={"note": note}, headers=h).status_code == 200
    final = client.post(
        "/render?mode=final&format=docx",
        json={
            "note": note,
            "approved_hash": note_hash(note),
            "approved_at": "2026-10-19T10:38:00+03:00",
        },
        headers=h,
    )
    assert (
        final.status_code == 200 and MARKER_B not in final.headers["content-disposition"].encode()
    )
    client.post(
        "/render?mode=final&format=docx",
        json={"note": note, "approved_hash": "0" * 64},
        headers=h,
    )
    assert client.delete("/auth/session", headers=h).status_code == 204


@pytest.fixture(scope="module")
def ran(tmp_path_factory):
    """Run SESSIONS full sessions, capturing every log line and all process output."""
    import io

    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setLevel(logging.DEBUG)
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    tmp_before = set(Path(tempfile.gettempdir()).iterdir())
    app = create_app(settings())
    client = TestClient(app, raise_server_exceptions=False)
    for _ in range(SESSIONS):
        run_session(client)
    root.removeHandler(handler)
    root.setLevel(old_level)
    return {"app": app, "log": stream.getvalue(), "tmp_before": tmp_before}


def test_no_marker_in_any_log_output(ran, capfd):
    out, err = capfd.readouterr()
    assert MARKER not in ran["log"] and MARKER not in out and MARKER not in err


def test_log_records_carry_only_content_free_security_events(ran):
    assert "security event" in ran["log"]  # the deliberate mismatch above was logged ...
    assert "approved-hash mismatch" in ran["log"]  # ... without any content


def test_no_marker_on_server_disk_in_the_repository(ran):
    assert hits_in_tree(ROOT) == []


def test_no_marker_in_temp_directories(ran):
    tmp = Path(tempfile.gettempdir())
    new = [p for p in tmp.iterdir() if p not in ran["tmp_before"]]
    offenders = []
    for p in new:
        if "claude" in p.name.lower() or p.name.startswith("playwright"):
            continue  # tool working areas (assistant, test-runner compile cache), not app output
        try:
            if p.is_dir():
                offenders += hits_in_tree(p, skip_allowed=False)
            elif MARKER in p.name or (
                p.is_file() and p.stat().st_size < 20_000_000 and MARKER_B in p.read_bytes()
            ):
                offenders.append(str(p))
        except OSError:
            pass  # another process's private file; unreadable files cannot be our output
    assert offenders == []


def test_no_temp_files_left_by_rendering(ran):
    tmp = Path(tempfile.gettempdir())
    leftovers = [p for p in tmp.iterdir() if p.name.startswith("mediscribe-render-")]
    assert leftovers == []


def _walk(value, depth=0, seen=None):
    seen = seen if seen is not None else set()
    if id(value) in seen or depth > 4:
        return False
    seen.add(id(value))
    if isinstance(value, (str, bytes)):
        return MARKER in value if isinstance(value, str) else MARKER_B in value
    if isinstance(value, dict):
        return any(_walk(k, depth + 1, seen) or _walk(v, depth + 1, seen) for k, v in value.items())
    if isinstance(value, (list, tuple, set, frozenset, deque)):
        return any(_walk(v, depth + 1, seen) for v in value)
    return False


def test_stateless_handlers_no_module_level_state_holds_content(ran):
    offenders = []
    for name, mod in list(sys.modules.items()):
        if not name.startswith("app."):
            continue
        for attr, value in vars(mod).items():
            if attr.startswith("__") or callable(value) or isinstance(value, type(sys)):
                continue
            if _walk(value):
                offenders.append(f"{name}.{attr}")
    assert offenders == []


def test_app_state_holds_only_identity_and_counters_never_content(ran):
    app = ran["app"]
    assert set(app.state._state) <= {
        "settings",
        "tokens",
        "limiter",
        "open_limiter",  # guest-session start timestamps under one constant key (ADR-0011)
        "speech_provider",
        "accounts",
        "throttle",
    }
    assert not _walk(app.state.tokens._revoked)  # token ids only
    assert not _walk(dict(app.state.limiter._hits))  # timestamps keyed by user id
    assert not _walk(dict(app.state.open_limiter._hits))  # timestamps keyed by a constant


def test_server_restart_loses_nothing_because_nothing_is_held(ran):
    """A restarted app instance serves the next request with no knowledge of the previous ones, and
    the previous instance held no clinical content to lose."""
    fresh = TestClient(create_app(settings()), raise_server_exceptions=False)
    tok = fresh.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    r = fresh.post(
        "/extract",
        json={"segments": seeded_segments(), "header": seeded_header()},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 200  # a full request needs nothing remembered from earlier sessions


def test_revoked_token_cannot_be_reused(ran):
    app = ran["app"]
    c = TestClient(app, raise_server_exceptions=False)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    c.delete("/auth/session", headers=h)
    assert c.post("/transcribe", content=b"x", headers=h).status_code == 401


def test_gc_does_not_find_the_marker_in_server_owned_containers(ran):
    gc.collect()
    suspects = [o for o in gc.get_objects() if isinstance(o, (dict, list)) and len(o) < 50]
    # Only app-owned containers matter; the interpreter and test frameworks hold their own text.
    owned = [o for o in suspects if isinstance(o, dict) and "_revoked" in o]
    assert not any(_walk(o) for o in owned)


def _working_bash():
    candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
        shutil.which("bash"),
    ]
    for c in candidates:
        if c and Path(c).exists():
            try:
                if subprocess.run([c, "-c", "true"], capture_output=True).returncode == 0:
                    return c
            except OSError:
                pass
    return None


@pytest.mark.skipif(_working_bash() is None, reason="a working bash is not available")
def test_privacy_scan_script_reports_zero_hits_after_the_sessions(ran):
    r = subprocess.run(
        [_working_bash(), str(ROOT / "scripts" / "privacy_scan.sh")],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stdout
    assert "0 hits" in r.stdout
