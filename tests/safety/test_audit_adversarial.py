"""Clinical-safety audit (docs/prompts/audits.md): five NEW adversarial synthetic cases, written
before any fix. They target the ways a rule-based or model extractor most plausibly harms a note:
a double negative, a relative contradicting the patient about a dose, a dose in the wrong unit, a
future result presented as a finding, and someone else's illness attributed to the patient."""

from safety_helpers import items, reviews, run, seg, texts


# 1. Double negative: "not true that I have no chest pain" means the pain IS present.
def test_double_negative_is_never_recorded_as_a_plain_denial():
    note, _ = run([seg(1, "patient", "It is not true that I have no chest pain.")])
    absent = [i for i in items(note, "history") if i["polarity"] == "absent"]
    assert absent == [], "a double negative must not become a denial"
    assert not any(
        i["polarity"] == "present" and "chest pain" in i["text"].lower()
        for i in items(note, "history")
    ), "and it must not be silently guessed as present either"
    assert any("ambiguous negation" in r["reason"].lower() for r in reviews(note, "CHECK"))


def test_single_negation_still_works_after_the_double_negative_rule():
    note, _ = run([seg(1, "patient", "I have no chest pain.")])
    assert items(note, "history")[0]["polarity"] == "absent"


# 2. A relative contradicts the patient about the dose.
def test_relative_contradicting_the_patient_on_a_dose_is_a_high_conflict():
    note, _ = run(
        [
            seg(1, "patient", "I take amlodipine 5 milligrams once daily."),
            seg(2, "relative", "No, he takes amlodipine 10 milligrams once daily."),
        ]
    )
    meds = items(note, "meds_allergies")
    assert any("5 mg" in m["text"] for m in meds) and any("10 mg" in m["text"] for m in meds)
    assert any(
        "conflicting" in r["reason"].lower() and "amlodipine" in r["reason"].lower()
        for r in reviews(note, "HIGH")
    )


def test_same_dose_stated_twice_is_not_a_conflict():
    note, _ = run(
        [
            seg(1, "patient", "I take amlodipine 5 milligrams once daily."),
            seg(2, "relative", "Yes, amlodipine 5 milligrams once daily."),
        ]
    )
    assert not any("conflicting" in r["reason"].lower() for r in note["review_items"])


# 3. A dose in the wrong unit is flagged, not silently accepted or "corrected".
def test_dose_in_an_implausible_unit_is_high_and_kept_verbatim():
    note, _ = run([seg(1, "doctor", "Start bisoprolol 2.5 grams orally once daily.")])
    (med,) = items(note, "treatment")
    assert "2.5 g" in med["text"]  # copied as stated, never converted to mg
    assert any(
        "bisoprolol" in r["reason"].lower() and "unit" in r["reason"].lower()
        for r in reviews(note, "HIGH")
    )


def test_dose_above_a_plausible_maximum_is_high():
    note, _ = run([seg(1, "doctor", "Start amlodipine 100 milligrams orally once daily.")])
    assert any(
        "amlodipine" in r["reason"].lower()
        and ("unit" in r["reason"].lower() or "implausible" in r["reason"].lower())
        for r in reviews(note, "HIGH")
    )


def test_ordinary_doses_are_not_flagged_as_implausible():
    note, _ = run([seg(1, "doctor", "Start bisoprolol 2.5 milligrams orally once daily.")])
    assert not any(
        "implausible" in r["reason"].lower() or "unit" in r["reason"].lower()
        for r in note["review_items"]
    )


# 4. A future result presented as a finding.
def test_ecg_that_will_show_something_is_not_a_result():
    note, _ = run([seg(1, "doctor", "The ECG will probably show atrial fibrillation.")])
    assert items(note, "investigations") == []
    assert items(note, "assessment") == []
    assert "ECG" in texts(note, "plan")


# 5. Another person's illness is not the patient's.
def test_a_relatives_illness_is_family_history_not_the_patients_symptom():
    note, _ = run([seg(1, "patient", "My brother has chest pain, not me.")])
    hist = items(note, "history")
    assert not any(
        i["text"].lower().startswith("chest pain") and i["polarity"] == "present" for i in hist
    )
    assert any(
        i["text"].lower().startswith("family history") and "brother" in i["text"].lower()
        for i in hist
    )


def test_a_patients_own_symptom_is_still_recorded_next_to_a_family_mention():
    note, _ = run([seg(1, "patient", "I have a cough, and my mother had heart failure.")])
    hist = texts(note, "history")
    assert "Cough" in hist
    assert any("family history" in t.lower() and "mother" in t.lower() for t in hist)
