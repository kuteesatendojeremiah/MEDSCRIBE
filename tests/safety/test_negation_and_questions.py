"""§15.1: negation preserved; a question is not a diagnosis; a doctor question is not a patient fact."""

from safety_helpers import FixedProvider, items, raw_item, reviews, run, seg, texts


def test_negation_preserved_direct_statement():
    note, _ = run([seg(1, "patient", "I do not have shortness of breath.")])
    hist = items(note, "history")
    assert len(hist) == 1
    assert hist[0]["polarity"] == "absent"
    assert hist[0]["text"].startswith("No shortness of breath")


def test_negation_preserved_no_chest_pain():
    note, _ = run([seg(1, "patient", "I have no chest pain, but I have a cough.")])
    by_text = {i["text"]: i["polarity"] for i in items(note, "history")}
    assert by_text["No chest pain (patient denied)"] == "absent"
    assert by_text["Cough"] == "present"


def test_negation_in_a_question_and_answer_pair():
    note, _ = run(
        [
            seg(1, "doctor", "Do you have palpitations?"),
            seg(2, "patient", "No."),
        ]
    )
    (it,) = items(note, "history")
    assert it["polarity"] == "absent" and it["source"]["segment_id"] == "s-002"


def test_yes_answer_is_recorded_present_only_with_an_answer():
    note, _ = run([seg(1, "doctor", "Do you feel dizzy?"), seg(2, "patient", "Yes, sometimes.")])
    (it,) = items(note, "history")
    assert it["polarity"] == "present" and it["text"] == "Dizziness"


def test_time_is_kept():
    note, _ = run([seg(1, "patient", "I have had chest pain for three days.")])
    (it,) = items(note, "history")
    assert it["time"] == "3 days" and "3 days" in it["text"]


def test_question_is_not_converted_into_a_diagnosis_doctor():
    note, _ = run([seg(1, "doctor", "Could this be heart failure?")])
    assert items(note, "assessment") == []
    assert any(
        "phrased as a question" in r["reason"] and r["level"] == "CHECK"
        for r in note["review_items"]
    )


def test_question_is_not_converted_into_a_diagnosis_patient():
    note, _ = run([seg(1, "patient", "Is it angina?")])
    assert items(note, "assessment") == []
    assert any("phrased as a question" in r["reason"] for r in reviews(note, "CHECK"))


def test_a_provider_that_turns_a_question_into_a_diagnosis_is_stopped_by_the_safety_layer():
    segs = [seg(1, "doctor", "Could this be heart failure?")]
    attack = FixedProvider(
        {"items": [raw_item("assessment", "Heart failure", "s-001", certainty="confirmed")]}
    )
    note, report = run(segs, attack)
    assert items(note, "assessment") == []
    assert report.dropped_from_question == 1


def test_doctor_question_alone_creates_no_patient_fact():
    note, _ = run([seg(1, "doctor", "Do you have chest pain?")])
    assert items(note) == []


def test_answer_is_attributed_to_the_answering_speaker_not_the_doctor():
    note, _ = run([seg(1, "doctor", "Do you have a cough?"), seg(2, "patient", "Yes.")])
    (it,) = items(note, "history")
    assert it["source"]["speaker_role"] == "patient"
    assert it["source"]["segment_id"] == "s-002"


def test_unclear_answer_creates_no_fact():
    note, _ = run([seg(1, "doctor", "Do you have a cough?"), seg(2, "patient", "Hmm, maybe.")])
    assert texts(note, "history") == []


def test_doctor_question_provider_attack_is_stopped():
    segs = [seg(1, "doctor", "Do you have chest pain?")]
    attack = FixedProvider({"items": [raw_item("history", "Chest pain", "s-001")]})
    note, report = run(segs, attack)
    assert items(note) == [] and report.dropped_from_question == 1
