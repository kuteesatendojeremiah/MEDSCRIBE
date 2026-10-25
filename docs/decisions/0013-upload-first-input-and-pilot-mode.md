# ADR-0013: Upload-first input and pilot mode (real local transcription)

- Status: accepted by the product owner (asked for the system to process the doctor's real voice, upload as the main input, and no "demo" wording)
- Blueprint refs: FR-03 (capture/upload audio), §10.5 (provider gate; a locally hosted model is the fallback), §1.1 and §11.1 (synthetic data until approvals); CLAUDE.md rules 6 and 7; ADR-0005, ADR-0011, ADR-0012

## Problem
The hosted app ran `PROVIDER=mock`, which ignores the audio and returns the sample consultation, so a recorded voice was never
processed. The Record screen also made the live microphone the main path and offered upload only as a small link, for audio only.

## Decision
1. **Upload is the main input.** Record opens on a drop zone that takes video or audio (mp4, mov, webm, m4a, wav, mp3). "Record now"
   is a secondary button; the microphone starts only when it is pressed. The server limit is 200 MB (`MAX_UPLOAD_BYTES`); the file is
   decoded in server memory by the speech model (video containers are read for their audio track). Client-side audio extraction to
   shrink large videos is left in the backlog.
2. **Real local transcription in the hosted build.** The Docker image installs faster-whisper and bakes the model in at build time
   (no run-time download, audio never sent to a third party). `render.yaml` opens the gate for `local_whisper` only
   (`PROVIDER_GATE_APPROVED=true`, `PROVIDER_ALLOW_LIST=["local_whisper"]`). Code defaults stay mock and closed (rule 7).
3. **The mock can no longer pass as real.** `/ready` reports not ready when the mock would be served and `ENVIRONMENT` is not
   `dev` or `demo`. `/info` returns `mode`: `pilot` only when a real model is in use, otherwise `demo`.
4. **Pilot wording.** With a real model the header says "Pilot · test data only" and exports carry "PILOT – SYNTHETIC OR TEST DATA ONLY"
   instead of "DEMONSTRATION – FICTIONAL PATIENT". The mock keeps the Demo wording.
5. **Sign-in unchanged.** Guest sessions (ADR-0011) stay for now, so `SYNTHETIC_ONLY=true` stays.

## What this does NOT allow
Real patient data. Rules 6 and 7 stand. Before real patients: real doctor accounts (FR-01), the provider gate checklist
(`docs/governance/provider_gate_checklist.md`) with DPO sign-off, and a host with control over swap, core dumps and proxy logging
(§10.3; Render does not give it).

## Known limits
- Whisper does not support Luganda; Luganda and mixed speech will be wrong or partly garbled. No speaker identification: every
  segment is `unknown` until the clinician assigns roles (§7.2).
- Extraction is still the deterministic rule engine; on free speech it will miss facts, which become review items (rule 5).
- CPU transcription is slow for long recordings (timeouts raised: 600 s server and client). The Docker build and the Render
  memory sizing were not run in this session.
