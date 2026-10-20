"""Helpers for the adversarial synthetic safety set (Blueprint §15.1). Synthetic text only."""

import json
from pathlib import Path

from app.extract.mapping import build_note
from app.extract.rules import MockExtractor
from app.providers.base import Segment

ROOT = Path(__file__).resolve().parents[2]
HEADER = {
    "clinic": "Cardiology clinic (demonstration)",
    "datetime": "2026-10-19T10:12:00+03:00",
    "clinician": "Dr. A. Nankya (fictional), cardiology",
    "temp_ref": "OPD-07",
    "languages": ["English"],
    "present": ["Patient", "Wife (relative)", "Nurse"],
    "consent_statement": "Consent confirmed (synthetic).",
}


def seg(n, role, text, english=None, conf=0.95, start=None):
    start = start if start is not None else n * 8
    return Segment(
        id=f"s-{n:03d}",
        start=start,
        end=start + 6,
        lang="en",
        original_text=text,
        english_text=english,
        speaker_role=role,
        confidence=conf,
    )


def run(segments, provider=None, header=None):
    """Extract through the full pipeline: provider -> mapping/safety layer -> review items."""
    provider = provider or MockExtractor()
    header = header or HEADER
    raw = provider.extract(segments, header["present"])
    return build_note(raw, segments, header)


def items(note, section=None):
    return [i for i in note["items"] if section is None or i["section"] == section]


def texts(note, section=None):
    return [i["text"] for i in items(note, section)]


def reviews(note, level=None):
    return [r for r in note["review_items"] if level is None or r["level"] == level]


def load_json(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf8"))


class FixedProvider:
    """A test double that returns whatever raw output it is given, to attack the safety layer."""

    name = "fixed"

    def __init__(self, raw):
        self._raw = raw

    def extract(self, segments, present):
        return self._raw


def raw_item(
    section,
    text,
    segment_id=None,
    role="doctor",
    polarity="present",
    certainty="confirmed",
    body_system=None,
    source_type="segment",
):
    source = {"type": source_type}
    if segment_id:
        source["segment_id"] = segment_id
        source["speaker_role"] = role
    return {
        "section": section,
        "text": text,
        "polarity": polarity,
        "certainty": certainty,
        "body_system": body_system,
        "time": None,
        "source": source,
    }
