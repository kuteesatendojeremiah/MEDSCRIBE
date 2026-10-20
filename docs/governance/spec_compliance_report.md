# Final spec-compliance report (Blueprint v3.0)

Prepared from the code and tests in this repository. It reports **status and evidence**, not approval and
not legal or clinical compliance. Synthetic data only; speech and extraction are deterministic mocks.

Last full run: backend + safety + privacy **207 passed**; frontend unit **104 passed**; browser end-to-end
**16 passed** (Chrome, fake microphone); `scripts/privacy_scan.sh` **0 hits**; lint clean.

Status key: **done** = implemented and tested; **done (mock)** = works with the mock provider, real provider
gated; **partial** = part implemented or not verifiable here; **not done**.

## 1. Functional requirements (§9)

| ID | Requirement | Pri. | Status | Evidence |
|---|---|---|---|---|
| FR-01 | Facility SSO before any session | P0 | **partial** – dev stub with signed short-lived tokens; no real OIDC/SAML | `backend/tests/test_auth.py`, ADR-0003, `e2e/kato_walkthrough.spec.ts` (Start waits for sign-in) |
| FR-02 | Temporary session, no profile, consent recorded | P0 | done | `components.test.tsx` (Start disabled until consent), `reducer.test.ts`, e2e walk-through |
| FR-03 | Capture or upload audio with visible controls | P0 | done (fake mic in tests; real microphones and browsers not field-tested) | `frontend/src/audio/*`, `e2e/rules.spec.ts` (upload, fake mic), `phase2to5.test.ts` |
| FR-04 | Detect language, transcribe, translate, keep originals | P0 | done (mock) | `backend/tests/test_transcribe.py`, `e2e/kato_walkthrough.spec.ts` (original beside English) |
| FR-05 | Six speaker roles, reassignment | P0 | done (mock); accuracy measured on the mock harness only | `backend/tests/test_eval_harness.py`, `e2e/rules.spec.ts` (role chip) |
| FR-06 | Extract facts with source, speaker, polarity, time, certainty; validate schema | P0 | done (mock rules) | `tests/safety/*`, `backend/tests/test_extract_route.py`, `backend/app/extract/mapping.py` |
| FR-07 | Manual clinician entry in every section | P0 | done | `phase2to5.test.ts` (all 8 sections), `e2e/kato_walkthrough.spec.ts` (oedema typed) |
| FR-08 | One note, all §4 sections, review items | P0 | done | `tests/safety/test_sources_review_kato.py` (Kato vs §18) |
| FR-09 | Preview locked until all HIGH items are opened | P0 | done | `reducer.test.ts`, `components.test.tsx`, `e2e/rules.spec.ts` |
| FR-10 | Render preview; approve exact version; any edit resets approval | P0 | done (SHA-256) | `phase2to5.test.ts`, `reducer.test.ts`, `e2e/rules.spec.ts` (approve -> edit -> re-approve) |
| FR-11 | Render only when the approved hash matches | P0 | done | `backend/tests/test_render.py`, `test_hardening.py`; cross-language hash constant in both suites |
| FR-12 | Export has approver, time, consent, languages, AI declaration, unverified items | P0 | done (DOCX and PDF; PDF is built with ReportLab, ADR-0007) | `backend/tests/test_render.py` (content vs reference note) |
| FR-13 | Neutral file name; no server copy | P0 | done | `test_render.py`, `phase2to5.test.ts` (blob URL revoked), `tests/privacy` |
| FR-14 | Warn that closing/refreshing loses an unexported draft | P0 | done | `components.test.tsx`, `e2e/rules.spec.ts` |
| FR-15 | Recoverable errors keep the draft; terminal errors clear it | P0 | done | `reducer.test.ts`, `phase2to5.test.ts`, `e2e/rules.spec.ts` (provider timeout -> retry/manual) |
| FR-16 | Timeout per §6.2 with warning | P0 | done (timing verified with fake clocks) | `misc.test.ts`, `components.test.tsx` |
| FR-17 | No clinical content in logs, telemetry, caches, browser storage | P0 | done on this host | `tests/privacy`, `e2e/privacy.spec.ts`, `storage_ban.test.ts`, `test_logging.py` |
| FR-18 | Current-session transcript search | P1 | done | `screens/review.test.tsx`, `e2e/rules.spec.ts` |
| FR-19 | Additional specialty templates | P2 | not done (out of MVP; `docs/backlog.md`) | – |

## 2. Clinical safety tests (§15.1) – mock extractor

