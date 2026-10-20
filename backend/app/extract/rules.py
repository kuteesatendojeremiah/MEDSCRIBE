"""Deterministic rule-based MOCK extractor (Phase 3). A test double for a structured-output model.

Input: corrected transcript segments. Output: raw item dicts WITHOUT ids (the shape a real model
would return); `mapping.build_note` validates and post-processes them. Rules encode §7.3:
questions are not facts, negation and time are kept, planned examinations are not findings, and
medication name/dose/route/frequency are never inferred.
"""

import re
from typing import Optional

from app.extract import lexicon as lx
from app.extract.review_engine import ambiguous_negation, join_and
from app.extract.numwords import normalize_segment
from app.providers.base import Segment

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
ANNOTATION = re.compile(r"\([^)]*\)")


def seg_text(seg: Segment) -> str:
    return (seg.english_text or seg.original_text).strip()


def sentences(text: str) -> list[str]:
    text = ANNOTATION.sub(lambda m: m.group(0), text)  # keep annotations; some carry meaning
    return [s.strip() for s in SENTENCE_SPLIT.split(text) if s.strip()]


def is_question(sentence: str) -> bool:
    return sentence.rstrip().endswith("?")


def number(word: str) -> str:
    w = word.lower()
    return "1" if w in ("a", "an") else lx.NUMBER_WORDS.get(w, word)


def negated_before(text: str, start: int) -> bool:
    """True when a negation sits in the same clause immediately before position `start`."""
    clause = lx.CLAUSE_SPLIT.split(text[:start])[-1]
    return bool(lx.NEGATION.search(clause))


def cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def duration(text: str) -> Optional[str]:
    m = re.search(r"\bfor (\w+) (day|week|month|year|hour)s?\b", text)
    if not m:
        return None
    n, unit = number(m.group(1)), m.group(2)
    return f"{n} {unit}{'' if n == '1' else 's'}"


def body_system(text: str) -> Optional[str]:
    for key, pattern in lx.BODY_SYSTEMS.items():
        if pattern.search(text.lower()):
            return key
    return None


def raw(
    section,
    text,
    seg: Segment,
    polarity="present",
    certainty="confirmed",
    bs=None,
    time=None,
):
    return {
        "section": section,
        "text": text,
        "polarity": polarity,
        "certainty": certainty,
        "body_system": bs,
        "time": time,
        "source": {
            "type": "segment",
            "segment_id": seg.id,
            "speaker_role": seg.speaker_role.value,
        },
    }


def denied_suffix(role: str) -> str:
    return {"patient": " (patient denied)", "relative": " (denied by relative)"}.get(role, "")


def split_family(seg: Segment, low: str) -> tuple[str, list[dict]]:
    """Clauses about someone else ("my mother had heart failure") are never the patient's symptoms.
    A patient's mention of a relative becomes family history; any other speaker's is left out.
    """
    keep, family = [], []
    for part in lx.PART_SPLIT.split(low):
        fam = lx.FAMILY_REL.search(part)
        other = lx.OTHER_PERSON.search(part)
        if not fam and not other:
            keep.append(part)
            continue
        if fam and seg.speaker_role.value == "patient":
            topics = [d for _k, (d, p) in lx.SYMPTOMS.items() if p.search(part)]
            topics += [d for d in lx.DIAGNOSES if d in part]
            neg = bool(lx.NEGATION.search(part[: fam.end() + 20]))
            for topic in topics:
                text = f"Family history: {fam.group(1)} - {'no ' if neg else ''}{topic}"
                family.append(raw("history", text, seg, "absent" if neg else "present"))
    return ", ".join(keep), family


