"""Review-item engine (Blueprint §4.4): pure functions from note items and segments to review items.

Works only from what is in the items and the transcript, so it applies equally to the mock
extractor and to any future model. Reasons carry no more than the clinician needs to act on.
"""

import re
from typing import Optional

from app.extract import lexicon as lx
from app.providers.base import Segment

VITAL_PATTERNS = [
    ("BP", re.compile(r"\bbp\b|blood pressure", re.I)),
    ("Pulse", re.compile(r"pulse|heart rate", re.I)),
    ("RR", re.compile(r"respiratory rate|\brr\b", re.I)),
    ("SpO₂", re.compile(r"spo|saturation", re.I)),
    ("Temperature", re.compile(r"temp", re.I)),
    ("Weight", re.compile(r"weight|\bkg\b", re.I)),
]
VITAL_NAMES = {"RR": "Respiratory rate", "SpO₂": "SpO2", "Temperature": "temperature"}
SECTIONS = [
    "history",
    "meds_allergies",
    "vitals",
    "exam",
    "investigations",
    "assessment",
    "treatment",
    "plan",
]
SECTION_LABEL = {
    "history": "History",
    "meds_allergies": "Medications & allergies",
    "vitals": "Vital signs",
    "exam": "Examination",
    "investigations": "Investigations",
    "assessment": "Assessment",
    "treatment": "Treatment",
    "plan": "Plan",
}


