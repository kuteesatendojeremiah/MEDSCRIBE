"""Local speech provider (Blueprint §10.5 item 6): gated, in-memory, roles never forced."""

import io
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.base import ProviderError, ProviderGateError
from app.providers.local_whisper import LocalWhisperProvider, confidence, hint_for
from app.providers.registry import get_speech_provider
from tests.conftest import make_settings


class FakeModel:
    """Stands in for faster_whisper.WhisperModel; records what it was given."""

    def __init__(self, lang="en"):
        self.calls = []
        self.lang = lang

    def transcribe(self, audio, **kw):
        assert isinstance(audio, io.BytesIO), "audio must be decoded from memory, not a temp file"
        self.calls.append(kw)
        text = (
            "I have chest pain for three days." if kw.get("task") != "translate" else "Translated."
        )
        seg = SimpleNamespace(start=0.0, end=3.2, text=f" {text} ", avg_logprob=-0.2)
        return iter(
            [seg, SimpleNamespace(start=3.5, end=4.0, text="  ", avg_logprob=-1.0)]
        ), SimpleNamespace(language=self.lang)


def test_segments_have_unknown_roles_and_confidence_from_the_model():
    p = LocalWhisperProvider(model=FakeModel())
    (seg,) = p.transcribe(b"audio-bytes")  # the blank segment is dropped
    assert seg.speaker_role.value == "unknown"  # no diarization: never forced (§7.2)
    assert seg.original_text == "I have chest pain for three days."
    assert seg.english_text is None  # already English
    assert seg.confidence == confidence(-0.2) and 0 < seg.confidence < 1


def test_non_english_speech_gets_an_english_translation_pass():
    m = FakeModel(lang="sw")
    (seg,) = LocalWhisperProvider(model=m).transcribe(b"x")
    assert seg.lang == "sw" and seg.english_text == "Translated."
    assert [c.get("task") for c in m.calls] == [None, "translate"]


def test_language_hint_only_for_a_single_unambiguous_language():
    assert hint_for("English") == "en"
    assert hint_for("English + Luganda (mixed)") is None
    assert hint_for("Luganda") is None
    assert hint_for(None) is None


def test_decoder_failure_is_a_content_free_provider_error():
    class Boom:
        def transcribe(self, *a, **k):
            raise RuntimeError("secret detail SYNTHETIC-MARKER-7Q4Z")

    with pytest.raises(ProviderError) as e:
        LocalWhisperProvider(model=Boom()).transcribe(b"x")
    assert e.value.code == "E_STT_FAILED" and "MARKER" not in str(e.value)


def test_local_provider_still_needs_the_gate_and_the_allow_list():
    with pytest.raises(ProviderGateError):
        get_speech_provider(make_settings(provider="local_whisper"))
    with pytest.raises(ProviderGateError):
        get_speech_provider(make_settings(provider="local_whisper", provider_gate_approved=True))
    ok = get_speech_provider(
        make_settings(
            provider="local_whisper",
            provider_gate_approved=True,
            provider_allow_list=["local_whisper"],
        )
    )
    assert isinstance(ok, LocalWhisperProvider)


def test_info_endpoint_is_honest_about_mock_vs_local():
    mock = TestClient(create_app(make_settings()))
    assert mock.get("/info").json() == {
        "speech": "mock",
        "speech_model": None,
        "synthetic_only": True,
        "mode": "demo",
    }
    s = make_settings(
        provider="local_whisper", provider_gate_approved=True, provider_allow_list=["local_whisper"]
    )
    info = TestClient(create_app(s)).get("/info").json()
    assert info["speech"] == "local" and info["speech_model"] == "small"
    closed = TestClient(create_app(make_settings(provider="local_whisper"))).get("/info").json()
    assert closed["speech"] == "mock"  # a closed gate never claims a real model


def test_endpoint_transcribes_through_an_injected_local_model():
    app = create_app(
        make_settings(
            provider="local_whisper",
            provider_gate_approved=True,
            provider_allow_list=["local_whisper"],
        )
    )
    app.state.speech_provider = LocalWhisperProvider(model=FakeModel())
    c = TestClient(app, raise_server_exceptions=False)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    segs = c.post("/transcribe", content=b"RIFFxxxx", headers=h).json()["segments"]
    assert segs[0]["original_text"].startswith("I have chest pain")
    note = c.post(
        "/extract",
        json={
            "segments": segs,
            "header": {
                "clinic": "c",
                "datetime": "2026-10-19T10:00:00+03:00",
                "clinician": "d",
                "temp_ref": "t",
                "languages": ["English"],
                "present": ["Patient"],
                "consent_statement": "ok",
            },
        },
        headers=h,
    ).json()["note"]
    # roles are unknown, so the clinical statement is attributed to an unknown speaker and flagged HIGH
    assert any(
        "unknown speaker" in r["reason"].lower()
        for r in note["review_items"]
        if r["level"] == "HIGH"
    )


def test_speech_that_produced_nothing_is_reported_not_silently_dropped():
    from tests.conftest import make_settings as _  # noqa: F401
    from app.extract.review_engine import unmapped_reviews
    from app.providers.base import Segment

    seg = Segment(
        id="s-001",
        start=5,
        end=9,
        lang="en",
        original_text="The weather was lovely on the way here.",
        english_text=None,
        speaker_role="patient",
        confidence=0.9,
    )
    (r,) = unmapped_reviews([], [seg])
    assert (
        r["level"] == "INFO" and "not placed in the note" in r["reason"] and "00:05" in r["reason"]
    )
    short = Segment(
        id="s-002",
        start=9,
        end=10,
        lang="en",
        original_text="Okay thanks.",
        english_text=None,
        speaker_role="patient",
        confidence=0.9,
    )
    assert unmapped_reviews([], [short]) == []
