"""§15.1: every item has a source tag; HIGH/CHECK/INFO review items (§4.4); Kato end to end (§18)."""

import pytest

from safety_helpers import (
    FixedProvider,
    HEADER,
    items,
    load_json,
    raw_item,
    reviews,
    run,
    seg,
)
from app.extract.mapping import ExtractInvalid
from app.providers.base import Segment
from app.extract.rules import MockExtractor
from app.extract.mapping import build_note


# --- every item has a source ------------------------------------------------------------------
def test_item_without_a_source_is_dropped_and_counted():
    segs = [seg(1, "patient", "I have a cough.")]
    bad = raw_item("history", "Cough", None)
    bad["source"] = None
    note, report = run(
        segs,
        FixedProvider({"items": [bad, raw_item("history", "Cough", "s-001", role="patient")]}),
    )
    assert len(items(note)) == 1 and report.dropped_no_source == 1
    assert all(i.get("source") for i in note["items"])


def test_item_pointing_at_a_missing_segment_is_dropped():
    segs = [seg(1, "patient", "I have a cough.")]
    note, report = run(segs, FixedProvider({"items": [raw_item("history", "Cough", "s-999")]}))
    assert items(note) == [] and report.dropped_no_source == 1


def test_unknown_source_type_is_dropped():
    segs = [seg(1, "patient", "I have a cough.")]
    odd = raw_item("history", "Cough", "s-001")
    odd["source"]["type"] = "model_guess"
    note, report = run(segs, FixedProvider({"items": [odd]}))
    assert items(note) == [] and report.dropped_no_source == 1


def test_malformed_provider_output_is_rejected_whole_not_shown_partially():
    segs = [seg(1, "patient", "I have a cough.")]
    good = raw_item("history", "Cough", "s-001", role="patient")
    broken = {"section": "cardiology", "text": "x"}
    with pytest.raises(ExtractInvalid):
        run(segs, FixedProvider({"items": [good, broken]}))
    with pytest.raises(ExtractInvalid):
        run(segs, FixedProvider({"nope": True}))


def test_every_item_of_every_extraction_in_this_suite_carries_a_source():
    kato = load_json("fixtures/synthetic/kato_transcript.json")["segments"]
    segs = [Segment.model_validate(s) for s in kato]
    note, _ = build_note(MockExtractor().extract(segs, HEADER["present"]), segs, HEADER)
    assert note["items"] and all(i["source"]["type"] for i in note["items"])


# --- review items §4.4 ------------------------------------------------------------------------------
def test_allergy_status_unknown_is_high():
    note, _ = run([seg(1, "patient", "I have a cough.")])
    assert any(r["reason"] == "Allergy status unknown" for r in reviews(note, "HIGH"))


def test_allergy_status_recorded_is_not_flagged():
    note, _ = run([seg(1, "doctor", "Any allergies?"), seg(2, "patient", "None.")])
    assert not any("Allergy status" in r["reason"] for r in note["review_items"])


def test_unknown_speaker_clinical_statement_is_high():
    note, _ = run([seg(1, "unknown", "I have chest pain for two days.", conf=0.5)])
    assert any("unknown speaker" in r["reason"] for r in reviews(note, "HIGH"))


def test_conflicting_facts_are_high():
    note, _ = run(
        [
            seg(1, "patient", "I have no chest pain."),
            seg(2, "relative", "He has chest pain for two days."),
        ]
    )
    assert any("Conflicting statements" in r["reason"] for r in reviews(note, "HIGH"))


def test_possible_diagnosis_is_check_and_stays_possible():
    note, _ = run([seg(1, "doctor", "Heart failure is possible.")])
    (a,) = items(note, "assessment")
    assert a["certainty"] == "possible"
    assert any(r["level"] == "CHECK" and r["item_id"] == a["id"] for r in note["review_items"])


def test_inaudible_segment_is_check():
    note, _ = run([seg(1, "doctor", "[inaudible]")])
    assert any("Inaudible" in r["reason"] for r in reviews(note, "CHECK"))


