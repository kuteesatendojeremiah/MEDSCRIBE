"""Adapter STUBS for real speech/translation/LLM providers (§10.5, §13.1).

They refuse to run unless PROVIDER_GATE_APPROVED=true AND the provider is listed in the allow-list
configuration. No network call is implemented: this phase only defines the seam, so a real adapter
can be added after the written provider-gate checklist is complete for that exact endpoint.
"""

from typing import Optional

from app.providers.base import ProviderGateError, Segment
from app.settings import Settings

# Names that may be configured once a provider passes the gate. Nothing is implemented for them.
KNOWN_REAL_PROVIDERS = frozenset({"local_model", "cloud_speech", "local_whisper"})


def assert_gate_open(settings: Settings, name: str) -> None:
    if not settings.provider_gate_approved:
        raise ProviderGateError("E_PROVIDER_GATE_CLOSED")
    if name not in settings.provider_allow_list:
        raise ProviderGateError("E_PROVIDER_NOT_ALLOWED")


class RealSpeechAdapter:
    """Placeholder real adapter. Construction itself enforces the gate."""

    def __init__(self, settings: Settings, name: str):
        if name not in KNOWN_REAL_PROVIDERS:
            raise ProviderGateError("E_PROVIDER_UNKNOWN")
        assert_gate_open(settings, name)
        self.name = name

    def transcribe(
        self, audio: bytes, *, expected_languages: Optional[str] = None
    ) -> list[Segment]:
        raise NotImplementedError("real provider adapters are not implemented (provider gate)")
