"""POST /transcribe (FR-04, §5.1). Request-scoped memory only; audio is never written to disk."""

from fastapi import APIRouter, Depends, Request

from app.medical.suggest import suggest
from app.providers.base import ProviderError, ProviderGateError
from app.providers.registry import get_speech_provider
from app.security.deps import current_user
from app.security.body import read_limited_body
from app.security.errors import ApiError
from app.security.tokens import Claims

router = APIRouter()


@router.post("/transcribe")
async def transcribe(request: Request, claims: Claims = Depends(current_user)):
    settings = request.app.state.settings
    audio = await read_limited_body(request, settings.max_upload_bytes)
    if not audio:
        raise ApiError(400, "E_EMPTY_AUDIO", "recoverable")
    try:
        provider = getattr(request.app.state, "speech_provider", None)
        if provider is None:  # created once: a local model is slow to load (holds no clinical data)
            provider = request.app.state.speech_provider = get_speech_provider(settings)
        segments = provider.transcribe(
            audio, expected_languages=request.headers.get("x-expected-languages")
        )
    except ProviderGateError as exc:
        raise ApiError(503, exc.code, "recoverable") from None
    except ProviderError as exc:
        raise ApiError(502, exc.code, "recoverable") from None
    finally:
        del audio  # release the audio buffer as soon as the response is built (§10.2)
    suggestions = []
    for seg in segments:
        field = "english" if seg.english_text is not None else "original"
        text = seg.english_text if seg.english_text is not None else seg.original_text
        for sug in suggest(text):
            suggestions.append(
                {
                    "id": f"g-{len(suggestions) + 1:03d}",
                    "segment_id": seg.id,
                    "field": field,
                    "heard": sug["heard"],
                    "suggest": sug["suggest"],
                    "score": sug["score"],
                }
            )
    return {"segments": [s.model_dump(mode="json") for s in segments], "suggestions": suggestions}