| Test | Target | Result | Evidence |
|---|---|---|---|
| Negation preserved | 0 errors | pass | `tests/safety/test_negation_and_questions.py`; double negatives: `test_audit_adversarial.py` |
| Question not converted into diagnosis | 0 errors | pass | same file; provider-attack tests |
| Doctor question not converted into patient fact | 0 errors | pass | same file |
| Planned examination not shown as done | 0 errors | pass | `test_exam_meds_relative.py`, `test_cases.py` (case 06) |
| Missing medication detail invented | 0 errors | pass; audit found and fixed "twice daily" read as "once daily" | `test_exam_meds_relative.py`, `test_cases.py` (case 05, 07), `test_audit_adversarial.py` |
| Relative's report labelled as patient's | 0 errors after review prompts | pass | `test_exam_meds_relative.py`, case 03 |
| Body system assigned only from specialty | 0 errors | pass | `test_exam_meds_relative.py` |
| Every note item has a source tag | 100% | pass | `test_sources_review_kato.py`, every case |
| Speaker role accuracy, clear audio | >= 95% | harness works; English and Luganda sets meet it; the mixed set deliberately misses it (0.80) to prove the harness can fail. **Not a real-provider result** | `tests/safety/test_speaker_and_wer_targets.py` |
| Word error rate | baseline | baseline recorded (mock): 0.048 / 0.059 / 0.033. Real targets not set | `docs/evaluation/report.md` §2 |

These pass because the extractor is a rule-based double with a deterministic safety layer behind it
(`backend/app/extract/mapping.py`, `review_engine.py`) that also constrains a real model's output. They do
**not** show that a real model is safe. The suite must be re-run against any real extraction provider.

## 3. Statelessness and privacy tests (§15.2)

| Test | Result | Evidence |
|---|---|---|
| Marker absent from server disk, temp, logs, telemetry-like output, process state | pass (0 hits; crash reports and backups: no such artefacts exist in this build and could not be tested on a real host) | `tests/privacy/test_markers.py`, `scripts/privacy_scan.sh` |
| Browser: no marker in localStorage, IndexedDB, caches, service workers, back-forward cache, download names | pass | `frontend/e2e/privacy.spec.ts`, `storage_ban.test.ts` |
| Server restart loses nothing | pass | `test_markers.py::test_server_restart_loses_nothing...` |
| Export responses `no-store`, not cached by proxies | pass at application level; proxy behaviour not tested | `test_no_store_headers.py`, `test_web.py`, `test_render.py` |
| Provider configuration matches claimed retention | n/a until a real provider exists; gate enforced | `test_provider_gate.py`, `provider_gate_checklist.md` |

## 4. Load and reliability (§15.3)

20 concurrent clinicians each sending 13.7 MB (30-minute-equivalent) audio, extract, render, revoke:
20/20 succeeded; server memory peak ~282 MB then ~105 MB after; no swap activity observed. **Development host
only** (Windows, 16 GB RAM). Not measured: the real target network and download success rate; a Linux host
with swap disabled. See `docs/evaluation/load_test.md`.

## 5. Definition of done (§15.4)

| # | Item | Status |
|---|---|---|
| 1 | Fictional mixed-language consultation recorded, transcribed, translated | done (mock providers) |
| 2 | Speaker roles correct or Unknown, and editable | done (mock) |
| 3 | One note, all §4 sections, source tags | done |
| 4 | All §15.1 targets met | met for the mock extractor; real-provider WER/speaker targets not set |
| 5 | Preview, hash approval, export; unverified items visible | done (DOCX); PDF unverified here |
| 6 | All §15.2 tests find 0 markers | done on this host |
| 7 | Test report with quality, safety errors, review time, export reliability, cleanup | `docs/evaluation/report.md`; **review time not measured** |

## 6. Deviations from the blueprint (all recorded as ADRs)

| ADR | Deviation or interpretation |
|---|---|
| 0001 | Optional clinician-typed `patient_label` in the header (the reference note shows patient name/age/sex; Appendix A does not) |
| 0002 | "Opened" vs "resolved": Preview needs HIGH items opened; approval also needs each resolved or unverified (§12.1); explicit extra events; heartbeat semantics |
| 0003 | Dev sign-in stub; token revocation via an id-only deny-list |
| 0004 | Chunked upload after Stop instead of live streaming |

## 7. Things the code does that the blueprint does not ask for

Dev login endpoint and token refresh (needed to stand in for SSO); `ACKNOWLEDGE_ITEM`, `REOPEN_FOR_EDIT`,
`SET_FORMAT` events; the evaluation-mode metrics panel (opt-in); the plausibility checks on dose units and
sizes (they only flag); the family-history rule; `app.web` single-container server. None store clinical content.
