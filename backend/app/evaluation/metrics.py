"""WER and speaker-accuracy harness (§14 Phase 2 gate, §15.1). Uses the mock as the baseline.

Results measure the harness and the synthetic sets, NOT any real provider's accuracy.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.providers.mock import CASE_PREFIX, MockSpeechProvider
from app.settings import Settings

CLEAR_CONFIDENCE = 0.7  # segments below this are not "clear audio" for the speaker target (§15.1)
SPEAKER_TARGET = 0.95


def _words(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.lower())


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Word-level Levenshtein distance divided by the number of reference words."""
    ref, hyp = _words(reference), _words(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / len(ref)


@dataclass
class SetResult:
    name: str
    segments: int
    wer: float
    speaker_accuracy: float  # of clearly-heard segments with an assigned (non-unknown) role
    unknown_rate: float
    clear_segments: int
    meets_speaker_target: bool


def evaluate_set(name: str, settings: Settings) -> SetResult:
    path: Path = settings.fixtures_dir / "eval" / f"{name}.json"
    truth = json.loads(path.read_text(encoding="utf8"))["segments"]
    hyp = MockSpeechProvider(settings).transcribe(CASE_PREFIX + name.encode() + b"\n")
    ref_words = hyp_words = 0
    edits = 0.0
    correct = assigned = unknown = clear = 0
    for t, h in zip(truth, hyp, strict=True):
        ref = t["reference"]
        n = len(_words(ref["text"]))
        edits += word_error_rate(ref["text"], h.original_text) * n
        ref_words += n
        hyp_words += len(_words(h.original_text))
        if h.confidence >= CLEAR_CONFIDENCE:
            clear += 1
            if h.speaker_role.value == "unknown":
                unknown += 1
            else:
                assigned += 1
                correct += h.speaker_role.value == ref["speaker_role"]
    acc = correct / assigned if assigned else 1.0
    return SetResult(
        name=name,
        segments=len(truth),
        wer=edits / ref_words if ref_words else 0.0,
        speaker_accuracy=acc,
        unknown_rate=unknown / clear if clear else 0.0,
        clear_segments=clear,
        meets_speaker_target=acc >= SPEAKER_TARGET,
    )


SETS = ("eval_english", "eval_luganda", "eval_mixed")


def evaluate_all(settings: Settings) -> list[SetResult]:
    return [evaluate_set(s, settings) for s in SETS]


def format_table(results: list[SetResult]) -> str:
    lines = ["set | segments | WER | speaker acc (clear, assigned) | unknown rate | target >=95%"]
    for r in results:
        lines.append(
            f"{r.name} | {r.segments} | {r.wer:.3f} | {r.speaker_accuracy:.3f} | "
            f"{r.unknown_rate:.3f} | {'met' if r.meets_speaker_target else 'NOT met'}"
        )
    return "\n".join(lines)
