# Mediscribe – Build Plan

Source of truth: `docs/blueprint/mediscribe_blueprint_v3.md` (Blueprint v3.0). Rules: `CLAUDE.md`.
Status: **plan only – no code written yet.** Awaiting Phase 0 approval.

## a) Product summary (10 lines)

1. Mediscribe turns one doctor–patient consultation into one structured, traceable cardiology note (§1).
2. A signed-in clinician starts a temporary session with no patient profile and confirms patient consent (§3, FR-01/02).
3. The doctor records or uploads synthetic audio in English, Luganda or mixed speech (FR-03).
4. The audio is transcribed, language-detected and translated to English; originals are kept beside the translation (§7.1).
5. Each segment is labelled by role (Doctor, Patient, Relative, Other clinician, Interpreter, Unknown); Unknown is never forced (§7.2).
6. Facts are extracted with source, polarity, certainty and time, validated against Appendix A, and mapped to the §4.1 sections (§7.3).
7. Anything uncertain becomes a HIGH / CHECK / INFO review item; the doctor must open every HIGH item before preview unlocks (§4.4, FR-09).
8. The doctor reviews side by side, types findings that were never spoken, previews, then approves one exact version, frozen by SHA-256 hash; any edit resets approval (FR-10).
9. `/render` produces a DOCX/PDF only if the hash matches; unverified items print red; header/footer carry consent, AI declaration, approver and short hash (§4.3, FR-11/12).
10. The session lives only in browser memory; the server is stateless and logs nothing clinical; End, timeout or terminal error wipes everything (§5, §6, §10).

## b) Requirements traceability

Test locations: BE = `backend/tests/`, FE = `frontend/src/**/*.test.ts(x)`, E2E = `frontend/e2e/`, SAF = `tests/safety/`, PRIV = `tests/privacy/`.

### Functional requirements (§9)

| ID | Requirement (short) | Planned module | Planned test file | Phase |
|---|---|---|---|---|
| FR-01 | Facility SSO before any session | `backend/app/security/auth.py` (OIDC-ready stub), `frontend/src/session/auth.ts` | `BE test_auth.py`, `E2E signin.spec.ts` | 2 |
| FR-02 | Temp session, no profile, consent recorded | `frontend/src/screens/NewSession.tsx`, `session/reducer.ts` | `FE NewSession.test.tsx`, `E2E kato_walkthrough.spec.ts` | 1 |
| FR-03 | Capture/upload audio, visible controls | `frontend/src/audio/recorder.ts`, `screens/Record.tsx` | `FE recorder.test.ts`, `E2E record.spec.ts` | 2 |
| FR-04 | Language detect, transcribe, translate, keep originals | `backend/app/routes/transcribe.py`, `providers/base.py`, `providers/mock.py` | `BE test_transcribe.py`, `BE test_mock_provider.py` | 2 |
| FR-05 | Six speaker roles, reassignment | `schema` roles enum, `components/RoleChip.tsx` | `FE RoleChip.test.tsx`, `BE test_roles.py` | 2 |
| FR-06 | Extract facts w/ source, speaker, polarity, time, certainty; schema-validate | `backend/app/routes/extract.py`, `app/extract/validate.py` | `BE test_extract_validation.py` | 3 |
| FR-07 | Manual clinician entry in every section | `frontend/src/components/ManualEntry.tsx`, `session/noteActions.ts` | `FE manualEntry.test.tsx`, `E2E manual_entry.spec.ts` | 3/4 |
| FR-08 | One note, all §4 sections + review items | `backend/app/extract/mapping.py`, `extract/review_engine.py` | `BE test_mapping.py`, `SAF test_kato_case.py` | 3 |
| FR-09 | Preview locked until all HIGH opened | `session/selectors.ts` (`canPreview`) | `FE canPreview.test.ts`, `E2E preview_lock.spec.ts` | 1/4 |
| FR-10 | Preview, approve exact version, edit resets approval | `session/approval.ts` (canonical JSON + SHA-256) | `FE approval.test.ts`, `E2E approve_edit_reapprove.spec.ts` | 4 |
| FR-11 | Render only when approved hash matches | `backend/app/routes/render.py`, `render/hash.py` | `BE test_render_hash.py` | 5 |
| FR-12 | Export has approver, time, consent, languages, AI declaration, unverified | `backend/app/render/docx_builder.py` | `BE test_docx_content.py` | 5 |
| FR-13 | Neutral file name; no server copy | `frontend/src/download/download.ts` | `FE download.test.ts`, `PRIV test_no_server_copy.py` | 5 |
| FR-14 | Warn on close/refresh with unexported draft | `frontend/src/session/useUnloadGuard.ts` | `FE unloadGuard.test.ts`, `E2E unload.spec.ts` | 1 |
| FR-15 | Recoverable keeps draft, terminal clears | `session/reducer.ts`, `session/errors.ts` | `FE reducer.test.ts` | 1 (extended 2–5) |
| FR-16 | Timeout 15 min, warn 13 min, 2 h cap | `session/timers.ts` (injectable clock) | `FE timers.test.ts` | 1 |
| FR-17 | No clinical content in logs/telemetry/caches/browser storage | `backend/app/logging_filter.py`, `middleware.py`, ESLint storage ban | `BE test_logging.py`, `FE storage_ban.test.ts`, `PRIV test_markers.py` | 0 (enforced throughout) |
| FR-18 | Current-session transcript search (P1) | `components/TranscriptSearch.tsx` | `FE transcriptSearch.test.tsx` | 4 (P1, after P0 items) |
| FR-19 | Extra specialty templates (P2) | — | — | Out of MVP; `docs/backlog.md` |