def history_from(seg: Segment, sentence: str, low: str, pending: Optional[dict]) -> list[dict]:
    out: list[dict] = []
    role = seg.speaker_role.value
    # Answer to the previous doctor question: an answer is needed before anything is recorded.
    if (
        pending is not None
        and role in ("patient", "relative", "interpreter")
        and not is_question(sentence)
    ):
        positive, negative = lx.YES.match(low), lx.NO.match(low)
        if positive or negative:
            pol = "present" if positive else "absent"
            if pending["topic"] == "radiation":
                text = (
                    "Pain radiates to arm or jaw"
                    if positive
                    else "No radiation of pain to arm or jaw"
                )
            else:
                name = pending["display"]
                text = cap(name) if positive else f"No {name}"
            t = duration(low) if positive else None
            if t:
                text += f" for {t}"
            if not positive:
                text += denied_suffix(role)
            out.append(raw("history", text, seg, pol, time=t))
            return out
    low, family = split_family(seg, low)
    out += family
    for key, (display, pattern) in lx.SYMPTOMS.items():
        m = pattern.search(low)
        if not m:
            continue
        if is_question(sentence) or ambiguous_negation(low):
            continue  # a question is not a fact; an ambiguous negation is asked, not guessed
        neg = negated_before(low, m.start())
        if neg:
            out.append(raw("history", f"No {display}{denied_suffix(role)}", seg, "absent"))
        else:
            t = duration(low)
            text = cap(display) + (f" for {t}" if t else "")
            out.append(raw("history", text, seg, "present", time=t))
    if lx.NIGHT_DYSPNOEA.search(low) and not is_question(sentence):
        out.append(raw("history", "Wakes at night unable to breathe well", seg))
    if lx.EXERTION.search(low) and lx.EXERTION_EFFECT.search(low) and not is_question(sentence):
        stairs = "stairs" in low
        named = [d for _k, (d, p) in lx.SYMPTOMS.items() if p.search(low)]
        where = " (climbing stairs)" if stairs else ""
        if named:  # the patient named the symptom in this sentence: use their word, not "pain"
            text = f"{cap(named[0])} worse on exertion{where}"
        elif stairs:
            text = "Pain worse on exertion (climbing stairs)"
        else:
            text = "Symptoms worse on exertion"
        out.append(raw("history", text, seg))
    return out


def question_topic(sentence: str, low: str) -> Optional[dict]:
    if not is_question(sentence):
        return None
    if lx.RADIATION_Q.search(low) and lx.RADIATION_VERB.search(low):
        return {"topic": "radiation", "display": "radiation of pain"}
    if lx.NIGHT_BREATH_Q.search(low):
        return {"topic": "night breathlessness", "display": "night-time breathlessness"}
    for _key, (display, pattern) in lx.SYMPTOMS.items():
        if pattern.search(low):
            return {"topic": display, "display": display}
    return None


ALLERGEN = re.compile(
    r"allerg(?:ic|y)\s+to\s+(.*?)(?=\s+(?:and|but)\s+(?:i|he|she|we|they|my)\b|[.;]|$)"
)


def allergen_phrase(low: str) -> Optional[re.Match]:
    """ "allergic to penicillin" - the named substance is an allergy, never a medicine."""
    return ALLERGEN.search(low)


def allergy_from(seg: Segment, low: str, prev_question_allergy: bool) -> list[dict]:
    if "allerg" not in low and not prev_question_allergy:
        return []
    role = seg.speaker_role.value
    who = {"patient": "patient-reported", "relative": "reported by relative"}.get(role, "")
    m = allergen_phrase(low)
    if m and m.group(1).strip():
        text = f"Allergy: {m.group(1).strip()}" + (f" ({who})" if who else "")
        return [raw("meds_allergies", text, seg)]
    first = ANNOTATION.sub("", low).strip()
    if lx.NO.match(first) or re.match(r"^(?:not that i know|none|nothing|no known)", first):
        text = "Allergies: no known drug allergies" + (f" ({who})" if who else "")
        return [raw("meds_allergies", text, seg)]
    return []


def med_from(seg: Segment, sentence: str, low: str) -> list[dict]:
    windows = lx.drug_windows(low)
    allergen = allergen_phrase(low)
    if allergen:  # a named allergen is not a medicine the patient takes
        windows = [
            (n, w) for n, w in windows if not allergen.start(1) <= low.find(n) < allergen.end(1)
        ]
    if not windows or is_question(sentence):
        return []
    role = seg.speaker_role.value
    future = bool(lx.FUTURE_CUE.search(low))
    section = (
        "treatment"
        if role == "doctor" and (lx.START_CUE.search(low) or lx.STOP_CUE.search(low) or future)
        else "meds_allergies"
    )
    out = []
    for name, window in windows:
        display = lx.MEDICATIONS[name]
        if lx.STOP_CUE.search(low):
            out.append(raw("treatment", f"Stop {display}", seg))
            continue
        dose = lx.DOSE.search(window)  # only this medicine's own stretch of the sentence
        dose_text = None
        if dose:
            unit = lx.UNIT_CANON.get(dose.group(2), dose.group(2))
            dose_text = f"{dose.group(1)} {unit}"
        route = next((r for r, p in lx.ROUTES if p.search(window)), None)
        freq = next((f for f, p in lx.FREQUENCIES if p.search(window)), None)
        inaudible = bool(lx.INAUDIBLE.search(window))
        required = {"dose": dose_text, "frequency": freq}
        if section == "treatment":
            required = {"dose": dose_text, "route": route, "frequency": freq}
        stated = [v for v in (dose_text, route, freq) if v]
        missing = [k for k, v in required.items() if not v]
        text = display + (" " + " ".join(stated) if stated else "")
        if missing:
            text += " – " + join_and(missing) + " not stated"
            if inaudible:
                text += " (audio inaudible)"
            elif lx.HEDGE.search(low) and role == "patient":
                text += " (patient unsure)"
        cert = (
            "possible" if lx.HEDGE.search(low) and role in ("patient", "relative") else "confirmed"
        )
        out.append(raw(section, text, seg, certainty=cert))
    return out


