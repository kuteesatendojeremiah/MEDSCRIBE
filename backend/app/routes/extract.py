"""POST /extract (FR-06, FR-08, §5.1): corrected transcript in, schema-validated note out.

Request-scoped memory only. Invalid provider output is rejected as a recoverable error and no
partial result is ever returned (§12.2).
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, ValidationError

from app.extract.mapping import ExtractInvalid, build_note
from app.extract.provider import get_extract_provider
from app.providers.base import ProviderError, ProviderGateError, Segment
from app.schema.models import Header
from app.security.body import read_limited_body
from app.security.deps import current_user
from app.security.errors import ApiError
from app.security.tokens import Claims

router = APIRouter()


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    segments: list[Segment]
    header: Header


@router.post("/extract")
async def extract(request: Request, claims: Claims = Depends(current_user)):
    try:
        raw = await read_limited_body(
            request, request.app.state.settings.max_json_bytes, "E_BODY_TOO_LARGE"
        )
        body = ExtractRequest.model_validate_json(bytes(raw))
    except ValidationError:
        raise ApiError(422, "E_BAD_REQUEST", "recoverable") from None
    settings = request.app.state.settings
    header = body.header.model_dump(mode="json", exclude_none=True)
    try:
        provider = getattr(request.app.state, "extract_provider", None) or get_extract_provider(
            settings
        )
        raw = provider.extract(body.segments, header.get("present", []))
        note, _report = build_note(raw, body.segments, header)
    except ProviderGateError as exc:
        raise ApiError(503, exc.code, "recoverable") from None
    except ProviderError as exc:
        raise ApiError(502, exc.code, "recoverable") from None
    except ExtractInvalid:
        raise ApiError(502, ExtractInvalid.code, "recoverable") from None
    return {"note": note}
