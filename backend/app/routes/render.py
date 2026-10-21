"""POST /render (FR-10, FR-11, FR-12, FR-13, §12.1).

mode=preview  -> the document model as JSON, for the Preview screen (no approval needed).
mode=final    -> DOCX or PDF bytes, only if the submitted hash matches the submitted note.

Everything happens in request memory; the bytes are streamed back with no-store headers and nothing
is kept (§12.1 step 4, FR-13).
"""

import logging
from datetime import datetime
from typing import Literal, Optional

import jsonschema
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, ValidationError

from app.render.docx_builder import render_docx
from app.render.filename import neutral_file_name
from app.render.hash import hashes_match
from app.render.model import build_document
from app.render.pdf_builder import render_pdf
from app.schema import models
from app.schema.loader import NOTE_SCHEMA
from app.security.body import read_limited_body
from app.security.deps import current_user
from app.security.errors import ApiError
from app.security.tokens import Claims
from app.templates import DEFAULT_TEMPLATE_ID, get_template

router = APIRouter()
log = logging.getLogger("mediscribe.security")

CONTENT_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
}


class RenderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: dict
    approved_hash: Optional[str] = None
    approved_at: Optional[str] = None


def _validate(note: dict) -> None:
    try:
        jsonschema.validate({k: v for k, v in note.items() if k != "approval"}, NOTE_SCHEMA)
        models.Note.model_validate({k: v for k, v in note.items() if k != "approval"})
    except (jsonschema.ValidationError, ValidationError):
        raise ApiError(422, "E_NOTE_INVALID", "recoverable") from None


def _when(value: Optional[str]) -> datetime:
    if value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now()


@router.post("/render")
async def render(
    request: Request,
    mode: Literal["preview", "final"] = "final",
    format: Literal["docx", "pdf"] = "docx",
    template: str = DEFAULT_TEMPLATE_ID,
    claims: Claims = Depends(current_user),
):
    try:
        raw = await read_limited_body(
            request, request.app.state.settings.max_json_bytes, "E_BODY_TOO_LARGE"
        )
        body = RenderRequest.model_validate_json(bytes(raw))
    except ValidationError:
        raise ApiError(422, "E_BAD_REQUEST", "recoverable") from None
    note = body.note
    _validate(note)
    try:
        layout = get_template(template)
    except KeyError:
        raise ApiError(422, "E_BAD_REQUEST", "recoverable") from None
    settings = request.app.state.settings
    demo = settings.synthetic_only

    if mode == "preview":
        doc = build_document(
            note,
            approver=note["header"]["clinician"] or claims.name or claims.sub,
            demo=demo,
            template=layout,
        )
        return {"document": doc.as_dict()}

    # --- final export: refuse unless the approved version matches exactly (FR-11) ---------------
    if not body.approved_hash or not hashes_match(note, body.approved_hash):
        log.warning("security event: approved-hash mismatch")  # content-free (§10.1)
        raise ApiError(409, "E_HASH_MISMATCH", "terminal")
    if any(r["level"] == "HIGH" and r["status"] == "open" for r in note["review_items"]):
        log.warning("security event: export with an open HIGH item")
        raise ApiError(409, "E_HIGH_OPEN", "terminal")

    approved_at = _when(body.approved_at)
    doc = build_document(
        note,
        approver=claims.name or claims.sub,
        approved_at=approved_at,
        demo=demo,
        template=layout,
    )
    data = render_pdf(doc) if format == "pdf" else render_docx(doc)
    name = neutral_file_name(approved_at, format)
    return Response(
        content=data,
        media_type=CONTENT_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