def vitals_from(seg: Segment, low: str) -> list[dict]:
    out: list[dict] = []
    if m := re.search(r"weight (?:is |was )?(\d+(?:\.\d+)?)\s*(?:kg|kilograms?|kilos?)", low):
        out.append(raw("vitals", f"Weight {m.group(1)} kg", seg))
    if m := re.search(
        r"(?:blood pressure|\bbp\b)\s*(?:is |was )?(\d{2,3})\s*(?:over|/)\s*(\d{2,3})",
        low,
    ):
        out.append(raw("vitals", f"BP {m.group(1)}/{m.group(2)} mmHg", seg))
    if m := re.search(r"pulse\b([^.?!]*)", low):
        rest = m.group(1)
        rate = re.search(r"(\d{2,3})", rest)
        rhythm = re.search(r"\b(irregularly irregular|irregular|regular)\b", rest)
        if rate:
            approx = re.search(r"\b(?:about|around|approximately|approx)\b", rest)
            text = f"Pulse {'approx. ' if approx else ''}{rate.group(1)}/min"
            if rhythm:
                text += f", {rhythm.group(1)}"
            out.append(raw("vitals", text, seg, bs="cvs"))
        if rhythm:
            out.append(raw("exam", f"Pulse {rhythm.group(1)}", seg, bs="cvs"))
    if m := re.search(r"(?:respiratory rate|resp rate|\brr\b)\D{0,10}(\d{1,2})\b", low):
        out.append(raw("vitals", f"Respiratory rate {m.group(1)}/min", seg))
    if m := re.search(
        r"(?:oxygen saturation|spo2|\bsats?\b)\D{0,10}(\d{2,3})\s*(?:%|percent)?", low
    ):
        out.append(raw("vitals", f"SpO₂ {m.group(1)}%", seg))
    if m := re.search(r"(?:temperature|\btemp\b)\D{0,10}(\d{2}(?:\.\d)?)", low):
        out.append(raw("vitals", f"Temperature {m.group(1)} °C", seg))
    return out


def exam_from(seg: Segment, sentence: str, low: str) -> list[dict]:
    if seg.speaker_role.value not in ("doctor", "other_clinician"):
        return []
    if is_question(sentence) or lx.FUTURE_CUE.search(low):
        return []  # a planned examination is not a finding (§4.1)
    for pattern, system in lx.EXAM_FINDINGS:
        m = pattern.search(low)
        if not m:
            continue
        neg = negated_before(low, m.start())
        body = lx.LEADING_EXAM_PHRASES.sub("", low).rstrip(".")
        if neg:
            body = re.sub(r"^no\s+", "", body)
            return [raw("exam", f"No {body}", seg, "absent", bs=system)]
        return [raw("exam", cap(body), seg, bs=system)]
    return []


def test_name(low: str) -> Optional[tuple[str, str]]:
    for pattern, display, long in lx.TESTS:
        if pattern.search(low):
            return display, long
    return None


