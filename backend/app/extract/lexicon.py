"""Small closed lexicons used by the deterministic MOCK extractor and the safety layer.

These are test doubles for a real model: they cover the synthetic cases only and make no claim of
clinical coverage (Blueprint §7.3, §15.1). Matching is on lower-cased English text.
"""

import re

NUMBER_WORDS = {
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "twelve": "12",
    "fourteen": "14",
}

# Symptom key -> (display name, pattern)
SYMPTOMS: dict[str, tuple[str, re.Pattern]] = {
    "chest_pain": ("chest pain", re.compile(r"chest pain|pain in (?:my|the) chest")),
    "sob": (
        "shortness of breath",
        re.compile(
            r"shortness of breath|short of breath|breathless(?:ness)?|difficulty breathing|\bdysp?n(?:o)?ea\b"
        ),
    ),
    "palpitations": (
        "palpitations",
        re.compile(r"palpitations?|heart (?:is )?racing|heart pounding"),
    ),
    "dizziness": ("dizziness", re.compile(r"dizz(?:y|iness)|light-?headed(?:ness)?")),
    "syncope": ("fainting", re.compile(r"faint(?:ed|ing)?|passed out|blackouts?")),
    "ankle_swelling": (
        "ankle swelling",
        re.compile(r"ankle swelling|swollen ankles?|leg swelling|swelling of (?:my|the) ankles"),
    ),
    "orthopnoea": ("orthopnoea", re.compile(r"orthopn(?:o)?ea")),
    "pnd": (
        "paroxysmal nocturnal dyspnoea",
        re.compile(r"paroxysmal nocturnal dysp?n(?:o)?ea|\bpnd\b"),
    ),
    "claudication": ("claudication", re.compile(r"claudication")),
    "haemoptysis": ("haemoptysis", re.compile(r"h(?:a)?emoptysis|coughing (?:up )?blood")),
    "cough": ("cough", re.compile(r"\bcough(?:ing)?\b")),
    "fatigue": ("fatigue", re.compile(r"fatigue|very tired|tiredness")),
}

NIGHT_DYSPNOEA = re.compile(
    r"(?:at night|in the night|night).{0,40}(?:wak(?:es|ing)|woke).{0,40}"
    r"(?:unable to breathe|cannot breathe|can't breathe|breathless|short of breath)"
)
EXERTION = re.compile(
    r"(?:on|up|climb(?:ing)?|when climbing)\s+(?:the\s+)?stairs|on exertion|walk(?:ing)? uphill|exercise"
)
EXERTION_EFFECT = re.compile(r"\b(?:bad|worse|worsen\w*|pain|breathless|tight)\b")
RADIATION_Q = re.compile(r"\b(?:arm|jaw)\b")
RADIATION_VERB = re.compile(r"go|radiat|spread|travel|move")

NEGATION = re.compile(
    r"\b(?:no|not|never|without|denies|deny|none|nothing|don't|do not|doesn't|does not|didn't|did not)\b"
)
CLAUSE_SPLIT = re.compile(r"[,.;:]|\bbut\b|\band\b")
FUTURE_CUE = re.compile(
    r"\b(?:will|let me|let's|going to|shall|need to|we need|i'll|plan to|to be done|about to)\b"
)
YES = re.compile(r"^(?:yes|yeah|yep|sometimes|a bit|i do|it does)\b")
NO = re.compile(r"^(?:no|nope|nedda|not really|never|not at all)\b")
HEDGE = re.compile(r"\b(?:i think|maybe|not sure|probably|i guess|perhaps)\b")

# Medication names (generic) from the shared vocabulary. Never inferred from "common practice" (§7.3).
from app.medical.vocab import DRUGS  # noqa: E402

