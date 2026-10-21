"""Stage B (§6.3, §12.2): provider calls are bounded; only retryable errors are retried; every failure
is a content-free recoverable code and nothing clinical reaches the logs."""

import logging
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers import call as call_mod
from app.providers.base import ProviderError, ProviderGateError, Segment
from tests.conftest import make_settings

MARKER = "SYNTHETIC-MARKER-7Q4Z"
SEG = Segment(
    id="s1", start=0, end=1, lang="en", original_text="hello", speaker_role="doctor", confidence=0.9
)


class FakeSpeech:
    name = "fake"

    def __init__(self, behaviours):
        self.behaviours = list(behaviours)
        self.calls = 0

    def transcribe(self, audio, *, expected_languages=None):
        self.calls += 1
        b = self.behaviours[min(self.calls - 1, len(self.behaviours) - 1)]
        if callable(b):
            b()
        return [SEG]


def _client(provider, **kw):
    settings = make_settings(**kw)
    app = create_app(settings)
    app.state.speech_provider = provider
    c = TestClient(app, raise_server_exceptions=False)
    token = c.post("/auth/dev-login", json={"name": "Dr. Test"}).json()["token"]
    return c, {"Authorization": f"Bearer {token}"}, settings


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    monkeypatch.setattr(call_mod, "RETRY_BACKOFF_SECONDS", 0)


def _raise(exc):
    def f():
        raise exc

    return f


def test_slow_provider_times_out_with_recoverable_504():
    provider = FakeSpeech([lambda: time.sleep(0.5)])
    c, h, settings = _client(provider)
    settings.provider_timeout_seconds = 0.1
    r = c.post("/transcribe", content=b"audio", headers=h)
    assert r.status_code == 504
    assert r.json() == {"error": "E_PROVIDER_TIMEOUT", "class": "recoverable"}
    time.sleep(0.5)  # let the abandoned worker finish so it cannot leak into other tests


def test_timeout_is_not_retried():
    provider = FakeSpeech([lambda: time.sleep(0.4)])
    c, h, settings = _client(provider, provider_max_retries=2)
    settings.provider_timeout_seconds = 0.1
    c.post("/transcribe", content=b"audio", headers=h)
    time.sleep(0.5)
    assert provider.calls == 1


def test_retryable_error_retried_then_succeeds():
    provider = FakeSpeech(
        [_raise(ProviderError("E_PROVIDER_FAILED", retryable=True)), lambda: None]
    )
    c, h, _ = _client(provider, provider_max_retries=1)
    r = c.post("/transcribe", content=b"audio", headers=h)
    assert r.status_code == 200 and provider.calls == 2


def test_retries_are_bounded():
    provider = FakeSpeech([_raise(ProviderError("E_PROVIDER_FAILED", retryable=True))])
    c, h, _ = _client(provider, provider_max_retries=1)
    r = c.post("/transcribe", content=b"audio", headers=h)
    assert r.status_code == 502 and r.json()["error"] == "E_PROVIDER_FAILED"
    assert provider.calls == 2


def test_default_never_retries():
    provider = FakeSpeech([_raise(ProviderError("E_PROVIDER_FAILED", retryable=True))])
    c, h, _ = _client(provider)
    c.post("/transcribe", content=b"audio", headers=h)
    assert provider.calls == 1


def test_non_retryable_error_not_retried():
    provider = FakeSpeech([_raise(ProviderError("E_PROVIDER_FAILED"))])
    c, h, _ = _client(provider, provider_max_retries=2)
    r = c.post("/transcribe", content=b"audio", headers=h)
    assert r.status_code == 502 and provider.calls == 1


def test_gate_error_never_retried():
    provider = FakeSpeech([_raise(ProviderGateError())])
    c, h, _ = _client(provider, provider_max_retries=2)
    r = c.post("/transcribe", content=b"audio", headers=h)
    assert r.status_code == 503 and r.json()["error"] == "E_PROVIDER_GATE_CLOSED"
    assert provider.calls == 1


def test_failure_paths_leave_no_marker_in_logs(caplog, capfd):
    provider = FakeSpeech([lambda: time.sleep(0.3)])
    c, h, settings = _client(provider)
    settings.provider_timeout_seconds = 0.1
    with caplog.at_level(logging.DEBUG):
        c.post(
            "/transcribe", content=MARKER.encode(), headers={**h, "X-Expected-Languages": MARKER}
        )
    time.sleep(0.4)
    out, err = capfd.readouterr()
    assert MARKER not in caplog.text and MARKER not in out and MARKER not in err


def test_extract_provider_timeout_is_recoverable_504():
    class SlowExtract:
        def extract(self, segments, present):
            time.sleep(0.4)

    c, h, settings = _client(FakeSpeech([lambda: None]))
    c.app.state.extract_provider = SlowExtract()
    settings.provider_timeout_seconds = 0.1
    from tests.test_extract_route import HEADER

    r = c.post("/extract", json={"segments": [SEG.model_dump()], "header": HEADER}, headers=h)
    assert r.status_code == 504 and r.json()["error"] == "E_PROVIDER_TIMEOUT"
    time.sleep(0.5)