def mmss(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def join_and(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def missing_vitals(items: list[dict]) -> list[str]:
    texts = [i["text"] for i in items if i["section"] == "vitals"]
    return [name for name, pat in VITAL_PATTERNS if not any(pat.search(t) for t in texts)]


def med_details(text: str) -> dict:
    low = text.lower()
    name_m = lx.MED_NAME.search(low)
    return {
        "name": lx.MEDICATIONS[name_m.group(1)] if name_m else None,
        "dose": bool(lx.DOSE.search(low)),
        "route": any(p.search(low) for _, p in lx.ROUTES),
        "frequency": any(p.search(low) for _, p in lx.FREQUENCIES),
        "inaudible": "inaudible" in low,
    }


def medication_reviews(items: list[dict], seg_by_id: dict[str, Segment]) -> list[dict]:
    """HIGH: missing or unclear dose, route or frequency (§4.4). Never completed by guessing."""
    out = []
    for it in items:
        if it["section"] not in ("meds_allergies", "treatment"):
            continue
        d = med_details(it["text"])
        if not d["name"] or it["text"].lower().startswith(
            ("stop ", "allerg")
        ):  # an allergen is not a medicine
            continue
        required = (
            ["dose", "frequency"]
            if it["section"] == "meds_allergies"
            else [
                "dose",
                "route",
                "frequency",
            ]
        )
        missing = [k for k in required if not d[k]]
        if not missing:
            continue
        seg = seg_by_id.get(it["source"].get("segment_id", ""))
        audio_unclear = d["inaudible"] or bool(seg and lx.INAUDIBLE.search(seg.original_text))
        phrases = []
        others = [m for m in missing if not (m == "dose" and audio_unclear)]
        if "dose" in missing and audio_unclear:
            phrases.append("dose inaudible")
        if others:
            phrases.append(f"{join_and(others)} not stated")
        time = f" ({mmss(seg.start)})" if seg and audio_unclear else ""
        out.append(
            {
                "level": "HIGH",
                "item": it,
                "reason": f"{d['name']} {'; '.join(phrases)}{time}",
            }
        )
    return out


def symptom_key(text: str) -> Optional[str]:
    low = text.lower()
    if "night" in low and "breath" in low:
        return "night_dyspnoea"  # distinct from breathlessness on exertion
    for key, (_, pattern) in lx.SYMPTOMS.items():
        if pattern.search(low):
            return key
    if lx.NIGHT_DYSPNOEA.search(low):
        return "night_dyspnoea"
    if "radiation of pain" in low or "radiates" in low:
        return "radiation"
    return None


def ambiguous_negation(text: str) -> bool:
    """Two or more negations in the clause before a symptom (for example "not true that I have no
    chest pain"): the meaning cannot be trusted, so nothing is recorded and a human is asked (§7.3).
    """
    low = text.lower()
    for _key, (_display, pattern) in lx.SYMPTOMS.items():
        for m in pattern.finditer(low):
            clause = lx.CLAUSE_SPLIT.split(low[: m.start()])[-1]
            if len(lx.NEGATION.findall(clause)) >= 2:
                return True
    return False


def dose_parts(text: str) -> list[tuple[str, str, float]]:
    """(drug, canonical unit, value) for each stated dose; used to compare and to sanity-check."""
    low = text.lower()
    drug = lx.MED_NAME.search(low)
    out = []
    for m in lx.DOSE.finditer(low):
        if drug:
            out.append(
                (
                    drug.group(1),
                    lx.UNIT_CANON.get(m.group(2), m.group(2)),
                    float(m.group(1)),
                )
            )
    return out


def plausibility_reviews(items: list[dict]) -> list[dict]:
    """HIGH: a dose whose unit or size is outside the usual range for that drug. Flag only."""
    out = []
    for it in items:
        if it["section"] not in ("meds_allergies", "treatment"):
            continue
        if it["text"].lower().startswith("allerg"):
            continue
        for drug, unit, value in dose_parts(it["text"]):
            limits = lx.DOSE_LIMITS.get(drug)
            if limits is None:
                continue
            if unit not in limits or value > limits[unit]:
                name = lx.MEDICATIONS[drug]
                reason = (
                    f"{name} dose {value:g} {unit} looks implausible (unusual unit or size)"
                    " - verify the unit"
                )
                out.append({"level": "HIGH", "item": it, "reason": reason})
    return out


def medication_conflict_reviews(items: list[dict]) -> list[dict]:
    """HIGH: two different doses or frequencies reported for the same drug."""
    out = []
    seen: dict[str, dict] = {}
    for it in items:
        if it["section"] not in ("meds_allergies", "treatment"):
            continue
        low = it["text"].lower()
        name_m = lx.MED_NAME.search(low)
        if not name_m or low.startswith(("stop ", "allerg")):
            continue
        drug = name_m.group(1)
        doses = {f"{v:g} {u}" for _d, u, v in dose_parts(it["text"])}
        freq = next((f for f, p in lx.FREQUENCIES if p.search(low)), None)
        prior = seen.get(drug)
        if prior:
            if doses and prior["doses"] and doses != prior["doses"]:
                both = join_and(sorted(prior["doses"] | doses))
                reason = f"Conflicting doses reported for {lx.MEDICATIONS[drug]} ({both})"
                out.append({"level": "HIGH", "item": it, "reason": reason})
            elif freq and prior["freq"] and freq != prior["freq"]:
                reason = f"Conflicting frequencies reported for {lx.MEDICATIONS[drug]}"
                out.append({"level": "HIGH", "item": it, "reason": reason})
        else:
            seen[drug] = {"doses": doses, "freq": freq}
    return out


def conflict_reviews(items: list[dict]) -> list[dict]:
    """HIGH: conflicting facts in the same section about the same finding."""
    out = []
    seen: dict[str, dict] = {}
    for it in items:
        if it["section"] != "history":
            continue
        key = symptom_key(it["text"])
        if not key:
            continue
        prior = seen.get(key)
        if prior and prior["polarity"] != it["polarity"]:
            label = lx.SYMPTOMS.get(key, (key.replace("_", " "), None))[0]
            out.append(
                {
                    "level": "HIGH",
                    "item": it,
                    "reason": f"Conflicting statements about {label}",
                }
            )
        seen.setdefault(key, it)
    return out


def check_reviews(items: list[dict], segments: list[Segment]) -> list[dict]:
    out = []
    for it in items:
        if it["section"] == "assessment" and it["certainty"] in (
            "possible",
            "rule_out",
        ):
            dx = re.sub(r"^(?:possible|rule out)\s+", "", it["text"], flags=re.I)
            dx = re.split(r" [–-] | ?;", dx)[0].strip()
            if it["certainty"] == "possible":
                reason = f"'{lx_cap(dx)} is possible' – confirm as differential only"
            else:
                reason = f"'Rule out {dx}' – confirm as rule-out only"
            out.append({"level": "CHECK", "item": it, "reason": reason})
    for seg in segments:
        text = (seg.english_text or seg.original_text).strip()
        low = text.lower()
        if ambiguous_negation(text):
            reason = (
                f"Ambiguous negation at {mmss(seg.start)} - confirm with the patient"
                " (nothing recorded)"
            )
            out.append({"level": "CHECK", "item": None, "reason": reason, "t": seg.start})
        if lx.INAUDIBLE.sub("", low).strip(" .,;[]()") == "":
            if seg.speaker_role.value == "unknown":
                reason = f"Unknown speaker, inaudible at {mmss(seg.start)} (no clinical content)"
            else:
                reason = f"Inaudible segment at {mmss(seg.start)}"
            out.append({"level": "CHECK", "item": None, "reason": reason, "t": seg.start})
        elif text.rstrip().endswith("?") and lx.DIAGNOSIS_RE.search(low):
            out.append(
                {
                    "level": "CHECK",
                    "item": None,
                    "reason": f"Possible diagnosis phrased as a question at {mmss(seg.start)} – not recorded as a finding",
                    "t": seg.start,
                }
            )
        elif seg.english_text and seg.confidence < lx.MIN_CLEAR_CONFIDENCE_FOR_TRANSLATION:
            out.append(
                {
                    "level": "CHECK",
                    "item": None,
                    "reason": f"Uncertain translation at {mmss(seg.start)} – check the original",
                    "t": seg.start,
                }
            )
        if seg.speaker_role.value == "interpreter" and any(
            i["source"].get("segment_id") == seg.id for i in items
        ):
            out.append(
                {
                    "level": "CHECK",
                    "item": None,
                    "reason": f"Statement relayed by interpreter at {mmss(seg.start)} – confirm who said it",
                    "t": seg.start,
                }
            )
    return out


def lx_cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def high_context_reviews(items: list[dict], segments: list[Segment]) -> list[dict]:
    out = []
    if not any(
        i["section"] == "meds_allergies" and re.search(r"allerg", i["text"], re.I) for i in items
    ):
        out.append({"level": "HIGH", "item": None, "reason": "Allergy status unknown"})
    for it in items:
        if it["source"].get("speaker_role") == "unknown":
            seg = next((s for s in segments if s.id == it["source"].get("segment_id")), None)
            when = f" at {mmss(seg.start)}" if seg else ""
            out.append(
                {
                    "level": "HIGH",
                    "item": it,
                    "reason": f"Clinical statement from an unknown speaker{when}",
                }
            )
    return out


def info_reviews(items: list[dict]) -> list[dict]:
    out = []
    missing = missing_vitals(items)
    if missing:
        names = [VITAL_NAMES.get(m, m) for m in missing]
        out.append({"level": "INFO", "item": None, "reason": f"{join_and(names)} not recorded"})
    for sec in SECTIONS:
        if not any(i["section"] == sec for i in items) and sec != "vitals":
            out.append(
                {
                    "level": "INFO",
                    "item": None,
                    "reason": f"{SECTION_LABEL[sec]} section empty",
                }
            )
    return out


def unmapped_reviews(items: list[dict], segments: list[Segment]) -> list[dict]:
    """INFO: substantial speech that produced nothing in the note. Nothing is guessed; the clinician
    is told it exists so it can be typed in if it is clinical (§7.3 'no silent invention' cuts both ways:
    nothing is silently dropped either)."""
    used = {i["source"].get("segment_id") for i in items}
    out = []
    for seg in segments:
        text = (seg.english_text or seg.original_text).strip()
        words = re.findall(r"[\w']+", text)
        if (
            seg.id in used
            or len(words) < 4
            or text.endswith("?")
            or lx.INAUDIBLE.sub("", text.lower()).strip(" .,;[]()") == ""
        ):
            continue
        shown = text if len(text) <= 70 else text[:67] + "..."
        out.append(
            {
                "level": "INFO",
                "item": None,
                "reason": f'Speech at {mmss(seg.start)} was not placed in the note: "{shown}"',
                "t": seg.start,
            }
        )
    return out


def build_review_items(items: list[dict], segments: list[Segment]) -> list[dict]:
    """`items` are dicts that already carry ids. Returns review items with ids, HIGH first."""
    seg_by_id = {s.id: s for s in segments}
    raw: list[dict] = []
    raw += medication_reviews(items, seg_by_id)
    raw += conflict_reviews(items)
    raw += medication_conflict_reviews(items)
    raw += plausibility_reviews(items)
    raw += high_context_reviews(items, segments)
    raw += check_reviews(items, segments)
    raw += info_reviews(items)
    raw += unmapped_reviews(items, segments)

    def when(r: dict) -> float:
        if r.get("t") is not None:
            return r["t"]
        item = r.get("item")
        seg = seg_by_id.get(item["source"].get("segment_id", "")) if item else None
        return seg.start if seg else 0.0

    order = {"HIGH": 0, "CHECK": 1, "INFO": 2}
    raw.sort(key=lambda r: (order[r["level"]], when(r)))
    return [
        {
            "id": f"r-{n:03d}",
            "level": r["level"],
            "item_id": r["item"]["id"] if r.get("item") else None,
            "reason": r["reason"],
            "status": "open",
        }
        for n, r in enumerate(raw, 1)
    ]
