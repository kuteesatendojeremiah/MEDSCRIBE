"""Stage D/H (Blueprint §4.1, FR-19; ADR-0010): specialty templates are a layer over the fixed note
schema. They choose headings and order, never content, and can never drop a recorded item."""

import copy

import pytest

from app.render.hash import note_hash
from app.render.model import build_document
from app.templates import TEMPLATES, get_template
from tests.test_render import FINAL, final

SCHEMA_SECTIONS = {
    "history",
    "meds_allergies",
    "vitals",
    "exam",
    "investigations",
    "assessment",
    "treatment",
    "plan",
}


def doc(note=FINAL, template="cardiology"):
    return build_document(note, approver="Dr. A. Nankya", template=get_template(template))


def test_cardiology_is_the_default_and_keeps_the_reference_headings():
    d = doc()
    assert d.title == "CARDIOLOGY OUTPATIENT CONSULTATION NOTE"
    assert [s.title for s in d.sections] == [
        "HISTORY",
        "MEDICATIONS AND ALLERGIES",
        "VITAL SIGNS",
        "EXAMINATION FINDINGS",
        "INVESTIGATIONS AND RESULTS",
        "ASSESSMENT",
        "TREATMENT",
        "PLAN",
    ]


def test_templates_are_marked_as_awaiting_clinician_validation():
    assert all(t.review_status == "pending_clinician_review" for t in TEMPLATES.values())


def test_unknown_template_is_rejected():
    with pytest.raises(KeyError):
        get_template("dermatology")


def test_a_template_that_omits_sections_never_drops_recorded_items():
    note = copy.deepcopy(FINAL)
    # Force content into sections the general template leaves out only when empty: it must still show.
    d = doc(note, "general")
    shown = " ".join(line.text for s in d.sections for line in s.lines)
    for item in note["items"]:
        if item["section"] == "vitals":  # the general template has no vitals heading
            assert item["text"][:20] in shown, item["id"]
    assert "OTHER RECORDED FINDINGS" in [s.title for s in d.sections]


def test_omitted_empty_sections_are_not_filled_with_invented_text():
    note = copy.deepcopy(FINAL)
    note["items"] = [i for i in note["items"] if i["section"] != "investigations"]
    names = [s.title for s in doc(note, "general").sections]
    assert "INVESTIGATIONS AND RESULTS" not in names
    inv = next(
        s for s in doc(note, "cardiology").sections if s.title == "INVESTIGATIONS AND RESULTS"
    )
    assert [line.text for line in inv.lines] == ["not recorded"]  # §4.4: INFO, nothing invented


def test_template_changes_headings_only_not_the_hash():
    assert doc(template="general").title != doc().title
    assert doc(template="general").short_hash == doc().short_hash


def test_every_template_lists_only_real_schema_sections_and_has_a_fallback():
    for t in TEMPLATES.values():
        assert {s.key for s in t.sections} <= SCHEMA_SECTIONS
        assert t.fallback_heading


@pytest.mark.parametrize("fmt", ["docx", "pdf"])
def test_render_route_accepts_a_known_template_and_rejects_an_unknown_one(client, auth, fmt):
    ok = client.post(
        f"/render?mode=final&format={fmt}&template=general",
        json={"note": FINAL, "approved_hash": note_hash(FINAL)},
        headers=auth,
    )
    assert ok.status_code == 200
    bad = client.post("/render?mode=preview&template=nope", json={"note": FINAL}, headers=auth)
    assert bad.status_code == 422 and bad.json()["error"] == "E_BAD_REQUEST"
    assert final(client, auth, fmt=fmt).status_code == 200  # no template given -> cardiology
