"""Local speech-to-text with faster-whisper (Blueprint §10.5 item 6: "a locally hosted model").

Runs entirely on this machine: the audio is decoded from memory (no temp file) and never leaves the
host. The model weights are downloaded once from the public model hub on first use; no audio or text is
sent anywhere. Still behind the provider gate: PROVIDER=local_whisper, PROVIDER_GATE_APPROVED=true and
PROVIDER_ALLOW_LIST=["local_whisper"] are all required (see providers/real.py).

Limits, stated plainly: Whisper does not support Luganda, so Luganda and mixed speech will be wrong or
partly garbled. It does no speaker identification: every segment is labelled `unknown` (never forced,
§7.2) and the clinician assigns roles during review.
"""

import io
import math
from typing import Optional

from app.medical.vocab import HOTWORDS
from app.providers.base import ProviderError, Segment

LANGUAGE_HINTS = {"english": "en", "swahili": "sw"}  # others: let the model detect the language


def hint_for(expected_languages: Optional[str]) -> Optional[str]:
    """Only a single unambiguous language is passed as a hint; mixed or unsupported means detect."""
    if not expected_languages:
        return None
    low = expected_languages.lower()
    if "+" in low or "mixed" in low or "luganda" in low or "other" in low:
        return None
    return LANGUAGE_HINTS.get(low.strip())


def confidence(avg_logprob: float) -> float:
    return round(max(0.0, min(1.0, math.exp(avg_logprob))), 3)


class LocalWhisperProvider:
    name = "local_whisper"

    def __init__(self, model_size: str = "small", model=None):
        self._size = model_size
        self._model = model  # injectable for tests; loaded lazily otherwise

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # imported lazily: heavy, optional dependency

            self._model = WhisperModel(self._size, device="cpu", compute_type="int8")
        return self._model

    @staticmethod
    def _voices(audio: bytes, heard: list) -> list:
        """Voice grouping is a best-effort hint; any failure just means no hint."""
        try:
            from faster_whisper.audio import decode_audio

            from app.providers.voices import assign_voices

            samples = decode_audio(io.BytesIO(bytes(audio)), sampling_rate=16000)
            return assign_voices(samples, [(float(s.start), float(s.end)) for s in heard])
        except Exception:
            return [None] * len(heard)

    def transcribe(
        self, audio: bytes, *, expected_languages: Optional[str] = None
    ) -> list[Segment]:
        try:
            model = self._load()
            language = hint_for(expected_languages)
            seg_iter, info = model.transcribe(
                io.BytesIO(bytes(audio)),
                language=language,
                vad_filter=True,
                beam_size=1,
                hotwords=HOTWORDS,  # biases recognition toward medical terms
            )
            heard = [s for s in seg_iter if s.text.strip()]
            detected = getattr(info, "language", None) or language or "und"
            translations: list = []
            if detected != "en":
                t_iter, _ = model.transcribe(
                    io.BytesIO(bytes(audio)),
                    language=detected if detected != "und" else None,
                    task="translate",
                    vad_filter=True,
                    beam_size=1,
                    hotwords=HOTWORDS,
                )
                translations = [s for s in t_iter if s.text.strip()]
        except ProviderError:
            raise
        except Exception as exc:  # undecodable audio, model load failure: content-free code only
            raise ProviderError("E_STT_FAILED") from exc

        voices = self._voices(audio, heard)
        out: list[Segment] = []
        for i, s in enumerate(heard, 1):
            english = None
            if translations:
                best = max(
                    translations,
                    key=lambda t: max(0.0, min(s.end, t.end) - max(s.start, t.start)),
                )
                english = best.text.strip()
            out.append(
                Segment(
                    id=f"s-{i:03d}",
                    start=round(float(s.start), 2),
                    end=round(float(s.end), 2),
                    lang=detected,
                    original_text=s.text.strip(),
                    english_text=english,
                    speaker_role="unknown",
                    confidence=confidence(float(s.avg_logprob)),
                    voice=voices[i - 1],
                )
            )
        return out
