"""Found by running a real spoken example through the local speech model: speech recognition writes
numbers as words, a named allergen is not a medicine, and 'night-time breathlessness: no' must not
conflict with 'breathless on stairs: yes'."""

import pytest

from app.extract.numwords import words_to_digits
from safety_helpers import reviews, run, seg, texts


@pytest.mark.parametrize(
    "spoken,written",
    [
        ("five milligrams", "5 milligrams"),
        ("five hundred milligrams", "500 milligrams"),
        ("one hundred and sixty over one hundred", "160 over 100"),
        ("pulse is eighty-eight and regular", "pulse is 88 and regular"),
        ("weight is seventy four kilograms", "weight is 74 kilograms"),
        ("two point five milligrams", "2.5 milligrams"),
        ("a hundred and fifty over ninety five", "150 over 95"),
        ("for two weeks", "for 2 weeks"),
        ("come back in four weeks", "come back in 4 weeks"),
        ("one thousand units", "1000 units"),
    ],
)
def test_number_words_become_digits(spoken, written):
    assert words_to_digits(spoken) == written


@pytest.mark.parametrize(
    "text",
    [
        "the one for pressure",  # a lone 'one' is not a number
        "three times daily",  # a frequency phrase the medication rules read as words
        "twice a day",
        "once daily",
        "I have a cough",
        "no change",
    ],
)
def test_ordinary_words_and_frequency_phrases_are_left_alone(text):
    assert words_to_digits(text) == text


def test_spoken_doses_are_read_correctly_and_each_drug_keeps_its_own():
    note, _ = run(
        [
            seg(
                1,
                "patient",
                "I take amlodipine five milligrams once daily and metformin five hundred milligrams twice daily.",
            )
        ]
    )
    meds = texts(note, "meds_allergies")
    assert "Amlodipine 5 mg once daily" in meds and "Metformin 500 mg twice daily" in meds
    assert not reviews(note, "HIGH") or all(
        "not stated" not in r["reason"] for r in reviews(note, "HIGH")
    )


def test_spoken_blood_pressure_pulse_and_weight():
    note, _ = run(
        [
            seg(1, "doctor", "Blood pressure is one hundred and sixty over one hundred."),
            seg(
                2, "doctor", "Pulse is eighty-eight and regular. Weight is seventy-four kilograms."
            ),
        ]
    )
    v = texts(note, "vitals")
    assert "BP 160/100 mmHg" in v and "Pulse 88/min, regular" in v and "Weight 74 kg" in v


def test_spoken_duration_and_follow_up():
    note, _ = run(
        [
            seg(1, "patient", "I have been breathless for two weeks."),
            seg(2, "doctor", "Come back in four weeks."),
        ]
    )
    assert "Shortness of breath for 2 weeks" in texts(note, "history")
    assert "Review in 4 weeks" in texts(note, "plan")


def test_a_named_allergen_is_an_allergy_not_a_medicine():
    note, _ = run(
        [
            seg(1, "doctor", "Any allergies to medicines?"),
            seg(2, "patient", "I am allergic to penicillin."),
        ]
    )
    assert texts(note, "meds_allergies") == ["Allergy: penicillin (patient-reported)"]
    assert not any("Penicillin" in r["reason"] for r in reviews(note, "HIGH"))


def test_a_medicine_named_beside_an_allergy_is_still_a_medicine():
    note, _ = run(
        [
            seg(
                1,
                "patient",
                "I am allergic to penicillin and I take aspirin 75 milligrams once daily.",
            )
        ]
    )
    meds = texts(note, "meds_allergies")
    assert "Allergy: penicillin (patient-reported)" in meds
    assert "Aspirin 75 mg once daily" in meds
    assert not any(m.startswith("Penicillin") for m in meds)


def test_night_time_breathlessness_denied_does_not_conflict_with_breathless_on_stairs():
    note, _ = run(
        [
            seg(1, "patient", "I have been breathless when I climb stairs for two weeks."),
            seg(2, "doctor", "Do you wake up at night short of breath?"),
            seg(3, "patient", "No."),
        ]
    )
    assert any("night" in t.lower() and t.startswith("No") for t in texts(note, "history"))
    assert not any("Conflicting" in r["reason"] for r in reviews(note, "HIGH"))


def test_a_real_conflict_is_still_caught():
    note, _ = run(
        [
            seg(1, "patient", "I have no shortness of breath."),
            seg(2, "relative", "He is short of breath every day."),
        ]
    )
    assert any("Conflicting statements" in r["reason"] for r in reviews(note, "HIGH"))
