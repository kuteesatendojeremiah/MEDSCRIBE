"""§15.1: planned examination not shown as done; missing medication detail never invented;
relative's report never labelled as the patient's; body system never assigned from the specialty."""

from safety_helpers import FixedProvider, items, raw_item, reviews, run, seg, texts


# --- planned examination / test is not performed -------------------------------------------
def test_planned_examination_is_not_a_finding():
    for line in (
        "Let me listen to your chest.",
        "I will examine your abdomen.",
        "I need to check for ankle swelling.",
    ):
        note, _ = run([seg(1, "doctor", line)])
        assert items(note, "exam") == [], line


def test_planned_ecg_is_a_plan_not_a_result():
    note, _ = run([seg(1, "doctor", "We will do an ECG today.")])
    assert items(note, "investigations") == []
    assert "ECG" in texts(note, "plan")


def test_stated_finding_is_recorded_as_a_finding():
    note, _ = run([seg(1, "doctor", "There are fine crackles at both lung bases.")])
    assert texts(note, "exam") == ["Fine crackles at both lung bases"]


def test_provider_that_presents_a_planned_exam_as_done_is_stopped():
    segs = [seg(1, "doctor", "Let me listen to your chest.")]
    attack = FixedProvider({"items": [raw_item("exam", "Chest clear on auscultation", "s-001")]})
    note, report = run(segs, attack)
    assert items(note, "exam") == [] and report.dropped_planned_as_done == 1


# --- medication detail is never invented ----------------------------------------------------
def test_patient_medication_without_details_is_flagged_not_completed():
    note, _ = run([seg(1, "patient", "I take amlodipine.")])
    (med,) = items(note, "meds_allergies")
    assert "mg" not in med["text"] and "daily" not in med["text"]
    assert "dose and frequency not stated" in med["text"]
    high = reviews(note, "HIGH")
    assert any("Amlodipine" in r["reason"] and r["item_id"] == med["id"] for r in high)


def test_doctor_started_drug_missing_route_and_dose_is_flagged():
    note, _ = run([seg(1, "doctor", "We start warfarin.")])
    (med,) = items(note, "treatment")
    assert "dose, route and frequency not stated" in med["text"]
    assert any("Warfarin" in r["reason"] for r in reviews(note, "HIGH"))


def test_inaudible_dose_is_flagged_as_inaudible_never_guessed():
    note, _ = run([seg(1, "doctor", "We start bisoprolol [inaudible] milligrams once daily.")])
    (med,) = items(note, "treatment")
    assert not any(ch.isdigit() for ch in med["text"])
    assert any("dose inaudible" in r["reason"] for r in reviews(note, "HIGH"))


def test_complete_details_are_kept_exactly_as_stated_and_not_flagged():
    note, _ = run([seg(1, "doctor", "Start bisoprolol 2.5 milligrams orally once daily.")])
    (med,) = items(note, "treatment")
    assert med["text"] == "Bisoprolol 2.5 mg orally once daily"
    assert reviews(note, "HIGH")[0]["reason"] == "Allergy status unknown"  # no medication flag


def test_provider_that_invents_a_dose_is_stopped():
    segs = [seg(1, "patient", "The one for pressure, amlodipine, I think.")]
    attack = FixedProvider(
        {
            "items": [
                raw_item(
                    "meds_allergies",
                    "Amlodipine 5 mg once daily",
                    "s-001",
                    role="patient",
                )
            ]
        }
    )
    note, report = run(segs, attack)
    assert items(note, "meds_allergies") == [] and report.dropped_unsupported_med == 1


def test_provider_that_invents_a_route_is_stopped():
    segs = [seg(1, "doctor", "We start warfarin.")]
    attack = FixedProvider({"items": [raw_item("treatment", "Warfarin orally", "s-001")]})
    note, report = run(segs, attack)
    assert items(note, "treatment") == [] and report.dropped_unsupported_med == 1


# --- relative's report -------------------------------------------------------------------------
def test_relative_report_is_labelled_as_relatives():
    note, _ = run([seg(1, "relative", "He has had chest pain for two days.")])
    (it,) = items(note, "history")
    assert it["source"]["speaker_role"] == "relative"
    assert "reported by wife, not by patient" in it["text"]


def test_patient_report_is_not_labelled_as_relatives():
    note, _ = run([seg(1, "patient", "I have had chest pain for two days.")])
    (it,) = items(note, "history")
    assert it["source"]["speaker_role"] == "patient" and "reported by" not in it["text"]


def test_provider_that_drops_the_relative_label_is_corrected():
    segs = [seg(1, "relative", "He wakes at night unable to breathe well.")]
    attack = FixedProvider(
        {
            "items": [
                raw_item(
                    "history",
                    "Wakes at night unable to breathe",
                    "s-001",
                    role="patient",
                )
            ]
        }
    )
    note, _ = run(segs, attack)
    (it,) = items(note, "history")
    assert it["source"]["speaker_role"] == "relative"  # the transcript is the authority
    assert "reported by wife" in it["text"]


# --- body system ----------------------------------------------------------------------------------
def test_body_system_is_not_assigned_just_because_the_clinic_is_cardiology():
    note, _ = run(
        [
            seg(1, "patient", "I have a cough for four days."),
            seg(2, "doctor", "The abdomen is tender."),
        ]
    )
    assert all(i["body_system"] != "cvs" for i in note["items"])
    assert [i["body_system"] for i in items(note, "history")] == [None]


def test_unjustified_body_system_from_a_provider_is_cleared():
    segs = [seg(1, "doctor", "The abdomen is tender.")]
    attack = FixedProvider(
        {"items": [raw_item("exam", "Abdomen tender", "s-001", body_system="cvs")]}
    )
    note, report = run(segs, attack)
    assert items(note, "exam")[0]["body_system"] is None and report.body_system_cleared == 1


def test_justified_body_system_is_kept():
    note, _ = run([seg(1, "doctor", "There is a systolic murmur.")])
    assert items(note, "exam")[0]["body_system"] == "cvs"


def test_twice_daily_is_never_read_as_once_daily():
    """Regression found by the Phase 6 cases: a frequency must be copied, never converted."""
    note, _ = run([seg(1, "doctor", "Start bisoprolol 5 milligrams orally twice daily.")])
    (med,) = items(note, "treatment")
    assert med["text"] == "Bisoprolol 5 mg orally twice daily"
    note, _ = run([seg(1, "patient", "I take aspirin daily.")])
    assert (
        "daily" in texts(note, "meds_allergies")[0]
        and "once" not in texts(note, "meds_allergies")[0]
    )