MEDICATIONS = {d.replace("-", " "): d.replace("-", " ").title() for d in DRUGS}
MED_NAME = re.compile(
    r"\b(" + "|".join(sorted((re.escape(m) for m in MEDICATIONS), key=len, reverse=True)) + r")\b"
)
DOSE = re.compile(r"(\d+(?:\.\d+)?)\s*(milligrams?|mg|micrograms?|mcg|grams?|g|ml|units?|iu)\b")
ROUTES = [
    ("orally", re.compile(r"\b(?:orally|by mouth|oral|tablets?)\b")),
    ("intravenously", re.compile(r"\b(?:intravenous(?:ly)?|iv)\b")),
    ("subcutaneously", re.compile(r"\b(?:subcutaneous(?:ly)?|sc)\b")),
    ("sublingually", re.compile(r"\bsublingual(?:ly)?\b")),
]
# Order matters: more specific frequencies first. A bare "daily" is kept as "daily", never promoted
# to "once daily" (that would be an inference, §7.3), and "twice daily" must never match it.
FREQUENCIES = [
    (
        "twice daily",
        re.compile(r"\b(?:twice (?:a|per) day|twice daily|bd|two times a day)\b"),
    ),
    (
        "three times daily",
        re.compile(r"\b(?:three times (?:a|per) day|three times daily|tds)\b"),
    ),
    ("at night", re.compile(r"\b(?:at night|nocte|at bedtime)\b")),
    ("weekly", re.compile(r"\b(?:once a week|weekly)\b")),
    (
        "once daily",
        re.compile(r"\b(?:once (?:a|per) day|once daily|every day|each day|od|every morning)\b"),
    ),
    ("daily", re.compile(r"\bdaily\b")),
]
START_CUE = re.compile(r"\b(?:start|starting|prescribe|prescribing|commence|begin|add|give)\b")
STOP_CUE = re.compile(r"\b(?:stop|discontinue|stopping)\b")

EXAM_FINDINGS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"crackles|crepitations|wheeze|air entry|dullness|pleural effusion"), "resp"),
    (
        re.compile(
            r"murmur|jvp|jugular|heart sounds?|gallop|o?edema|oedema|pericardial rub|displaced apex|thrill|"
            r"cardiomegaly|tachycardi|bradycardi"
        ),
        "cvs",
    ),
    (re.compile(r"abdomen|abdominal|hepatomegaly|ascites|tender"), "gi"),
    (re.compile(r"cyanosis|clubbing|pallor|jaundice"), "general"),
]
LEADING_EXAM_PHRASES = re.compile(
    r"^(?:(?:on examination|there (?:are|is)|i can hear|i can see|i hear|i see|i found|i note)[, ]*)+",
)

TESTS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"\becg\b|\bekg\b|electrocardiogram"), "ECG", "ECG"),
    (
        re.compile(r"\becho(?:cardiogram|cardiography)?\b"),
        "Echocardiogram",
        "echocardiography",
    ),
    (
        re.compile(r"kidney function|renal function|\bu ?& ?es?\b|creatinine"),
        "Renal function tests",
        "renal function tests",
    ),
    (re.compile(r"chest x-?ray|chest xray|\bcxr\b"), "Chest X-ray", "chest X-ray"),
    (
        re.compile(r"blood tests?|\bbloods\b|full blood count|\bfbc\b"),
        "Blood tests",
        "blood tests",
    ),
    (re.compile(r"troponin"), "Troponin", "troponin"),
    (re.compile(r"holter"), "Holter monitor", "Holter monitor"),
    (re.compile(r"hba1c|glycated"), "HbA1c", "HbA1c"),
    (re.compile(r"lipid profile|cholesterol"), "Lipid profile", "lipid profile"),
    (re.compile(r"thyroid function"), "Thyroid function tests", "thyroid function tests"),
    (re.compile(r"\binr\b"), "INR", "INR"),
    (re.compile(r"nt-?pro-?bnp|\bbnp\b"), "BNP", "BNP"),
    (re.compile(r"d-?dimer"), "D-dimer", "D-dimer"),
    (re.compile(r"stress test|exercise test"), "Stress test", "stress test"),
    (re.compile(r"angiogra(?:m|phy)"), "Coronary angiography", "angiography"),
    (re.compile(r"cardiac mri|cardiac magnetic"), "Cardiac MRI", "cardiac MRI"),
]
PLAN_CUE = re.compile(
    r"\b(?:do|order|arrange|request|need|will|schedule|send|get|book|repeat|let's|going to)\b"
)
FOLLOW_UP = re.compile(
    r"(?:come back|return|review|see you|follow.?up)\s+(?:in|after)\s+(\w+)\s+(day|week|month)s?"
)
REFERRAL = re.compile(r"refer(?:ring)? you to (?:the )?([\w ]+?)(?:[.,;]|$)")

