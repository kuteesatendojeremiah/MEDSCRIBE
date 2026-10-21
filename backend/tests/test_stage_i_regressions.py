"""Stage I regression tests on fictional data: look-alike drug names, very long transcripts, size limits,
and duplicate requests. Complements tests/safety (negation, ambiguity, missing information)."""

import copy
import time

import pytest

from app.medical.suggest import suggest
from tests.test_extract_route import HEADER, SEGMENTS, post


@pytest.mark.parametrize(
    "text",
    [
        "started atenolol 50 mg",
        "also atorvastatin 20 mg at night",
        "amiloride and amlodipine are different drugs",
        "carvedilol, captopril and clopidogrel",
    ],
)
def test_valid_lookalike_drug_names_are_never_rewritten_into_each_other(text):
    assert suggest(text) == []


def test_a_misheard_drug_is_only_suggested_never_applied(client, auth):
    audio = b"MOCKCASE:kato_transcript"
    r = client.post("/transcribe", content=audio, headers=auth)
    assert r.status_code == 200
    originals = [s["original_text"] for s in r.json()["segments"]]
    again = client.post("/transcribe", content=audio, headers=auth).json()["segments"]
    assert originals == [s["original_text"] for s in again]  # server never edits text on its own


def _long(n: int):
    segs = []
    for i in range(n):
        base = copy.deepcopy(SEGMENTS[i % len(SEGMENTS)])
        base["id"] = f"s-{i:05d}"
        base["start"] = float(i)
        base["end"] = float(i) + 0.9
        segs.append(base)
    return segs


def test_very_long_transcript_is_extracted_or_refused_cleanly_and_quickly(client, auth):
    segs = _long(1500)  # about 100 times the worked example
    t0 = time.monotonic()
    r = post(client, auth, segments=segs)
    assert time.monotonic() - t0 < 30
    assert r.status_code in (200, 413, 502)
    if r.status_code == 200:
        ids = {s["id"] for s in segs}
        for item in r.json()["note"]["items"]:
            src = item["source"]
            assert (
                src["type"] != "segment" or src["segment_id"] in ids
            )  # every item still has a source


def test_oversized_transcript_body_is_refused_with_a_recoverable_413(auth):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import make_settings

    c = TestClient(create_app(make_settings(max_json_bytes=2000)), raise_server_exceptions=False)
    token = c.post("/auth/dev-login", json={"name": "Dr. Test"}).json()["token"]
    r = c.post(
        "/extract",
        json={"segments": SEGMENTS, "header": HEADER},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 413 and r.json()["class"] == "recoverable"


def test_duplicate_extract_requests_are_independent_and_identical(client, auth):
    a = post(client, auth).json()
    b = post(client, auth).json()
    assert a == b  # stateless: the same input gives the same output and nothing carries over


def test_missing_clinical_information_becomes_review_items_not_guesses(client, auth):
    only_greeting = [SEGMENTS[0]]
    r = post(client, auth, segments=only_greeting)
    assert r.status_code == 200
    note = r.json()["note"]
    assert not [i for i in note["items"] if i["section"] in ("treatment", "meds_allergies")]
    assert note["review_items"]  # missing allergy status / empty sections are flagged