### Clinical safety tests (§15.1)

| Test | Target | Planned module | Planned test file |
|---|---|---|---|
| Negation preserved | 0 errors | `extract/mock_rules.py`, `mapping.py` | `SAF test_negation.py` |
| Question not converted into diagnosis | 0 errors | `extract/mock_rules.py` | `SAF test_question_not_diagnosis.py` |
| Doctor question not a patient fact | 0 errors | `extract/mock_rules.py` | `SAF test_doctor_question_not_fact.py` |
| Planned exam not shown as done | 0 errors | `extract/mock_rules.py` | `SAF test_planned_exam.py` |
| Missing medication detail invented | 0 errors | `extract/mapping.py`, `review_engine.py` | `SAF test_no_invented_med_details.py` |
| Relative's report labelled as patient's | 0 errors | `extract/mapping.py` | `SAF test_relative_attribution.py` |
| Body system only from specialty | 0 errors | `extract/mapping.py` | `SAF test_body_system.py` |
| Every item has a source tag | 100% | `app/schema` (required `source`), `validate.py` | `SAF test_source_tags.py` |
| Speaker role accuracy ≥ 95% (clear audio) | ≥ 95% | `evaluation/speaker_accuracy.py` | `BE test_speaker_accuracy.py` |
| WER English/Luganda/mixed | Baseline Ph.2 | `evaluation/wer.py` | `BE test_wer_harness.py` |

### Privacy and statelessness tests (§15.2)

| Test | Planned module | Planned test file |
|---|---|---|
| Marker `SYNTHETIC-MARKER-7Q4Z` absent from server disk, temp, logs, telemetry, crash reports | `scripts/privacy_scan.sh` | `PRIV test_markers_server.py` |
| Browser: no marker in localStorage, IndexedDB, caches, service workers, bfcache, download names | frontend storage ban, no SW | `E2E privacy_browser.spec.ts`, `FE storage_ban.test.ts` |
| Server restart loses nothing (no state) | stateless handlers (no module-level content) | `PRIV test_stateless_handlers.py` |
| Export responses carry no-store; not proxy-cached | `backend/app/middleware.py` | `BE test_no_store_headers.py` |
| Provider config matches claimed retention | `providers/registry.py`, `PROVIDER_GATE_APPROVED` | `BE test_provider_gate.py` |
| Body logging off | `logging_filter.py` | `BE test_logging.py` |
| Token never in URL | `security/auth.py` | `BE test_token_transport.py` |

Also covered: §15.3 load/reliability (`tests/load/locustfile.py`, Phase 5) and §15.4 definition of done (`docs/evaluation/report.md`, Phase 6).

## c) Repository structure

```
mediscribe/
├─ CLAUDE.md                      (copy of docs/CLAUDE.md at root – see open question 1)
├─ Makefile  .gitignore  .editorconfig  .pre-commit-config.yaml
├─ frontend/
│  ├─ src/
│  │  ├─ session/    reducer, store (no persistence), timers, approval, selectors
│  │  ├─ screens/    NewSession, Record, Review, PreviewApprove, DownloadEnd
│  │  ├─ components/ RoleChip, ReviewItemsPanel, SourceTag, ManualEntry, TranscriptSearch
│  │  ├─ audio/      recorder
│  │  └─ download/
│  ├─ e2e/           Playwright specs
│  └─ eslint config (storage-ban rule)
├─ backend/
│  ├─ app/
│  │  ├─ main.py  settings.py  middleware.py  logging_filter.py
│  │  ├─ routes/     health, transcribe, extract, render
│  │  ├─ providers/  base.py, mock.py, registry.py, real adapter stubs (gated)
│  │  ├─ extract/    mapping, review_engine, mock_rules, validate
│  │  ├─ schema/     note_schema.json, models.py
│  │  ├─ render/     docx_builder, pdf (LibreOffice), hash
│  │  └─ security/   auth, token, rate/upload limits
│  └─ tests/
├─ fixtures/synthetic/   kato_transcript.json, kato_expected_note.json, later cases
├─ tests/safety/  tests/privacy/  tests/load/
├─ scripts/        privacy_scan.sh, eval_report.py
├─ Dockerfile  (Phase 5)
└─ docs/           blueprint/, reference/, prompts/, decisions/ (ADRs), progress.md,
                   build_plan.md, backlog.md, deploy.md, governance/, evaluation/
```

