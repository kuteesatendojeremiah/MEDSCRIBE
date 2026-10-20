"""Extraction provider selection (§7.3, §10.5). The deterministic mock is the default; a real
structured-output model may only run after the provider gate (CLAUDE.md rule 7)."""

from typing import Protocol

from app.extract.rules import MockExtractor
from app.providers.base import ProviderGateError, Segment
from app.providers.real import assert_gate_open
from app.settings import Settings


class ExtractProvider(Protocol):
    name: str

    def extract(self, segments: list[Segment], present: list[str]) -> dict: ...


class RealExtractAdapter:
    """Stub: construction enforces the gate; no model call is implemented."""

    def __init__(self, settings: Settings, name: str):
        assert_gate_open(settings, name)
        self.name = name

    def extract(self, segments: list[Segment], present: list[str]) -> dict:
        raise NotImplementedError("real extraction adapters are not implemented (provider gate)")


def get_extract_provider(settings: Settings) -> ExtractProvider:
    if settings.provider in ("mock", "local_whisper"):
        # local_whisper only replaces speech-to-text; notes are still built by the local rule engine
        return MockExtractor()
    if settings.provider not in ("local_model", "cloud_speech"):
        raise ProviderGateError("E_PROVIDER_UNKNOWN")
    return RealExtractAdapter(settings, settings.provider)
