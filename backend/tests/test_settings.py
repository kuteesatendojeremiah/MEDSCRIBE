"""CLAUDE.md rule 7: real providers stay disabled; default provider is the mock."""

import pytest
from pydantic import ValidationError

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


# --- Stage B: safe validation (§10.4). Messages name the variable, never the supplied value. ----------
SECRET_LIKE = "SYNTHETIC-MARKER-7Q4Z"


def test_unknown_provider_rejected_without_echoing_value():
    with pytest.raises(ValidationError) as exc:
        Settings(_env_file=None, provider=SECRET_LIKE)
    assert "provider" in str(exc.value)
    assert SECRET_LIKE not in str(exc.value)


@pytest.mark.parametrize(
    "field", ["max_upload_bytes", "max_json_bytes", "rate_limit_per_minute", "token_ttl_seconds"]
)
def test_non_positive_limits_rejected(field):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: 0})


def test_token_ttl_cannot_exceed_absolute_limit():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, token_ttl_seconds=7200, token_absolute_seconds=900)


def test_provider_timeout_and_retry_bounds():
    s = Settings(_env_file=None)
    assert s.provider_timeout_seconds == 60 and s.provider_max_retries == 0
    for bad in (
        {"provider_timeout_seconds": 0},
        {"provider_timeout_seconds": 601},
        {"provider_max_retries": -1},
        {"provider_max_retries": 3},
    ):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **bad)
