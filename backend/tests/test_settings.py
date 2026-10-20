"""CLAUDE.md rule 7: real providers stay disabled; default provider is the mock."""

from app.settings import Settings


def test_gate_closed_by_default(monkeypatch):
    monkeypatch.delenv("PROVIDER_GATE_APPROVED", raising=False)
    monkeypatch.delenv("PROVIDER", raising=False)
    s = Settings(_env_file=None)
    assert s.provider_gate_approved is False
    assert s.provider == "mock"


def test_gate_read_from_env(monkeypatch):
    monkeypatch.setenv("PROVIDER_GATE_APPROVED", "true")
    assert Settings(_env_file=None).provider_gate_approved is True
