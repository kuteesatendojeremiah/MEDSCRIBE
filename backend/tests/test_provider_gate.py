"""§10.5 / CLAUDE.md rule 7: real adapters refuse to run unless the gate is open AND allow-listed."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.base import ProviderGateError
from app.providers.mock import MockSpeechProvider
from app.providers.real import RealSpeechAdapter
from app.providers.registry import get_speech_provider
from tests.conftest import make_settings


def test_default_provider_is_the_mock():
    assert isinstance(get_speech_provider(make_settings()), MockSpeechProvider)


def test_real_adapter_refuses_when_gate_closed():
    with pytest.raises(ProviderGateError) as e:
        RealSpeechAdapter(make_settings(provider_gate_approved=False), "cloud_speech")
    assert e.value.code == "E_PROVIDER_GATE_CLOSED"


def test_real_adapter_refuses_when_gate_open_but_not_allow_listed():
    s = make_settings(provider_gate_approved=True, provider_allow_list=[])
    with pytest.raises(ProviderGateError) as e:
        RealSpeechAdapter(s, "cloud_speech")
    assert e.value.code == "E_PROVIDER_NOT_ALLOWED"


def test_unknown_real_provider_name_refused():
    s = make_settings(provider_gate_approved=True, provider_allow_list=["x"])
    with pytest.raises(ProviderGateError):
        RealSpeechAdapter(s, "x")


def test_even_an_approved_real_adapter_is_only_a_stub():
    s = make_settings(provider_gate_approved=True, provider_allow_list=["cloud_speech"])
    adapter = RealSpeechAdapter(s, "cloud_speech")
    with pytest.raises(NotImplementedError):
        adapter.transcribe(b"x")


def test_registry_routes_real_name_through_the_gate():
    with pytest.raises(ProviderGateError):
        get_speech_provider(make_settings(provider="cloud_speech"))


def test_endpoint_returns_gate_error_not_a_crash():
    c = TestClient(
        create_app(make_settings(provider="cloud_speech")),
        raise_server_exceptions=False,
    )
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    r = c.post("/transcribe", content=b"abc", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 503
    assert r.json() == {"error": "E_PROVIDER_GATE_CLOSED", "class": "recoverable"}