def investigations_and_plan(seg: Segment, sentence: str, low: str) -> list[dict]:
    if seg.speaker_role.value not in ("doctor", "other_clinician") or is_question(sentence):
        return []
    out: list[dict] = []
    cue = lx.PLAN_CUE.search(low) or lx.FUTURE_CUE.search(low)
    tests = [(d, lng) for p, d, lng in lx.TESTS if p.search(low)]
    shows = re.search(
        r"\b(?:shows?|showed|reveals?|revealed|result(?:s)? (?:is|are|was|were)?|is|was)\b\s+(.+)$",
        low,
    )
    if tests and not cue and shows:
        display = tests[0][0]
        finding = shows.group(1).rstrip(".")
        text = f"{display}: {finding}"
        if display == "ECG":
            text += " (clinician's reading during consultation)"
        out.append(raw("investigations", text, seg, bs=body_system(text)))
    elif tests and cue:
        for display, _ in tests:
            out.append(raw("plan", display, seg))
    if m := lx.FOLLOW_UP.search(low):
        n = number(m.group(1))
        unit = m.group(2)
        t = f"{n} {unit}{'' if n == '1' else 's'}"
        out.append(raw("plan", f"Review in {t}", seg, time=t))
    if m := lx.REFERRAL.search(low):
        out.append(raw("plan", f"Referral to {m.group(1).strip()}", seg))
    return out


def assessment_from(seg: Segment, sentence: str, low: str, all_low: str) -> list[dict]:
    if seg.speaker_role.value != "doctor" or is_question(sentence):
        return []
    tail = ""
    if (t := test_name(all_low)) and lx.PLAN_CUE.search(all_low):
        tail = f"; for {t[1]}"
    if m := lx.DX_STATED.search(low):
        dx = m.group(1).rstrip(".")
        return [raw("assessment", f"{cap(dx)} – clinician-stated", seg, bs=body_system(dx))]
    if (m := lx.DX_YOU_HAVE.search(low)) and lx.DIAGNOSIS_RE.search(m.group(1)):
        dx = m.group(1).rstrip(".")
        return [raw("assessment", f"{cap(dx)} – clinician-stated", seg, bs=body_system(dx))]
    if m := lx.DX_RULE_OUT.search(low):
        dx = m.group(1).rstrip(".")
        return [
            raw(
                "assessment",
                f"Rule out {dx}{tail}",
                seg,
                certainty="rule_out",
                bs=body_system(dx),
            )
        ]
    m = lx.DX_POSSIBLE.search(low)
    if m:
        dx = (m.group(1) or m.group(2) or "").rstrip(".")
        if lx.DIAGNOSIS_RE.search(dx):
            return [
                raw(
                    "assessment",
                    f"Possible {dx} – differential, NOT confirmed{tail}",
                    seg,
                    certainty="possible",
                    bs=body_system(dx),
                )
            ]
    return []


class MockExtractor:
    """Deterministic, offline, rule-based. Holds no state between calls."""

    name = "mock-rules"

    def extract(self, segments: list[Segment], present: list[str]) -> dict:
        segments = [
            normalize_segment(s) for s in segments
        ]  # spoken numbers -> digits (internal copy)
        items: list[dict] = []
        pending: Optional[dict] = None
        pending_allergy = False
        for seg in segments:
            text = seg_text(seg)
            sents = sentences(text)
            low_all = text.lower()
            seg_pending, seg_pending_allergy = pending, pending_allergy
            new_pending: Optional[dict] = None
            new_allergy = False
            for sentence in sents:
                low = sentence.lower()
                if seg.speaker_role.value in (
                    "doctor",
                    "other_clinician",
                ) and is_question(sentence):
                    topic = question_topic(sentence, low)
                    if topic:
                        new_pending = topic
                    if "allerg" in low:
                        new_allergy = True
                    continue
                items += (
                    history_from(seg, sentence, low, seg_pending)
                    if seg.speaker_role.value
                    not in (
                        "doctor",
                        "other_clinician",
                    )
                    else []
                )
                items += med_from(seg, sentence, low)
                items += vitals_from(seg, low)
                items += exam_from(seg, sentence, low)
                items += investigations_and_plan(seg, sentence, low)
                items += assessment_from(seg, sentence, low, low_all)
            if seg.speaker_role.value not in ("doctor", "other_clinician"):
                items += allergy_from(seg, low_all, seg_pending_allergy)
            pending, pending_allergy = new_pending, new_allergy
        return {"items": dedupe(items)}


def dedupe(items: list[dict]) -> list[dict]:
    """The same (section, text) said twice keeps the later source (an explicit instruction wins)."""
    last: dict[tuple[str, str], dict] = {}
    order: list[tuple[str, str]] = []
    for it in items:
        key = (it["section"], it["text"])
        if key not in last:
            order.append(key)
        last[key] = it
    return [last[k] for k in order]
