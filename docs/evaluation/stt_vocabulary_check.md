# Speech model vs medical vocabulary (local faster-whisper), one synthetic sample

Sample: a Windows text-to-speech reading of one paragraph with 17 hard terms (paroxysmal nocturnal
dyspnoea, orthopnoea, amlodipine, bisoprolol, furosemide, spironolactone, echocardiogram, ejection fraction,
mitral regurgitation, electrocardiogram, atrial fibrillation, ramipril, apixaban, troponin, creatinine,
oedema, jugular venous pressure). Reproduce with `scripts/stt_term_check.py`. **One synthetic voice, English
only: an indication, not a measurement of real clinicians' speech or of Luganda.**

| Model | No vocabulary | With medical hotwords | With prompt |
|---|---|---|---|
| base | 6 / 17 | 13 / 17 | 12 / 17 |
| small | 7 / 17 | **17 / 17** | 16 / 17 |

Default is now `small` with hotwords (`backend/app/medical/vocab.py`). Beyond that, the misheard-term check
(`backend/app/medical/suggest.py`) proposes corrections for phrases that look like a medical term but are
not one; the clinician accepts or ignores each. Larger models (`medium`, `large-v3-turbo`) are slower on
CPU and were not measured here.
