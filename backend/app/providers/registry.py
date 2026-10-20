"""Provider selection. The mock is the default; real adapters pass through the gate (§10.5)."""

from app.providers.base import SpeechProvider
from app.providers.mock import MockSpeechProvider
from app.providers.real import RealSpeechAdapter
from app.settings import Settings


def get_speech_provider(settings: Settings) -> SpeechProvider:
    if settings.provider == "mock":
        return MockSpeechProvider(settings)
    if settings.provider == "local_whisper":
        from app.providers.local_whisper import LocalWhisperProvider
        from app.providers.real import assert_gate_open

        assert_gate_open(settings, "local_whisper")  # still behind the gate (§10.5)
        return LocalWhisperProvider(settings.whisper_model)
    return RealSpeechAdapter(settings, settings.provider)
