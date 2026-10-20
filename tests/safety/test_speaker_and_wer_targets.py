"""§15.1: speaker-role accuracy on clear audio (>= 95%, the rest Unknown) and WER baseline.

These measure the harness on synthetic sets with the MOCK provider. The mixed set carries a
deliberate nurse->doctor error and is expected to MISS the target, proving the harness can fail.
"""

from app.evaluation.metrics import SPEAKER_TARGET, evaluate_all
from app.settings import Settings


def results():
    return {r.name: r for r in evaluate_all(Settings(_env_file=None))}


def test_clear_audio_speaker_accuracy_meets_target_on_english_and_luganda():
    r = results()
    assert r["eval_english"].speaker_accuracy >= SPEAKER_TARGET
    assert r["eval_luganda"].speaker_accuracy >= SPEAKER_TARGET


def test_mixed_set_deliberately_misses_the_target():
    assert results()["eval_mixed"].meets_speaker_target is False


def test_wer_baseline_is_recorded_for_all_three_languages_sets():
    r = results()
    assert set(r) == {"eval_english", "eval_luganda", "eval_mixed"}
    assert all(
        0 <= x.wer < 0.2 for x in r.values()
    )  # baseline only; targets set before Phase 3 use
