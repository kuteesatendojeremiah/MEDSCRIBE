"""§14 Phase 2 gate, §15.1: WER and speaker-accuracy harness on synthetic sets (mock baseline)."""

import pytest

from app.evaluation.metrics import SETS, evaluate_all, evaluate_set, word_error_rate
from tests.conftest import make_settings


def test_wer_known_values():
    assert word_error_rate("a b c d", "a b c d") == 0
    assert word_error_rate("a b c d", "a b x d") == 0.25
    assert word_error_rate("a b c d", "a b c") == 0.25  # deletion
    assert word_error_rate("a b", "a b c") == 0.5  # insertion
    assert word_error_rate("Hello, World!", "hello world") == 0  # case and punctuation ignored
    assert word_error_rate("", "") == 0


def test_harness_runs_on_english_luganda_and_mixed_sets():
    results = evaluate_all(make_settings())
    assert [r.name for r in results] == list(SETS)
    for r in results:
        assert r.segments >= 5
        assert 0 <= r.wer < 0.2  # mock hypotheses carry only a few deliberate errors
        print(f"{r.name}: WER={r.wer:.3f} speaker={r.speaker_accuracy:.3f}")


def test_low_confidence_unknown_is_excluded_from_the_speaker_target():
    r = evaluate_set("eval_english", make_settings())
    assert r.speaker_accuracy == 1.0


def test_harness_detects_a_wrong_role():
    r = evaluate_set("eval_mixed", make_settings())  # one deliberate nurse -> doctor error
    assert r.speaker_accuracy == pytest.approx(0.8)
    assert r.meets_speaker_target is False
