"""Compare speech models and vocabulary settings on a spoken sample of hard medical terms.

    backend/.venv/Scripts/python scripts/stt_term_check.py sample.wav base small

The sample is any WAV/MP3 of someone (or a text-to-speech voice) reading the sentences whose terms are
listed in TERMS. Results are an indication only: one voice, English (see docs/evaluation/stt_vocabulary_check.md).
"""

import io
import re
import sys
import time

sys.path.insert(0, "backend")
from faster_whisper import WhisperModel  # noqa: E402

from app.medical.vocab import HOTWORDS  # noqa: E402

TERMS = [
    "paroxysmal nocturnal dyspnoea",
    "orthopnoea",
    "amlodipine",
    "bisoprolol",
    "furosemide",
    "spironolactone",
    "echocardiogram",
    "ejection fraction",
    "mitral regurgitation",
    "electrocardiogram",
    "atrial fibrillation",
    "ramipril",
    "apixaban",
    "troponin",
    "creatinine",
    "oedema",
    "jugular venous pressure",
]


def norm(text: str) -> str:
    return re.sub(r"[^a-z ]", "", text.lower())


def run(wav: bytes, size: str, **kw) -> None:
    t0 = time.time()
    model = WhisperModel(size, device="cpu", compute_type="int8")
    load = time.time() - t0
    t0 = time.time()
    segs, _ = model.transcribe(io.BytesIO(wav), language="en", beam_size=1, **kw)
    text = " ".join(s.text.strip() for s in segs)
    hits = [t for t in TERMS if t in norm(text)]
    print(
        f"\n== {size} {list(kw) or 'plain'}: load {load:.0f}s run {time.time() - t0:.0f}s, terms {len(hits)}/{len(TERMS)}"
    )
    print(text)
    print("missed:", [t for t in TERMS if t not in hits])


if __name__ == "__main__":
    path, sizes = sys.argv[1], sys.argv[2:] or ["small"]
    audio = open(path, "rb").read()
    for size in sizes:
        run(audio, size)
        run(audio, size, hotwords=HOTWORDS)
