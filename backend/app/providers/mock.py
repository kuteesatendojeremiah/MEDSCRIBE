"""Deterministic mock speech provider (CLAUDE.md rule 7: the default provider).

The audio bytes are ignored except for an optional `MOCKCASE:<name>\\n` prefix that selects a
synthetic case. The default case is the fictional Kato consultation (§18).
"""

import json
from pathlib import Path
from typing import Optional

from app.providers.base import ProviderError, Segment
from app.settings import Settings

CASE_PREFIX = b"MOCKCASE:"
DEFAULT_CASE = "kato_transcript"
FAIL_CASE = "fail"  # lets tests exercise the recoverable-error path


def select_case(audio: bytes) -> str:
    if audio.startswith(CASE_PREFIX):
        line = audio[len(CASE_PREFIX) :].split(b"\n", 1)[0]
        return line.decode("ascii", "ignore").strip()
    return DEFAULT_CASE


class MockSpeechProvider:
    name = "mock"

    def __init__(self, settings: Settings):
        self._dir: Path = settings.fixtures_dir

    def _load(self, case: str) -> list[Segment]:
        if not case.replace("_", "").isalnum():
            raise ProviderError("E_UNKNOWN_CASE")
        path = self._dir / ("eval" if case.startswith("eval_") else "") / f"{case}.json"
        if not path.is_file():
            raise ProviderError("E_UNKNOWN_CASE")
        data = json.loads(path.read_text(encoding="utf8"))
        raw = data["segments"]
        if case.startswith("eval_"):  # evaluation sets carry reference and hypothesis side by side
            raw = [s["hypothesis"] for s in raw]
        return [Segment.model_validate(s) for s in raw]

    def transcribe(
        self, audio: bytes, *, expected_languages: Optional[str] = None
    ) -> list[Segment]:
        case = select_case(audio)
        if case == FAIL_CASE:
            raise ProviderError("E_PROVIDER_TIMEOUT")
        return self._load(case)
