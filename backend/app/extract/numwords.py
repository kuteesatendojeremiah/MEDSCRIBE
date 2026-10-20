"""Spoken numbers to digits ("five hundred" -> 500) before note extraction.

Speech recognition writes numbers as words or digits inconsistently, and doses, blood pressures and
durations depend on them. This is a conservative converter: only well-formed number phrases are changed,
a lone "one", frequency phrases ("three times daily") and everything else are left exactly as they are.
Display text is never changed; only the internal copy used to build the note.
"""

import re
from typing import Optional

from app.providers.base import Segment

UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}  # fmt: skip
TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80,
    "ninety": 90,
}  # fmt: skip
MULT = {"hundred": 100, "thousand": 1000}
DIGIT_WORDS = {k: v for k, v in UNITS.items() if v <= 9}
# A lone "one" is only a number before one of these ("one week", "one milligram").
ONE_UNITS = re.compile(
    r"^(?:day|days|week|weeks|month|months|year|years|hour|hours|milligram|milligrams|mg|gram|grams|kilogram|kilograms|kg|percent|unit|units)$"
)
TOKEN = re.compile(r"[A-Za-z]+|[^A-Za-z]+")


def _kind(word: str) -> Optional[str]:
    w = word.lower()
    if w in UNITS:
        return "unit"
    if w in TENS:
        return "tens"
    if w in MULT:
        return "mult"
    return None


def _value(words: list[str]) -> str:
    total = current = 0
    decimals: Optional[str] = None
    for w in (x.lower() for x in words):
        if w == "and":
            continue
        if w == "a":
            current = 1  # "a hundred"
            continue
        if w == "point":
            decimals = ""
        elif decimals is not None:
            decimals += str(DIGIT_WORDS[w])
        elif w in UNITS:
            current += UNITS[w]
        elif w in TENS:
            current += TENS[w]
        elif w == "hundred":
            current = (current or 1) * 100
        elif w == "thousand":
            total += (current or 1) * 1000
            current = 0
    whole = total + current
    return f"{whole}.{decimals}" if decimals else str(whole)


def words_to_digits(text: str) -> str:
    toks = TOKEN.findall(text)
    out: list[str] = []
    i = 0
    n = len(toks)
    while i < n:
        t = toks[i]
        kind = _kind(t) if t.isalpha() else None
        starts_a_hundred = (
            t.lower() == "a" and i + 2 < n and toks[i + 1] == " " and toks[i + 2].lower() in MULT
        )
        if kind is None and not starts_a_hundred:
            out.append(t)
            i += 1
            continue
        # grow the run: number words separated by one space or hyphen
        words = [t]
        last = "unit" if starts_a_hundred else kind
        j = i + 1
        end = i + 1
        while j + 1 < n and toks[j] in (" ", "-") and toks[j + 1].isalpha():
            nxt = toks[j + 1].lower()
            nk = _kind(nxt)
            has_big = any(w.lower() in MULT for w in words)
            if nxt == "and" and has_big and j + 3 < n + 1 and j + 3 <= n - 1 + 1:
                after = toks[j + 3] if j + 3 < n else ""
                if after.isalpha() and _kind(after) in ("unit", "tens"):
                    words.append(nxt)
                    last = "and"
                    j += 2
                    end = j
                    continue
                break
            if (
                nxt == "point"
                and last in ("unit", "tens", "mult")
                and j + 3 < n
                and toks[j + 3].lower() in DIGIT_WORDS
            ):
                words.append(nxt)
                last = "point"
                j += 2
                end = j
                continue
            if last == "point" and nk == "unit" and UNITS[nxt] <= 9:
                words.append(nxt)
                j += 2
                end = j
                continue
            ok = (
                (
                    last in ("and", "mult")
                    and nk in ("unit", "tens", "mult")
                    and not (last == "mult" and nk == "mult")
                )
                or (last == "tens" and nk == "unit" and 0 < UNITS[nxt] <= 9)
                or (
                    last == "unit"
                    and nk == "mult"
                    and (words[-1].lower() == "a" or UNITS[words[-1].lower()] <= 9)
                )
            )
            if not ok:
                break
            words.append(nxt)
            last = nk
            j += 2
            end = j
        # words[...] consumed tokens i..end-1
        following = ""
        k = end
        if k < n and toks[k] == " " and k + 1 < n:
            following = toks[k + 1].lower()
        lone_one = len(words) == 1 and words[0].lower() == "one" and not ONE_UNITS.match(following)
        before_times = following in ("times", "time") and len(words) == 1
        if lone_one or before_times:
            out.extend(toks[i:end])
        else:
            out.append(_value(words))
        i = end
    return "".join(out)


def normalize_segment(seg: Segment) -> Segment:
    """A copy whose texts have digits instead of spoken numbers, for note building only."""
    return seg.model_copy(
        update={
            "original_text": words_to_digits(seg.original_text),
            "english_text": None if seg.english_text is None else words_to_digits(seg.english_text),
        }
    )
