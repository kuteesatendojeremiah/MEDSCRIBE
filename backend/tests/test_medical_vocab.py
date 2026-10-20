"""Medical vocabulary: hotwords for the speech model, misheard-term suggestions, wider note lexicon."""

from fastapi.testclient import TestClient

from app.extract.rules import MockExtractor
from app.main import create_app
from app.medical.suggest import suggest
from app.medical.vocab import ALL_TERMS, HOTWORDS
from app.providers.base import Segment
from app.providers.local_whisper import LocalWhisperProvider
from tests.conftest import make_settings


def pairs(text):
    return {s["heard"].lower(): s["suggest"] for s in suggest(text)}


def test_misheard_drug_and_condition_names_get_suggestions():
    got = pairs(
        "He takes bysoprylol and fiosemid. Start ramipral. Check tropinin. Atrial fibrelation."
    )
    assert got["bysoprylol"] == "bisoprolol"
    assert got["fiosemid"] == "furosemide"
    assert got["ramipral"] == "ramipril"
    assert got["tropinin"] == "troponin"
    assert got["atrial fibrelation"] == "atrial fibrillation"


def test_multiword_terms_are_suggested_as_a_phrase():
    got = pairs("paroxysmal nocturnal dysnear and raised jocular venus pressure")
    assert got["paroxysmal nocturnal dysnear"] == "paroxysmal nocturnal dyspnoea"
    assert got["jocular venus pressure"] == "jugular venous pressure"


def test_correct_terms_and_ordinary_english_get_no_suggestion():
    text = (
        "He takes amlodipine and aspirin daily. The weather was lovely on the way here. "
        "Atrial fibrillation with oedema. Blood pressure is high and the patient is tired."
    )
    assert suggest(text) == []


def test_neighbouring_words_are_not_swallowed_into_a_suggestion():
    (s,) = suggest("He takes some lodipine daily")
    assert s["heard"] == "lodipine" and s["suggest"] == "amlodipine"


def test_vocabulary_has_the_core_cardiology_terms_and_hotwords_fit_the_prompt_budget():
    for t in (
        "amlodipine",
        "apixaban",
        "echocardiogram",
        "paroxysmal nocturnal dyspnoea",
        "jugular venous pressure",
    ):
        assert t in ALL_TERMS
    assert len(ALL_TERMS) > 150
    assert len(HOTWORDS.split()) < 120  # Whisper reads only about 220 tokens of context


def test_speech_model_is_given_the_medical_hotwords():
    seen = {}

    class M:
        def transcribe(self, audio, **kw):
            seen.update(kw)
            return iter([]), type("I", (), {"language": "en"})()

    LocalWhisperProvider(model=M()).transcribe(b"x")
    assert "amlodipine" in seen["hotwords"] and seen["task" if "task" in seen else "hotwords"]


def test_transcribe_returns_suggestions_for_the_field_the_clinician_sees():
    app = create_app(make_settings())

    class P:
        name = "x"

        def transcribe(self, audio, *, expected_languages=None):
            return [
                Segment(
                    id="s-001",
                    start=0,
                    end=3,
                    lang="en",
                    original_text="He takes bysoprylol.",
                    english_text=None,
                    speaker_role="unknown",
                    confidence=0.8,
                ),
                Segment(
                    id="s-002",
                    start=3,
                    end=6,
                    lang="sw",
                    original_text="Anakunywa fiosemid",
                    english_text="He takes fiosemid.",
                    speaker_role="unknown",
                    confidence=0.8,
                ),
            ]

    app.state.speech_provider = P()
    c = TestClient(app)
    tok = c.post("/auth/dev-login", json={"name": "d"}).json()["token"]
    body = c.post("/transcribe", content=b"x", headers={"Authorization": f"Bearer {tok}"}).json()
    sug = {s["segment_id"]: s for s in body["suggestions"]}
    assert sug["s-001"]["field"] == "original" and sug["s-001"]["suggest"] == "bisoprolol"
    assert sug["s-002"]["field"] == "english" and sug["s-002"]["suggest"] == "furosemide"
    assert [s["id"] for s in body["suggestions"]] == ["g-001", "g-002"]


def test_demo_transcript_has_no_false_suggestions(client, auth):
    assert client.post("/transcribe", content=b"x", headers=auth).json()["suggestions"] == []


def seg(role, text, n=1):
    return Segment(
        id=f"s-{n:03d}",
        start=n * 5,
        end=n * 5 + 4,
        lang="en",
        original_text=text,
        english_text=None,
        speaker_role=role,
        confidence=0.9,
    )


def texts(items, section):
    return [i["text"] for i in items if i["section"] == section]


def test_wider_drug_names_are_recognised_and_never_given_a_dose():
    raw = MockExtractor().extract([seg("patient", "I take ramipril and apixaban.")], [])["items"]
    meds = texts(raw, "meds_allergies")
    assert any(t.startswith("Ramipril") and "not stated" in t for t in meds)
    assert any(t.startswith("Apixaban") and "mg" not in t for t in meds)


def test_new_symptoms_and_exam_findings_are_recognised():
    raw = MockExtractor().extract(
        [
            seg("patient", "I have orthopnoea and paroxysmal nocturnal dyspnoea.", 1),
            seg("doctor", "There is a raised jugular venous pressure and a systolic murmur.", 2),
        ],
        [],
    )["items"]
    hist = texts(raw, "history")
    assert any("Orthopnoea" in t for t in hist) and any(
        "Paroxysmal nocturnal dyspnoea" in t for t in hist
    )
    assert texts(raw, "exam"), "exam finding with jugular/murmur should be recorded"


def test_american_spellings_are_not_flagged_as_misheard():
    assert (
        suggest("There is bilateral pitting edema and dyspnea. He has anemia and hemoptysis.") == []
    )
