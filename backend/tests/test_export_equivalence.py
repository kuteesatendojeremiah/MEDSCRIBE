"""Stage F (§12.1, FR-12): DOCX and PDF carry the same approved content; both open; special characters
survive (or degrade visibly, never silently); an unapproved note renders in neither format."""

import copy
import io
import re

import pytest
from docx import Document as DocxDocument

from app.render.hash import note_hash
from app.render.pdf_builder import printable
from tests.test_render import FINAL, all_text, final


def _preview_lines(client, auth, note):
    r = client.post("/render?mode=preview", json={"note": note}, headers=auth)
    assert r.status_code == 200
    doc = r.json()["document"]
    return [ln["text"] for s in doc["sections"] for ln in s["lines"]] + [
        ln["text"] for ln in doc["review"]
    ]


def _with_special_text():
    note = copy.deepcopy(FINAL)
    note["items"][0]["text"] = "Chest pain – radiates to left arm; café-au-lait patches, 5 µg/kg"
    return note


@pytest.mark.parametrize("fmt", ["docx", "pdf"])
def test_every_previewed_line_is_in_both_formats(client, auth, fmt):
    note = _with_special_text()
    lines = _preview_lines(client, auth, note)
    assert lines
    r = final(client, auth, note=note, fmt=fmt)
    assert r.status_code == 200
    if fmt == "docx":
        haystack = all_text(r.content)
        for text in lines:
            assert text in haystack, text
    else:
        haystack = r.content.decode("latin-1")
        for text in lines:
            # PDF string syntax escapes ( ) and \, so compare up to the first such character.
            needle = re.split("[()" + chr(92) * 2 + "]", printable(text))[0][:25]
            assert needle in haystack, needle


def test_docx_reopens_and_keeps_accented_text(client, auth):
    note = _with_special_text()
    r = final(client, auth, note=note, fmt="docx")
    d = DocxDocument(io.BytesIO(r.content))  # a corrupt file would raise here
    assert "café-au-lait" in all_text(r.content)
    assert len(d.paragraphs) > 10


def test_pdf_degrades_unsupported_characters_visibly_not_silently():
    # Known limit (docs): the built-in PDF font is Latin-1 only; Luganda letters such as Ŋ print as '?'.
    assert printable("Ŋamba") == "?amba"
    assert printable("café 5 µg") == "café 5 µg"


@pytest.mark.parametrize("fmt", ["docx", "pdf"])
def test_unapproved_note_renders_in_neither_format(client, auth, fmt):
    r = client.post(f"/render?mode=final&format={fmt}", json={"note": FINAL}, headers=auth)
    assert r.status_code == 409 and r.json()["error"] == "E_HASH_MISMATCH"
    stale = final(client, auth, note=FINAL, hash_="0" * 64, fmt=fmt)
    assert stale.status_code == 409


def test_edit_after_hash_is_refused_in_both_formats(client, auth):
    edited = copy.deepcopy(FINAL)
    edited["items"][0]["text"] += " (edited after approval)"
    for fmt in ("docx", "pdf"):
        r = final(client, auth, note=edited, hash_=note_hash(FINAL), fmt=fmt)
        assert r.status_code == 409
