"""Found while building a second worked example: two medicines in one sentence must each keep
their OWN dose, route and frequency (never borrowed from the other), and wording must not say "pain"
when the patient said breathless."""

from safety_helpers import items, reviews, run, seg, texts


def test_two_drugs_in_one_sentence_keep_their_own_doses():
    note, _ = run(
        [
            seg(
                1,
                "patient",
                "I take amlodipine 5 milligrams once daily and metformin 500 milligrams twice daily.",
            )
        ]
    )
    meds = texts(note, "meds_allergies")
    assert "Amlodipine 5 mg once daily" in meds
    assert "Metformin 500 mg twice daily" in meds
    assert not any("Metformin 5 mg" in m or "Amlodipine 500" in m for m in meds)


def test_a_drug_without_its_own_detail_does_not_borrow_the_neighbours():
    note, _ = run([seg(1, "patient", "I take amlodipine 5 milligrams once daily and aspirin.")])
    meds = texts(note, "meds_allergies")
    assert "Amlodipine 5 mg once daily" in meds
    aspirin = next(m for m in meds if m.startswith("Aspirin"))
    assert "mg" not in aspirin and "daily" not in aspirin
    assert any("Aspirin" in r["reason"] for r in reviews(note, "HIGH"))


def test_three_drugs_each_get_their_own_frequency():
    note, _ = run(
        [
            seg(
                1,
                "patient",
                "I take ramipril 5 milligrams once daily, furosemide 40 milligrams twice daily and aspirin 75 milligrams at night.",
            )
        ]
    )
    meds = texts(note, "meds_allergies")
    assert "Ramipril 5 mg once daily" in meds
    assert "Furosemide 40 mg twice daily" in meds
    assert "Aspirin 75 mg at night" in meds


def test_breathlessness_on_stairs_is_not_reported_as_pain():
    note, _ = run([seg(1, "patient", "I have been breathless when I climb stairs for two weeks.")])
    hist = texts(note, "history")
    assert "Shortness of breath for 2 weeks" in hist
    assert not any("pain" in t.lower() for t in hist)
    assert any(
        "worse on exertion" in t.lower() and "shortness of breath" in t.lower() for t in hist
    )


def test_waking_at_night_short_of_breath_answered_no_is_recorded_precisely():
    note, _ = run(
        [seg(1, "doctor", "Do you wake up at night short of breath?"), seg(2, "patient", "No.")]
    )
    (it,) = items(note, "history")
    assert it["polarity"] == "absent" and "night" in it["text"].lower()
    assert it["source"]["segment_id"] == "s-002"