## d) Phase plan and exit gates (§14 + phase prompts)

| Phase | Scope | Exit gate as I understand it |
|---|---|---|
| 0 Foundations | Repo, tooling, FastAPI health, no-store middleware, log filter, schema + Pydantic models, Vite/React store, storage-ban lint, privacy scan, progress.md | Lint/tests green; schema validates Kato example; storage-ban and no-store tests pass; body logging disabled and tested |
| 1 UI prototype | Pure reducer (Fig. 4), injectable-clock timers, five screens from §18.3, Kato fixtures, HIGH-lock, unload warning | Every Fig. 4 transition tested; consent gates Start; preview locked; edit resets approval; e2e walk-through with zero browser storage. (§14 target: ≥9/10 clinicians explain data loss – measured with people, not code) |
| 2 Audio & language | MediaRecorder, `/transcribe`, provider interface + mock, gated real adapter stubs, six roles, SSO stub, limits | Provider gate test; marker absent from logs; WER/speaker harness output on synthetic EN/LG/mixed sets |
| 3 Structured note | Safety tests first, `/extract`, schema validation, mapping, review engine, manual entry | 0 failures in `tests/safety`; 100% source tags; Kato matches expected note |
| 4 Review & approval | Source highlighting, edit/move/delete, resolve/unverified, `/render?mode=preview`, SHA-256 approval | 100% exports match approved hash; 0 exports without approval; checklist per §18.3 |
| 5 Export & hardening | Final `/render`, DOCX/PDF, neutral names, End + revoke, Dockerfile/deploy.md, privacy + load tests | Kato export matches reference; hash mismatch refused; 0 markers; load test within memory, no swap |
| 6 Evaluation | ≥10 new synthetic cases, content-free metrics, `eval_report.py`, clinician guide | Report covers every §15.4 item |
| 7 Governance (draft) | Data-flow map, provider-gate form, DPPA mapping, incident response, Appendix B evidence, compliance report | Documents drafted, every human decision from §17 listed; no compliance claimed |

Each phase starts in plan mode and ends with a STOP for approval (CLAUDE.md).

## e) Open questions and risks (with proposed defaults)

1. **CLAUDE.md location.** It is in `docs/`, but prompts reference `@CLAUDE.md` (root). *Default:* copy it to the repo root so Claude Code loads it automatically; keep `docs/CLAUDE.md` as the original.
2. **Reference note vs blueprint §18.** I have not yet extracted `example_note_fictional.docx`. *Default:* in Phase 0, derive `kato_expected_note.json` from §18 and the DOCX; any mismatch between the two is listed for your decision, not silently resolved (blueprint wins).
3. **Inactivity timeout 15 min** is a "prototype default, confirm in Phase 0" (§6.2, §17). *Default:* 15 min / warn at 13 / 2 h cap, made configurable constants.
4. **Token revocation without a server store** (§6.2 vs rule 3). Needs a stateless approach. *Default:* short-TTL signed tokens (e.g. 15 min, refreshed by heartbeat up to the 2 h cap) plus a documented ADR; an in-memory deny-list holds token IDs only (never clinical content) – final choice in Phase 5 ADR.
5. **Streaming for `/transcribe`** (§5.1, §10.5) vs a simple chunked upload. *Default:* chunked POST handled in request memory with the mock; true streaming deferred to the provider gate.
6. **PDF via LibreOffice** needs installing on Windows dev machines. *Default:* PDF tests run in Docker/CI; DOCX is the dev-time path.
7. **Luganda sample lines are "illustrative"** (§18.2). *Default:* use as fixtures only, flagged as needing fluent-speaker review; WER numbers are harness baselines against the mock, not real accuracy.
8. **SSO** has no real IdP. *Default:* OIDC-shaped dev stub only.
9. **Dev-environment risks:** this directory is not yet a git repo (Phase 0 inits it, local only – GitHub repo is yours to create later); Python/Node versions must be confirmed at the start of Phase 0.
10. **Risk – automation bias / hallucination** are mitigated by design (§16); the mock extractor is rule-based, so safety results prove the pipeline rules, not any real LLM. Real-model safety must be re-tested after the provider gate.

## Report

Produced `docs/build_plan.md`. Ready for Phase 0 approval.

---

## Final status (end of Phase 7)

All eight phases were built; see `docs/progress.md` for status, `docs/governance/spec_compliance_report.md`
for requirement-by-requirement evidence, and `docs/governance/open_decisions.md` for what needs a person.
The open questions in section (e) were resolved as follows: CLAUDE.md copied to the root; the reference
note's patient line added as optional `patient_label` (ADR-0001); timeout kept at 15 min / 2 h; token
revocation by id-only deny-list (ADR-0003); chunked upload (ADR-0004); PDF code written but not exercised
against LibreOffice here; Luganda lines flagged for fluent-speaker review; SSO is a dev stub.
