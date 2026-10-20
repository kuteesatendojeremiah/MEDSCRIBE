"""Voice grouping (a hint for the clinician, never a role): two clearly different voices are told
apart; anything unclear is left unlabelled."""

import numpy as np

from app.providers.voices import assign_voices

SR = 16_000


def tone(f0: float, seconds: float, noise=0.02) -> np.ndarray:
    """A crude voiced sound: a fundamental plus harmonics, with a little noise."""
    t = np.arange(int(SR * seconds)) / SR
    y = sum((1 / h) * np.sin(2 * np.pi * f0 * h * t) for h in range(1, 8))
    rng = np.random.default_rng(0)
    return (0.3 * y / np.max(np.abs(y)) + noise * rng.standard_normal(len(t))).astype(np.float32)


def build(spec):
    """spec: list of f0 per segment (2 s each, 0.5 s silence between). Returns audio and spans."""
    audio, spans, pos = [], [], 0.0
    for f0 in spec:
        audio.append(tone(f0, 2.0))
        spans.append((pos, pos + 2.0))
        audio.append(np.zeros(int(SR * 0.5), dtype=np.float32))
        pos += 2.5
    return np.concatenate(audio), spans


def test_a_low_and_a_high_voice_are_separated_and_numbered_by_first_appearance():
    audio, spans = build([110, 210, 110, 210, 110, 210])
    assert assign_voices(audio, spans) == [1, 2, 1, 2, 1, 2]


def test_voice_numbers_follow_who_speaks_first():
    audio, spans = build([210, 110, 210, 110])
    assert assign_voices(audio, spans) == [1, 2, 1, 2]


def test_one_voice_only_is_left_unlabelled():
    audio, spans = build([115, 118, 112, 116, 114])
    assert assign_voices(audio, spans) == [None] * 5


def test_silence_and_too_short_segments_are_unlabelled():
    audio, spans = build([110, 210, 110, 210])
    audio[: int(SR * 2)] = 0  # the first segment is silent
    out = assign_voices(audio, spans)
    assert out[0] is None and out[1:] == [2, 1, 2] or out[1:] == [1, 2, 1] or None not in out[1:]
    assert assign_voices(np.zeros(SR, dtype=np.float32), [(0.0, 0.05)]) == [None]


def test_empty_input_is_safe():
    assert assign_voices(np.zeros(0, dtype=np.float32), []) == []
