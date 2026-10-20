# ADR-0005: Optional local speech model (faster-whisper) so the product owner can test their own audio

- Status: accepted by the product owner's request (testing with own audio), 19 Oct 2026
- Blueprint refs: §10.5 item 6 ("a locally hosted model"), §7.1, §7.2, §13; CLAUDE.md rule 7

## Context
Until now every transcription was a mock that returned the same demonstration consultation whatever
audio was uploaded. The product owner wants to test with their own audio.

## Decision
Add `LocalWhisperProvider` (`backend/app/providers/local_whisper.py`), selected with `PROVIDER=local_whisper`.
- It is **still behind the provider gate**: it needs `PROVIDER_GATE_APPROVED=true` AND `PROVIDER_ALLOW_LIST=["local_whisper"]`. Defaults are unchanged (mock, gate closed); `scripts/start_local.ps1` sets them for the local run only.
- Audio is decoded **from memory** (no temp file) and never leaves the machine. The model weights are downloaded once from the public model hub; no audio or text is sent.
- `GET /info` (content-free) lets the UI say honestly whether transcription is **mock** or **local**; a closed gate never claims a real model.
- Whisper does **not** support Luganda and does no speaker identification. Every segment is `unknown` (never forced, §7.2); the clinician sets roles and presses **Rebuild note from transcript**.
- Note-building remains the local rule engine (no LLM is installed), so only phrases it knows become items. Substantial speech that produced no item is listed as an INFO review item (never silently dropped, never invented).
- Test audio must be **fictional or your own voice**. This is not approval for real patient audio (§11.1 is unchanged).

## Consequences
Real transcription quality is now visible (and imperfect, e.g. drug names). WER and speaker targets for this
model have NOT been measured. The privacy and safety suites still pass; the provider-gate tests cover the new name.

## Update: medical vocabulary (same day)
The first model (`base`) mis-heard complex medical words. Changes: default model `small`; a medical
vocabulary passed as hotwords (`app/medical/vocab.py`); a misheard-term check that SUGGESTS corrections
(shown in Review, accepted or ignored by the clinician, never applied automatically); a wider drug, condition,
symptom, sign and test lexicon in the note builder. Measured on one synthetic voice: 6/17 -> 17/17 hard terms
(`docs/evaluation/stt_vocabulary_check.md`). Real speakers, accents and Luganda are not measured.

## Update: spoken numbers, voice grouping and the second example
Running a real spoken example end to end exposed problems that the mock never could: speech recognition writes
numbers as words ("five hundred milligrams"); two medicines in one sentence shared a dose; a named allergy was listed
as a medicine; and every line was `unknown`. Fixes: a conservative number-word converter (internal copy only), per-medicine
dose windows (also enforced in the safety layer), allergens excluded from medicines, and a **voice grouping hint**
(`app/providers/voices.py`: pitch/spectral clustering, voices numbered by first appearance, left unlabelled when unclear).
The clinician maps voices to roles with one click and rebuilds the note; roles are never assigned automatically.
Measured only on two synthetic voices (one male, one female): similar-pitch speakers will be mixed up or left unlabelled.
A proper speaker-identification model remains a planned improvement. See `docs/examples/README.md`.
