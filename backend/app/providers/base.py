"""Provider interfaces (Blueprint §5.1, §7, §10.5, §13).

Providers hold no state between calls. Nothing here logs audio, text or prompts (§10.1).
"""

from typing import Optional, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.schema.models import SpeakerRole


class Segment(BaseModel):
    """One transcript segment (Phase 2 interface)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    start: float
    end: float
    lang: str
    original_text: str
    english_text: Optional[str] = None
    speaker_role: SpeakerRole
    confidence: float = Field(ge=0.0, le=1.0)
    # Which voice this sounds like (1, 2): a hint for assigning roles, never a role itself (§7.2).
    voice: Optional[int] = None


class ProviderError(Exception):
    """Recoverable provider failure (timeout, unavailable). Carries a content-free code only."""

    def __init__(self, code: str = "E_PROVIDER_FAILED"):
        super().__init__(code)
        self.code = code


class ProviderGateError(ProviderError):
    """Raised when a real provider is used while the gate is closed or the provider not allowed."""

    def __init__(self, code: str = "E_PROVIDER_GATE_CLOSED"):
        super().__init__(code)


class SpeechProvider(Protocol):
    name: str

    def transcribe(
        self, audio: bytes, *, expected_languages: Optional[str] = None
    ) -> list[Segment]:
        """Return transcript segments with language, translation and speaker role."""
        ...
