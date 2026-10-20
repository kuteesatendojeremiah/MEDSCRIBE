"""§10.1 / FR-17: request and response bodies are never logged."""

import logging

from fastapi.testclient import TestClient

from app.logging_filter import BANNED_FIELDS, ClinicalContentFilter, configure_logging
from app.main import create_app

MARKER = "SYNTHETIC-MARKER-7Q4Z"


def _record(msg="m", args=None, **extra):
    r = logging.LogRecord("t", logging.INFO, __file__, 1, msg, args, None)
    for k, v in extra.items():
        setattr(r, k, v)
    return r


def test_filter_drops_banned_extra_fields():
    f = ClinicalContentFilter()
    for name in ("text", "transcript", "audio", "note", "prompt", "content"):
        assert name in BANNED_FIELDS
        assert f.filter(_record(**{name: MARKER})) is False


def test_filter_drops_banned_keys_in_dict_args():
    f = ClinicalContentFilter()
    assert f.filter(_record("%(text)s", ({"text": MARKER},))) is False
    assert f.filter(_record("%(ok)s", ({"ok": "fine"},))) is True


def test_filter_keeps_clean_records():
    assert ClinicalContentFilter().filter(_record("health check", status=200)) is True


def test_marker_in_request_body_never_logged(caplog):
    configure_logging()
    app = create_app()

    @app.post("/echo-test")
    def echo(payload: dict):
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)
    with caplog.at_level(logging.DEBUG):
        client.post("/echo-test", json={"text": MARKER, "transcript": MARKER})
        client.post("/health", json={"text": MARKER})  # 405 path
        client.post("/echo-test", content=MARKER)  # 422 path
    assert MARKER not in caplog.text
    assert MARKER not in " ".join(r.getMessage() for r in caplog.records)


def test_patient_label_is_a_banned_log_field():
    assert "patient_label" in BANNED_FIELDS
    assert ClinicalContentFilter().filter(_record(patient_label=MARKER)) is False
