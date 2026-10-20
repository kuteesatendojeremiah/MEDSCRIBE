# Appendix B – implementation checklist status (Blueprint v3.0)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | No database, session store or storage bucket for clinical content | **done** | no such dependency in `backend/pyproject.toml`; `grep` audit of `backend/app` found no database/pickle/redis/file-write for content (only the PDF temp dir, removed in `finally`); `tests/privacy/test_markers.py::test_stateless_handlers...` |
| 2 | Session held only in browser memory; End/timeout/tab close clears it | **done** | `frontend/src/session/reducer.ts` + `reducer.test.ts` (end/timeout/discard/terminal clear content); `e2e/kato_walkthrough.spec.ts` (empty after End) |
| 3 | No localStorage/IndexedDB/service-worker cache; `Cache-Control: no-store` | **done** | `frontend/src/storage_ban.test.ts`, ESLint rule, `e2e/*` (`expectNoBrowserStorage` at every step), `backend/tests/test_no_store_headers.py`, `test_web.py` |
| 4 | Spellcheck/autocomplete off on clinical fields; neutral file names; blob URLs revoked | **done** | `src/screens/review.test.tsx` (every text input), `components.test.tsx`, `session/filename.ts` + `phase2to5.test.ts`, `session/download.ts` (revoke), `e2e/privacy.spec.ts` |
| 5 | Facility SSO; token in header/HttpOnly cookie; rate and upload limits | **partial** | token in header, rate and upload limits tested (`test_auth.py`, `test_transcribe.py`, `test_hardening.py`). **Real SSO not implemented** (dev stub, ADR-0003) |
| 6 | Swap and core dumps off; body logging off; throw-away renderer profile | **partial** | body logging off and tested (`test_logging.py`, `test_marker_logging.py`); renderer profile/temp dir deleted in `finally` (`test_render.py`); swap/core-dump settings documented in `docs/deploy.md` but **not verified on a host**; Dockerfile **not built** here |
| 7 | Provider gate passed for every endpoint (streaming, zero retention, location) | **not done / not applicable yet** | the gate is enforced in code (`test_provider_gate.py`); `provider_gate_checklist.md` is the form to complete before any real provider |
| 8 | DPPA review, PDPO registration plan, consent wording agreed | **not done** | `dppa_mapping.md` is a draft for the DPO; consent wording is the blueprint's, not approved by anyone |
| 9 | Language detection, translation with originals, six speaker roles | **done (mock)** | `test_transcribe.py`, `models.py` (roles), e2e; real language support depends on the provider gate (§7.1) |
| 10 | All §4 sections; manual entry everywhere; source tags on every item | **done** | `phase2to5.test.ts`, `test_sources_review_kato.py`, `app/schema` |
| 11 | HIGH items lock preview; edit resets approval; hash checked at render | **done** | `reducer.test.ts`, `e2e/rules.spec.ts`, `test_render.py`, `test_hardening.py` |
| 12 | Export header/footer: approver, time, consent, AI declaration, unverified items | **done (DOCX)** | `backend/tests/test_render.py` (against `docs/reference/example_note_fictional.docx`) |
| 13 | §15 safety targets met; 0 markers in privacy tests; load test passed | **partial** | safety suite 101 passing (mock extractor); 0 markers; load test passed on a dev host; real-provider WER/speaker targets not set; target-network download rate not measured |
| 14 | Written approvals before any real patient data | **not done** | human decision; see `open_decisions.md` and `dppa_mapping.md` |
