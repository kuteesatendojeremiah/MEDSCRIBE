"""Mapping and safety layer (Blueprint §4.1, §4.2, §7.3, §12.2).

Whatever a provider returns (the mock now, a model later) is validated and post-processed here
before anything reaches the clinician. Rules that must hold regardless of provider:

- every item has a source that points at a real transcript segment, else it is dropped (§4.2);
- body systems are only kept when the item text itself justifies them, never from the specialty;
- items cannot come from a question segment, nor present a planned examination or test as done;
- medication dose/route/frequency must appear in the cited segment, else the item is removed;
- a relative's report is always labelled as the relative's (§7.2);
- output must validate against the schema or the whole response is rejected (recoverable).
"""

import re
from dataclasses import dataclass, field
from typing import Optional

import jsonschema
from pydantic import BaseModel, ConfigDict, ValidationError

from app.extract import lexicon as lx
from app.extract.numwords import normalize_segment
from app.extract.review_engine import SECTIONS, build_review_items
from app.providers.base import Segment
from app.schema import models
from app.schema.loader import NOTE_SCHEMA


class ExtractInvalid(Exception):
    """Provider output failed validation (recoverable, never shown partially, §12.2)."""

    code = "E_EXTRACT_INVALID"


class RawSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    segment_id: Optional[str] = None
    speaker_role: Optional[str] = None


class RawItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    section: models.Section
    text: str
    polarity: models.Polarity
    certainty: models.Certainty
    body_system: Optional[models.BodySystem] = None
    time: Optional[str] = None
    source: Optional[RawSource] = None


class RawExtract(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[RawItem]


@dataclass
class MappingReport:
    """Content-free counters only (CLAUDE.md rule 4)."""

    dropped_no_source: int = 0
    dropped_from_question: int = 0
    dropped_planned_as_done: int = 0
    dropped_unsupported_med: int = 0
    body_system_cleared: int = 0
    counts: dict = field(default_factory=dict)


def relative_label(present: list[str]) -> str:
    for p in present:
        m = re.search(r"wife|husband|mother|father|son|daughter|sister|brother|friend", p, re.I)
        if m:
            return m.group(0).lower()
    return "relative"


def _canon_med_tokens(text: str) -> dict:
    low = text.lower()
    dose = lx.DOSE.search(low)
    return {
        "dose": dose.group(1) if dose else None,
        "route": next((r for r, p in lx.ROUTES if p.search(low)), None),
        "frequency": next((f for f, p in lx.FREQUENCIES if p.search(low)), None),
    }


def med_details_supported(item_text: str, seg_text: str) -> bool:
    """Every dose/route/frequency stated in the item must be stated, in the cited segment, for THAT
    medicine (its own stretch of the sentence), not borrowed from a neighbouring medicine."""
    claimed = _canon_med_tokens(item_text)
    drug = lx.MED_NAME.search(item_text.lower())
    windows = dict(lx.drug_windows(seg_text.lower()))
    scope = windows.get(drug.group(1)) if drug else None
    source = _canon_med_tokens(scope if scope is not None else seg_text)
    return all(v is None or v == source[k] for k, v in claimed.items())


def build_note(
    raw: dict,
    segments: list[Segment],
    header: dict,
    present: Optional[list[str]] = None,
) -> tuple[dict, MappingReport]:
    report = MappingReport()
    try:
        parsed = RawExtract.model_validate(raw)
    except ValidationError as exc:
        raise ExtractInvalid() from exc

    segments = [normalize_segment(s) for s in segments]  # the same view the extractor used
    seg_by_id = {s.id: s for s in segments}
    rel = relative_label(present or header.get("present", []))
    kept: list[dict] = []
    for it in parsed.items:
        d = it.model_dump(mode="json")
        src = d["source"]
        # §4.2: items with no source are not shown.
        if src is None:
            report.dropped_no_source += 1
            continue
        if src["type"] == "segment":
            seg = seg_by_id.get(src.get("segment_id") or "")
            if seg is None:
                report.dropped_no_source += 1
                continue
            src["speaker_role"] = seg.speaker_role.value  # the transcript is the authority
            seg_text = (seg.english_text or seg.original_text).strip()
            low = seg_text.lower()
            if seg_text.endswith("?"):  # a question is not a fact; an answer is needed
                report.dropped_from_question += 1
                continue
            if d["section"] in ("exam", "investigations") and lx.FUTURE_CUE.search(low):
                report.dropped_planned_as_done += 1  # planned is not performed
                continue
            if d["section"] in ("meds_allergies", "treatment") and lx.MED_NAME.search(
                d["text"].lower()
            ):
                if not med_details_supported(d["text"], seg_text):
                    report.dropped_unsupported_med += 1
                    continue
            if src["speaker_role"] == "relative" and "reported by" not in d["text"].lower():
                d["text"] += f" - reported by {rel}, not by patient"
        elif src["type"] not in ("clinician_entered", "clinician_edited"):
            report.dropped_no_source += 1
            continue
        # Body system only when the text itself justifies it (never from the clinic's specialty).
        bs = d.get("body_system")
        if bs is not None:
            pattern = lx.BODY_SYSTEMS.get(bs)
            if pattern is None or not pattern.search(d["text"].lower()):
                d["body_system"] = None
                report.body_system_cleared += 1
        kept.append(d)

    order = {s: n for n, s in enumerate(SECTIONS)}

    def start(d: dict) -> float:
        seg = seg_by_id.get((d["source"] or {}).get("segment_id") or "")
        return seg.start if seg else 0.0

    kept.sort(key=lambda d: (order[d["section"]], start(d)))
    for n, d in enumerate(kept, 1):
        d["id"] = f"f-{n:03d}"
        d["source"] = {k: v for k, v in d["source"].items() if v is not None}

    review = build_review_items(kept, segments)
    note = {"header": header, "items": kept, "review_items": review}
    report.counts = {"items": len(kept), "review_items": len(review)}
    try:
        jsonschema.validate(note, NOTE_SCHEMA)
        models.Note.model_validate(note)
    except (jsonschema.ValidationError, ValidationError) as exc:
        raise ExtractInvalid() from exc
    return note, report