def test_low_confidence_translation_is_check():
    note, _ = run([seg(1, "patient", "Nfuna obulumi.", english="I have pain.", conf=0.6)])
    assert any("Uncertain translation" in r["reason"] for r in reviews(note, "CHECK"))


def test_interpreter_relayed_statement_is_check():
    note, _ = run([seg(1, "interpreter", "He says he has had a cough for five days.")])
    assert any("relayed by interpreter" in r["reason"] for r in reviews(note, "CHECK"))


def test_missing_vitals_and_empty_sections_are_info():
    note, _ = run([seg(1, "other_clinician", "His weight is 70 kilograms.")])
    info = " | ".join(r["reason"] for r in reviews(note, "INFO"))
    assert "Respiratory rate" in info and "not recorded" in info and "section empty" in info


def test_review_ids_are_ordered_high_check_info():
    note, _ = run(
        [
            seg(1, "patient", "I take amlodipine."),
            seg(2, "doctor", "Heart failure is possible."),
        ]
    )
    levels = [r["level"] for r in note["review_items"]]
    assert levels == sorted(levels, key={"HIGH": 0, "CHECK": 1, "INFO": 2}.get)


# --- Kato end to end -----------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def kato():
    segs = [
        Segment.model_validate(s)
        for s in load_json("fixtures/synthetic/kato_transcript.json")["segments"]
    ]
    expected_final = load_json("fixtures/synthetic/kato_expected_note.json")
    note, report = build_note(
        MockExtractor().extract(segs, HEADER["present"]), segs, expected_final["header"]
    )
    return note, expected_final, report


def test_kato_extraction_matches_the_frozen_expected_extraction(kato):
    note, _, _ = kato
    frozen = load_json("fixtures/synthetic/kato_extraction_expected.json")
    assert note == frozen


def test_kato_extraction_agrees_with_the_final_note_item_by_item(kato):
    """Every segment-sourced item in the extraction exists in the final §18 note (same section,
    polarity, certainty, segment and role). The final note adds only clinician-entered items.
    """
    note, final, _ = kato
    key = lambda i: (  # noqa: E731
        i["section"],
        i["polarity"],
        i["certainty"],
        i["source"].get("segment_id"),
        i["source"].get("speaker_role"),
    )
    final_keys = {key(i) for i in final["items"] if i["source"]["type"] == "segment"}
    for it in note["items"]:
        if it["section"] == "treatment":
            continue  # bisoprolol is entered by the clinician at review in the final note
        assert key(it) in final_keys, it["text"]


def test_kato_wife_report_is_marked_as_relative(kato):
    note, _, _ = kato
    (it,) = [i for i in note["items"] if "wakes at night" in i["text"].lower()]
    assert it["source"]["speaker_role"] == "relative" and "reported by wife" in it["text"]


def test_kato_review_items_are_the_five_from_section_18(kato):
    note, _, _ = kato
    got = [(r["level"], r["reason"]) for r in note["review_items"]]
    assert [lvl for lvl, _ in got] == ["HIGH", "HIGH", "CHECK", "CHECK", "INFO"]
    reasons = " | ".join(r for _, r in got)
    assert "Amlodipine dose and frequency not stated" in reasons
    assert "Bisoprolol dose inaudible" in reasons
    assert "'Heart failure is possible'" in reasons
    assert "Unknown speaker, inaudible at 01:49" in reasons
    assert "Respiratory rate, SpO2 and temperature not recorded" in reasons


def test_kato_nothing_was_dropped_by_the_safety_layer(kato):
    _, _, report = kato
    assert (
        report.dropped_no_source,
        report.dropped_from_question,
        report.dropped_planned_as_done,
        report.dropped_unsupported_med,
        report.body_system_cleared,
    ) == (0, 0, 0, 0, 0)


def test_kato_never_invents_a_dose_for_amlodipine_or_bisoprolol(kato):
    note, _, _ = kato
    for it in note["items"]:
        if it["section"] in ("meds_allergies", "treatment") and "mg" in it["text"]:
            pytest.fail(f"invented dose: {it['text']}")