from app.medical.vocab import CONDITIONS  # noqa: E402

DIAGNOSES = [c.replace("-", " ").lower() for c in CONDITIONS]
DIAGNOSIS_RE = re.compile("|".join(DIAGNOSES))
DX_STATED = re.compile(r"(?:impression|diagnosis|assessment|conclusion)\s+is\s+(.+)$")
DX_YOU_HAVE = re.compile(r"\byou (?:have|are having|suffer from)\s+(.+)$")
DX_POSSIBLE = re.compile(
    r"^(.+?)\s+(?:is|are)\s+(?:possible|likely|probable|a possibility)|"
    r"(?:suspect|query|differential includes|may be|could be|might be)\s+(.+)$"
)
DX_RULE_OUT = re.compile(r"(?:rule out|to exclude|exclude)\s+(.+)$")

BODY_SYSTEMS: dict[str, re.Pattern] = {
    "cvs": re.compile(
        r"atrial|fibrillation|heart|cardiac|pulse|\becg\b|electrocardiogram|echocardiogram|murmur|"
        r"o?edema|oedema|jvp|jugular|gallop|angina|infarction|bisoprolol|tachycardi|bradycardi|"
        r"cardiomegaly|valv|mitral|aortic"
    ),
    "resp": re.compile(r"lung|crackles|wheeze|air entry|pneumonia|pulmonary|chest x-ray"),
    "gi": re.compile(r"abdom|liver|bowel|hepat"),
    "renal": re.compile(r"kidney|renal|creatinine"),
    "neuro": re.compile(r"stroke|seizure|neuro|cranial"),
    "msk": re.compile(r"joint|muscle|bone|spine"),
    "general": re.compile(r"general appearance|pallor|jaundice|cachexia"),
}

MIN_CLEAR_CONFIDENCE_FOR_TRANSLATION = 0.8
INAUDIBLE = re.compile(r"\[inaudible\]")


# --- clinical-safety audit additions ---------------------------------------------------------------
FAMILY_REL = re.compile(
    r"\bmy (father|mother|brother|sister|son|daughter|uncle|aunt|grandmother|grandfather|wife|husband)\b"
)
OTHER_PERSON = re.compile(r"\bmy (neighbou?r|friend|colleague|boss|cousin)\b")
PART_SPLIT = re.compile(r"[,;]|\band\b|\bbut\b")

# Usual single-dose ceilings used ONLY to flag a wrong unit or an implausible number for a human to
# verify. Nothing is ever converted or corrected. unit -> maximum value.
DOSE_LIMITS: dict[str, dict[str, float]] = {
    "amlodipine": {"mg": 20},
    "bisoprolol": {"mg": 20},
    "aspirin": {"mg": 1000},
    "warfarin": {"mg": 15},
    "furosemide": {"mg": 500},
    "enalapril": {"mg": 80},
    "atorvastatin": {"mg": 80},
    "metformin": {"mg": 3000},
    "digoxin": {"mcg": 500, "mg": 0.5},
    "spironolactone": {"mg": 400},
    "carvedilol": {"mg": 100},
    "lisinopril": {"mg": 80},
    "clopidogrel": {"mg": 600},
}
UNIT_CANON = {
    "milligram": "mg",
    "milligrams": "mg",
    "mg": "mg",
    "gram": "g",
    "grams": "g",
    "microgram": "mcg",
    "micrograms": "mcg",
    "mcg": "mcg",
    "ml": "ml",
    "unit": "units",
    "units": "units",
    "iu": "iu",
}


def drug_windows(low: str) -> list[tuple[str, str]]:
    """For each medicine named in `low`, the stretch of text from its name up to the next medicine.
    A dose, route or frequency belongs to the medicine whose stretch it sits in - never to a neighbour
    ("amlodipine 5 mg once daily and metformin 500 mg twice daily")."""
    hits = list(MED_NAME.finditer(low))
    out = []
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(low)
        out.append((m.group(1), low[m.start() : end]))
    return out


NIGHT_BREATH_Q = re.compile(
    r"(?:wake|wak(?:es|ing)|woke).{0,30}night.{0,40}(?:breath|breathless|short of breath)|"
    r"night.{0,30}(?:wake|wak(?:es|ing)|woke).{0,40}(?:breath|breathless|short of breath)"
)
