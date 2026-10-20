"""Canonical JSON and version hash (Blueprint §12, FR-10, FR-11).

Canonical form: sorted keys, no whitespace, UTF-8 without ASCII escaping. The browser computes the
same bytes (`frontend/src/session/hash.ts`); `/render` refuses to render when the hashes differ.
The approval block is never part of what is hashed.
"""

import hashlib
import hmac
import json

HASHED_KEYS = ("header", "items", "review_items")


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def note_hash(note: dict) -> str:
    """Full SHA-256 (64 hex) of the canonical note, excluding any approval block."""
    body = {k: note[k] for k in HASHED_KEYS}
    return hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()


def short_hash(full: str) -> str:
    return f"{full[:4]}-{full[4:8]}"


def hashes_match(note: dict, claimed: str) -> bool:
    return hmac.compare_digest(note_hash(note).encode(), claimed.lower().encode("utf-8"))
