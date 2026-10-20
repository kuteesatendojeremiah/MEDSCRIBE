# Evaluation report (Blueprint §14 Phase 6, §15.4)

Generated 2026-10-19 09:15 by `scripts/eval_report.py`. **Synthetic data only; automated run.**
The extractor and speech provider are deterministic MOCKS: results show that the pipeline, safety layer and
harness work, not that any real model is safe or accurate. Human measures are marked NOT MEASURED.

## 1. Clinical safety tests (§15.1)

| Test | Target | Tests | Result |
|---|---|---|---|
| Negation preserved ('I do not have shortness of breath') | 0 errors | 8 | pass |
| Question not converted into diagnosis | 0 errors | 2 | pass |
| Doctor question not converted into patient fact | 0 errors | 4 | pass |
| Planned examination not shown as done | 0 errors | 6 | pass |
| Missing medication detail invented | 0 errors | 20 | pass |
| Relative's report labelled as patient's | 0 errors after review prompts | 8 | pass |
| Body system assigned only from specialty | 0 errors | 3 | pass |
| Every note item has a source tag | 100% | 18 | pass |
| Speaker role accuracy, clear audio | >= 95% (rest Unknown) | 1 | pass |
| Word error rate, English / Luganda / mixed | Baseline in Phase 2 | 1 | pass |

All of `tests/safety`: **101 passed, 0 failed, 0 skipped**.

## 2. Speech and speaker harness (mock baseline, §14 Phase 2)

| Set | Segments | WER | Speaker accuracy (clear, assigned) | Unknown rate | >= 95% |
|---|---|---|---|---|---|
| eval_english | 7 | 0.048 | 1.000 | 0.000 | met |
| eval_luganda | 5 | 0.059 | 1.000 | 0.000 | met |
| eval_mixed | 6 | 0.033 | 0.800 | 0.000 | not met (deliberate error in set) |

The mixed set carries a deliberate nurse-to-doctor error to prove the harness can fail. WER here is the mock's
hypothesis against hand-written references; real WER targets are set before a real provider is used (§15.1).

## 3. Synthetic consultation cases (12 new cases, `fixtures/synthetic/cases/`)

| Case | Result |
|---|---|
| case_01_negation | pass |
| case_02_questions_vs_facts | pass |
| case_03_relative_speaking | pass |
| case_04_interpreter | pass |
| case_05_unclear_doses | pass |
| case_06_planned_vs_completed_exam | pass |
| case_07_code_switching | pass |
| case_08_interruptions | pass |
| case_09_conflicting_statements | pass |
| case_10_missing_allergy_status | pass |
| case_11_vitals_results_referral | pass |
| case_12_diagnosis_statements | pass |

Themes covered: negation, questions vs facts, relative speaking, interpreter, unclear doses, planned vs
completed examination, code-switching, interruptions, conflicting statements, missing allergy status.

## 4. Correction effort and review time

Sample content-free metrics from one AUTOMATED walk-through (`docs/evaluation/sample_metrics.json`):

```json
{
  "schema": 1,
  "review_seconds": 1,
  "approval_seconds": 0,
  "edits_by_section": {
    "exam": 1,
    "treatment": 1
  },
  "review_items_by_level": {
    "HIGH": 2,
    "CHECK": 2,
    "INFO": 1
  },
  "review_items_final_status": {
    "unverified": 1,
    "resolved": 1,
    "open": 3
  },
  "segment_edits": 0,
  "role_reassignments": 0,
  "items_added": 1,
  "items_deleted": 0,
  "items_moved": 0,
  "high_items_opened": 2,
  "preview_visits": 1,
  "approvals": 1,
  "recoverable_errors": 0,
  "terminal_errors": 0
}
```

**Median clinician review time: NOT MEASURED.** It requires clinicians running fictional cases with
evaluation mode on (`?eval=1`); see `docs/evaluation/clinician_guide.md`. The timings above are a script's.

## 5. Export reliability

- 50 DOCX exports of the Kato note with the approved hash: **50/50 succeeded**, 50/50 valid DOCX containers (median 113.7 ms, max 194.2 ms).
- 50 exports where one character of the note was changed after approval: **50/50 refused** with `E_HASH_MISMATCH` (terminal).
- PDF via LibreOffice: NOT MEASURED (LibreOffice not installed on this host).
- Download success on the target network (>= 99%, §15.3): **NOT MEASURED** (needs the real network).

## 6. Cleanup and statelessness (§15.2)

- `tests/privacy`: **11 passed, 0 failed, 0 skipped** (6 full sessions seeded with `SYNTHETIC-MARKER-7Q4Z`; log output, temp dirs, repository, process state, restart).
- `scripts/privacy_scan.sh`: **0 hits (exit 0)**.
- Browser: `frontend/e2e/privacy.spec.ts` seeds the marker and checks storage, caches, service workers, URLs, console, download name and the back-forward cache (run with `npx playwright test`).

## 7. Backend test suite

`backend/tests`: **95 passed, 0 failed, 0 skipped**.

## 8. Definition of done (§15.4)

| # | Item | Status |
|---|---|---|
| 1 | A fictional mixed-language consultation is recorded, transcribed and translated | Done with MOCK providers (fake microphone / uploaded file -> mock transcript with originals and translations). Real speech: blocked by the provider gate |
| 2 | Speaker roles correct or Unknown, and editable | Roles editable (e2e); accuracy measured on the mock harness only |
| 3 | One note with all §4 sections and source tags | Done (schema-validated, every item sourced) |
| 4 | All §15.1 targets met | Safety tests: see §1 (mock extractor). WER/speaker targets for real providers: not yet set or measured |
| 5 | Preview, hash approval and export work; unverified items print visibly | Done (DOCX). PDF path implemented; LibreOffice output not verified on this host |
| 6 | All §15.2 tests find 0 markers | Done on this host: see §6 (0 hits (exit 0)) |
| 7 | Test report documents quality, safety errors, review time, export reliability and cleanup | This report. Review time: NOT MEASURED |

