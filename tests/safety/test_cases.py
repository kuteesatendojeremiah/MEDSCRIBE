"""Phase 6: the synthetic consultation set (fixtures/synthetic/cases). Every case states what the
note must contain and must NOT contain; extraction runs the same pipeline as /extract (§7.3, §15.1)."""

import json
from pathlib import Path

import pytest

from app.extract.mapping import build_note
from app.extract.rules import MockExtractor
from app.providers.base import Segment
from safety_helpers import HEADER

CASES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic" / "cases"
CASES = sorted(CASES_DIR.glob("case_*.json"))


def load(path):
    data = json.loads(path.read_text(encoding="utf8"))
    segs = [Segment.model_validate(s) for s in data["segments"]]
    header = {**HEADER, "present": data["present"]}
    note, report = build_note(MockExtractor().extract(segs, data["present"]), segs, header)
    return data, note, report


def matches(it, want):
    return (
        it["section"] == want["section"]
        and want["contains"].lower() in it["text"].lower()
        and ("polarity" not in want or it["polarity"] == want["polarity"])
        and ("certainty" not in want or it["certainty"] == want["certainty"])
        and ("role" not in want or it["source"].get("speaker_role") == want["role"])
        and ("time" not in want or it["time"] == want["time"])
    )


def test_there_are_at_least_ten_new_cases():
    assert len(CASES) >= 10


def test_cases_cover_every_phase_6_theme():
    themes = " ".join(" ".join(json.loads(p.read_text("utf8"))["covers"]) for p in CASES)
    for t in (
        "negation",
        "questions vs facts",
        "relative speaking",
        "interpreter",
        "unclear doses",
        "planned vs completed exam",
        "code-switching",
        "interruptions",
        "conflicting statements",
        "missing allergy status",
    ):
        assert t in themes, t


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_case_expectations(path):
    data, note, report = load(path)
    exp = data["expect"]
    for want in exp.get("items", []):
        assert any(
            matches(i, want) for i in note["items"]
        ), f"missing item {want}\n{[i['text'] for i in note['items']]}"
    for bad in exp.get("no_items", []):
        assert not any(matches(i, bad) for i in note["items"]), f"unexpected item {bad}"
    reasons = [(r["level"], r["reason"].lower()) for r in note["review_items"]]
    for want in exp.get("reviews", []):
        assert any(
            lvl == want["level"] and want["contains"].lower() in r for lvl, r in reasons
        ), f"missing review {want}\n{reasons}"
    for bad in exp.get("no_reviews", []):
        assert not any(
            lvl == bad["level"] and bad["contains"].lower() in r for lvl, r in reasons
        ), f"unexpected review {bad}"


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_every_item_has_a_source_and_nothing_was_silently_dropped(path):
    _, note, report = load(path)
    assert all(i["source"]["type"] for i in note["items"])
    assert report.dropped_no_source == 0 and report.dropped_unsupported_med == 0


@pytest.mark.parametrize("path", CASES, ids=lambda p: p.stem)
def test_no_medication_detail_is_invented(path):
    data, note, _ = load(path)
    from app.extract.numwords import words_to_digits

    spoken = (
        words_to_digits(
            " ".join(
                (s.get("english_text") or s["original_text"]).lower() for s in data["segments"]
            )
        )
        .replace("milligrams", "mg")
        .replace("milligram", "mg")
    )
    for it in note["items"]:
        if it["section"] in ("meds_allergies", "treatment"):
            import re

            for number in re.findall(r"\d+(?:\.\d+)?\s*mg", it["text"].lower()):
                assert number in spoken or number.replace(" ", "") in spoken.replace(" ", ""), it[
                    "text"
                ]
