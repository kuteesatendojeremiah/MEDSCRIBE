"""Misheard-term suggestions: a transcript word or phrase that is close to a medical term but is not
one. Suggestions are shown to the clinician to accept or ignore; nothing is changed automatically."""

import re
from difflib import SequenceMatcher

from app.medical.vocab import ALL_TERMS

MIN_LEN = 6  # shorter words are too easily ordinary English
THRESHOLD = 0.78
_TERMS = {t.lower(): t for t in ALL_TERMS}
_LETTERS = {t: re.sub(r"[^a-z]", "", t) for t in _TERMS}
# American spellings are correct too: edema, dyspnea, hemoptysis, anemia (oe/ae -> e).
_ACCEPT = {_LETTERS[t] for t in _TERMS} | {re.sub(r"oe|ae", "e", _LETTERS[t]) for t in _TERMS}
_TOKEN = re.compile(r"[A-Za-z][A-Za-z'-]*")
# A phrase never starts or ends on a function word, so neighbouring words are not swallowed.
STOP = frozenset(
    "a an and are as at be by for from has have he her his i if in is it its of on or she so some that the "
    "their them then there they this to was we were with you your start takes take taking check shows show "
    "patient there raised erased does do did can could would should will may might must not no yes "
    "pain chest day days week weeks time today doctor please about after before again also any because been "
    "but come going good just like long made make many more much need now only other over said same see "
    "still such than these those very want well what when where which who why work year".split()
)


def skeleton(s: str) -> str:
    """Rough sound-alike key: common spelling variants collapsed, vowels dropped after the first letter."""
    s = re.sub(r"ph", "f", s)
    s = re.sub(r"ae|oe", "e", s)
    s = re.sub(r"[ck]+", "k", s)
    return s[:1] + re.sub(r"[aeiouyh]", "", s[1:])


def score(heard: str, term: str, words: int = 1) -> float:
    a, b = re.sub(r"[^a-z]", "", heard.lower()), _LETTERS[term]
    plain = SequenceMatcher(None, a, b).ratio()
    if words > 1:  # a phrase must match by spelling; sound-alike alone is too loose across words
        return plain if plain >= 0.82 else 0.0
    phon = SequenceMatcher(None, skeleton(a), skeleton(b)).ratio()
    return max(plain, 0.9 * phon)


def suggest(text: str) -> list[dict]:
    """[{heard, suggest, score, start, end}] for phrases (1-3 words) that look like a misheard term."""
    tokens = list(_TOKEN.finditer(text))
    low = text.lower()
    exact = [
        (m.start(), m.end())
        for term in _TERMS
        for m in re.finditer(r"\b" + re.escape(term) + r"\b", low)
    ]
    out: list[dict] = []
    used_until = -1
    for i, first in enumerate(tokens):
        if first.start() < used_until:
            continue
        best = None
        for n in (3, 2, 1):
            if i + n > len(tokens):
                continue
            words = [t.group(0).lower() for t in tokens[i : i + n]]
            if words[0] in STOP or words[-1] in STOP:
                continue
            if any(re.sub(r"[^a-z]", "", w) in _ACCEPT for w in words):
                continue  # already contains a correct term
            span = text[first.start() : tokens[i + n - 1].end()]
            if any(a < tokens[i + n - 1].end() and first.start() < b for a, b in exact):
                continue  # overlaps a correctly heard term
            letters = re.sub(r"[^a-z]", "", span.lower())
            if len(letters) < MIN_LEN or letters in _ACCEPT:
                continue
            for lower, term in _TERMS.items():
                if abs(len(letters) - len(_LETTERS[lower])) > 3:
                    continue
                s = score(span, lower, n)
                if s >= THRESHOLD and (best is None or s > best["score"]):
                    best = {
                        "heard": span,
                        "suggest": term,
                        "score": round(s, 2),
                        "start": first.start(),
                        "end": tokens[i + n - 1].end(),
                    }
        if best:
            out.append(best)
            used_until = best["end"]
    return out
