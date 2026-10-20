"""Patient introduction details (ADR-0007): typed by the clinician, printed on the note, never logged."""

import copy
import io
import json
import logging
from pathlib import Path

import jsonschema
import pytest
from docx import Document
from pydantic import ValidationError

from app.logging_filter import BANNED_FIELDS, ClinicalContentFilter
from app.render.hash import note_hash
from app.render.model import patient_rows
from app.schema import models
from app.schema.loader import NOTE_SCHEMA

ROOT = Path(__file__).resolve().parents[2]
FINAL = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))

PATIENT = {
    "name": "Grace Auma (FICTIONAL)",
    "age": "62",
    "sex": "Female",
    "file_number": "OPD-2231",
    "residence": "Gulu, Northern Uganda",
}


def with_patient(p):
    n = copy.deepcopy(FINAL)
    n["header"].pop("patient_label", None)
    n["header"]["patient"] = p
    return n


def test_structured_patient_validates_in_schema_and_model():
    n = with_patient(PATIENT)
    jsonschema.validate(n, NOTE_SCHEMA)
    models.Note.model_validate(n)


def test_every_patient_field_is_optional_and_unknown_fields_are_refused():
    n = with_patient({"name": "Only Name"})
    jsonschema.validate(n, NOTE_SCHEMA)
    bad = with_patient({"name": "x", "national_id": "123"})
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, NOTE_SCHEMA)
    with pytest.raises(ValidationError):
        models.Note.model_validate(bad)


def test_overlong_values_are_refused():
    bad = with_patient({"age": "9" * 30})
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, NOTE_SCHEMA)


def test_rows_show_only_what_was_typed():
    assert patient_rows({"patient": PATIENT}) == [
        ("Patient", "Grace Auma (FICTIONAL)"),
        ("Age / sex", "62 · Female"),
        ("File no.", "OPD-2231"),
        ("Residence", "Gulu, Northern Uganda"),
    ]
    assert patient_rows({"patient": {"age": "6 months"}}) == [("Age / sex", "6 months")]
    assert patient_rows({}) == [("Patient", "not recorded")]  # never invented


def test_older_notes_with_only_a_label_still_print_it():
    assert patient_rows({"patient_label": "Ronald Kato (FICTIONAL) · 58 years · Male"}) == [
        ("Patient", "Ronald Kato (FICTIONAL) · 58 years · Male")
    ]


def test_patient_details_appear_in_the_docx_header_and_change_the_hash(client, auth):
    n = with_patient(PATIENT)
    assert note_hash(n) != note_hash(FINAL)
    r = client.post(
        "/render?mode=final&format=docx",
        json={"note": n, "approved_hash": note_hash(n)},
        headers=auth,
    )
    d = Document(io.BytesIO(r.content))
    cells = [c.text for t in d.tables for row in t.rows for c in row.cells]
    for needle in (
        "Patient",
        "Grace Auma (FICTIONAL)",
        "Age / sex",
        "62 · Female",
        "File no.",
        "OPD-2231",
        "Residence",
    ):
        assert needle in cells, needle


def test_patient_details_appear_in_the_pdf_and_preview(client, auth):
    n = with_patient(PATIENT)
    pdf = client.post(
        "/render?mode=final&format=pdf",
        json={"note": n, "approved_hash": note_hash(n)},
        headers=auth,
    ).content.decode("latin-1")
    for needle in (
        "Grace Auma",
        "FICTIONAL",
        "Female",
        "OPD-2231",
        "Gulu",
    ):  # parentheses are escaped in PDF text
        assert needle in pdf, needle
    doc = client.post("/render?mode=preview", json={"note": n}, headers=auth).json()["document"]
    rows = {r["label"]: r["value"] for r in doc["header_rows"]}
    assert rows["Patient"] == "Grace Auma (FICTIONAL)" and rows["File no."] == "OPD-2231"


def test_extract_passes_the_patient_details_through(client, auth):
    segs = json.loads((ROOT / "fixtures/synthetic/kato_transcript.json").read_text("utf8"))[
        "segments"
    ]
    header = {**FINAL["header"], "patient": PATIENT}
    header.pop("patient_label")
    note = client.post("/extract", json={"segments": segs, "header": header}, headers=auth).json()[
        "note"
    ]
    assert note["header"]["patient"] == PATIENT


def test_patient_details_are_never_logged():
    assert {"patient", "patient_name", "patient_label"} <= BANNED_FIELDS
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, "m", None, None)
    rec.patient = "Grace"
    assert ClinicalContentFilter().filter(rec) is False
