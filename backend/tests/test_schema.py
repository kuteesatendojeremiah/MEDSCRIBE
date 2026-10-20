"""§4, §7.2, App. A: schema validates the Kato example; sources are mandatory (§4.2)."""

import copy
import json
from pathlib import Path

import jsonschema
import pytest
from pydantic import ValidationError

from app.schema import models

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "backend/app/schema/note_schema.json").read_text(encoding="utf8"))
KATO = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text(encoding="utf8"))


def test_schema_is_valid_json_schema():
    jsonschema.Draft202012Validator.check_schema(SCHEMA)


def test_kato_validates_json_schema():
    jsonschema.validate(KATO, SCHEMA)


def test_kato_validates_pydantic():
    models.Note.model_validate(KATO)


def test_item_without_source_rejected_by_both():
    bad = copy.deepcopy(KATO)
    del bad["items"][0]["source"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, SCHEMA)
    with pytest.raises(ValidationError):
        models.Note.model_validate(bad)


def test_bad_enum_rejected_by_both():
    bad = copy.deepcopy(KATO)
    bad["items"][0]["section"] = "cardiology"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, SCHEMA)
    with pytest.raises(ValidationError):
        models.Note.model_validate(bad)


def test_segment_source_requires_segment_id_and_role():
    bad = copy.deepcopy(KATO)
    seg = next(i for i in bad["items"] if i["source"]["type"] == "segment")
    del seg["source"]["segment_id"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, SCHEMA)


def _enum(path):
    node = SCHEMA["$defs"]
    for p in path:
        node = node[p]
    return set(node["enum"])


@pytest.mark.parametrize(
    "def_name,enum_cls",
    [
        ("section", models.Section),
        ("body_system", models.BodySystem),
        ("polarity", models.Polarity),
        ("certainty", models.Certainty),
        ("source_type", models.SourceType),
        ("speaker_role", models.SpeakerRole),
        ("review_level", models.ReviewLevel),
        ("review_status", models.ReviewStatus),
    ],
)
def test_enum_parity(def_name, enum_cls):
    assert _enum([def_name]) == {e.value for e in enum_cls}


def test_speaker_roles_are_exactly_section_7_2():
    assert {e.value for e in models.SpeakerRole} == {
        "doctor",
        "patient",
        "relative",
        "other_clinician",
        "interpreter",
        "unknown",
    }


def test_review_levels_exactly_section_4_4():
    assert {e.value for e in models.ReviewLevel} == {"HIGH", "CHECK", "INFO"}


def test_patient_label_is_optional_free_text_adr_0001():
    assert KATO["header"]["patient_label"].startswith("Ronald Kato (FICTIONAL)")
    no_label = copy.deepcopy(KATO)
    del no_label["header"]["patient_label"]
    jsonschema.validate(no_label, SCHEMA)
    models.Note.model_validate(no_label)
    bad = copy.deepcopy(KATO)
    bad["header"]["patient_label"] = 5
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, SCHEMA)
