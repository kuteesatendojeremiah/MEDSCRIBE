# Mediscribe – Progress

Updated at the end of Phase 7 (all phases built, with the limits stated below). Synthetic data only; speech
and extraction are deterministic mocks; real providers are blocked by the provider gate.

Last full run: backend + safety + privacy **281 passed**; frontend unit **125 passed**; browser e2e **21 passed**;
privacy scan **0 hits**; lint clean. Details: `docs/governance/spec_compliance_report.md`.

## Phases

| Phase | Status | Gate evidence |
|---|---|---|
| 0 Foundations | done | repo tooling, no-store middleware, log filter, schema + models, storage ban, privacy scan |
| 1 UI prototype | done (the "9 of 10 clinicians" criterion needs people: `docs/phase1/data_loss_comprehension_questions.md`) | `reducer.test.ts`, e2e walk-through, `docs/phase1/screenshots/` |
| 2 Audio & language | done with mock providers; WER/speaker harness; real adapters blocked by the gate | `backend/tests/test_provider_gate.py`, `test_transcribe.py`, `test_eval_harness.py`, `docs/evaluation/report.md` |
| 3 Structured note | done (mock rule extractor + provider-independent safety layer) | `tests/safety/*` (101 tests), Kato matches expected |
| 4 Review & approval | done (SHA-256 approval) | `phase2to5.test.ts`, `e2e/rules.spec.ts` |
| 5 Export & hardening | done for DOCX and application-level hardening; Docker build and host settings **not verified here** (PDF is now built in Python and tested) | `backend/tests/test_render.py`, `tests/privacy`, `docs/deploy.md`, `docs/evaluation/load_test.md`, `docs/phase5/` |
| 6 Evaluation | done as an automated harness; clinician review time **not measured** | `fixtures/synthetic/cases` (12), `scripts/eval_report.py`, `docs/evaluation/` |
| 7 Governance drafts | done (drafts; no compliance claimed) | `docs/governance/` |

## Requirements

| ID | Requirement | Status | Test |
|---|---|---|---|
| FR-01 | Facility SSO | partial (dev stub) | `test_auth.py` |
| FR-02 | Temp session, consent | done | `components.test.tsx` |
| FR-03 | Capture/upload audio | done | `e2e/rules.spec.ts` |
| FR-04 | Detect language, transcribe, translate | done (mock) | `test_transcribe.py` |
| FR-05 | Six speaker roles, reassign | done (mock) | `e2e/rules.spec.ts` |
| FR-06 | Extract + schema-validate | done (mock rules) | `test_extract_route.py`, `tests/safety` |
| FR-07 | Manual entry everywhere | done | `phase2to5.test.ts` |
| FR-08 | One note, all sections | done | `test_sources_review_kato.py` |
| FR-09 | Preview locked until HIGH opened | done | `reducer.test.ts` |
| FR-10 | Approve exact version; edit resets | done | `phase2to5.test.ts`, e2e |
| FR-11 | Render only if hash matches | done | `test_render.py` |
| FR-12 | Export content | done (DOCX) | `test_render.py` |
| FR-13 | Neutral file name, no server copy | done | `test_render.py`, `tests/privacy` |
| FR-14 | Unload warning | done | `e2e/rules.spec.ts` |
| FR-15 | Recoverable vs terminal errors | done | `reducer.test.ts`, `phase2to5.test.ts` |
| FR-16 | Timeout 13/15 min, 2 h cap | done | `misc.test.ts` |
| FR-17 | No content in logs/storage | done on this host | `tests/privacy`, `e2e/privacy.spec.ts` |
| FR-18 | Transcript search (P1) | done | `review.test.tsx` |
| FR-19 | More templates (P2) | not done (`docs/backlog.md`) | – |
| §15.1 | Safety tests | pass (mock extractor) | `tests/safety` |
| §15.2 | Privacy tests | pass on this host | `tests/privacy`, `e2e/privacy.spec.ts` |
| §15.3 | Load and reliability | passed on a dev host; target network not measured | `docs/evaluation/load_test.md` |

## What still needs a person or another environment

See `docs/governance/open_decisions.md`: real SSO, provider gate and any real provider, DPO/legal review and
approvals, clinician evaluation (review time, usability), fluent-speaker review of Luganda fixtures, building
and running the Docker image (PDF, swap, core dumps, proxy logging), independent security assessment.


## Engineering upgrade (spec stages)

| Stage | Status | Evidence |
|---|---|---|
| A Audit | done (read-only) | deployed app answered 200 (first request 23.7 s cold start); baseline tests all green |
| B Reliability | built, awaiting gate approval; Docker build/HEALTHCHECK **not verified** | `test_settings.py`, `test_health.py`, `test_provider_timeout.py`, `api/client.timeout.test.ts`, ADR-0008 |
| C Workspace | done; states mapped onto Blueprint §6.1 (ADR-0009), no new phases | `stageC.test.ts`, `e2e/failures.spec.ts` |
| D/H Notes and cardiology template | template layer over the fixed schema (ADR-0010); presenting complaint/HPI and allergies are **not** separate headings; no clinician review yet | `test_templates.py`, `docs/clinical/cardiology_template_review.md` |
| E Review/approval | already built; added tests that every edit after approval cancels it | `stageE.test.ts` |
| F Export | already built; added DOCX/PDF equivalence tests; PDF font is Latin-1 only (Luganda letters such as Ŋ print as `?`) | `test_export_equivalence.py` |
| G Lifecycle/privacy | tokens only, no server store (ADR-0003); audit written | `test_session_lifecycle.py`, `docs/governance/stage_g_privacy_audit.md` |
| I Testing | failure-mode e2e, look-alike drugs, long transcript, health-check script | `e2e/failures.spec.ts`, `test_stage_i_regressions.py`, `scripts/health_check.py` |
| UI redesign | Review (note-first, review dock, action menu, resizable transcript), Preview, Export, New session and Record updated; not checked in real browsers other than Chrome, no automated accessibility audit tool run | `reviewRedesign.test.tsx`, `stageFormat.test.ts`, `e2e/responsive.spec.ts`, `e2e/screens.spec.ts` |
