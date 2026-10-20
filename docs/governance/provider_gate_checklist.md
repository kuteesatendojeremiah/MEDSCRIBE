# Provider gate checklist (Blueprint §10.5) – complete one copy per endpoint and account

**Rule:** no real patient content goes to any speech, translation or AI provider until every item
below is verified, in writing, for the *exact* endpoint and account. If any item fails: use synthetic
data only, or a locally hosted model.

The application enforces the gate in code: `PROVIDER_GATE_APPROVED` defaults to `false`; a real adapter
also needs the provider named in `PROVIDER_ALLOW_LIST`; otherwise requests fail with
`E_PROVIDER_GATE_CLOSED` / `E_PROVIDER_NOT_ALLOWED` (`backend/tests/test_provider_gate.py`). Completing
this form is the human step that must come before anyone sets those values.

| Field | Entry |
|---|---|
| Provider / product name | |
| Exact endpoint(s) (URL, region, API version) | |
| Account / project / tenant id | |
| Purpose in Mediscribe | speech-to-text / translation / structured extraction (circle) |
| Data sent to this endpoint | audio / transcript / header values (circle) |
| Completed by (name, role) | |
| Date | |
| Reviewed by data-protection officer (name, date) | |

## Checks

| # | Requirement (§10.5) | Evidence required | Verified? (Y/N) | Evidence reference | Verified by / date |
|---|---|---|---|---|---|
| 1 | **Zero retention**, including abuse monitoring, in writing for this endpoint | contract clause, DPA, or provider's written confirmation; the setting or agreement that disables abuse-monitoring storage | | | |
| 2 | **Streaming or synchronous** processing; no need to upload audio to a storage bucket | architecture note / API reference showing no storage dependency | | | |
| 3 | **Processing location** known; lawful basis for any processing outside Uganda (DPPA s.19, see `dppa_mapping.md`) | region list; transfer assessment or consent wording approved by the DPO | | | |
| 4 | **Subprocessors** listed; **deletion** and **breach-notice** terms agreed | subprocessor list; DPA clauses with notice period | | | |
| 5 | **Quality** on Luganda / mixed speech and medical vocabulary measured with synthetic audio | `scripts/eval_report.py` run against this provider; WER and speaker targets set before use (§15.1) | | | |
| 6 | If any item fails: synthetic data only, or a locally hosted model | decision recorded | | | |

Supporting configuration checks (tick when done)

- [ ] `PROVIDER_ALLOW_LIST` contains only providers whose form is complete
- [ ] Provider configuration matches the retention claimed above for every endpoint (§15.2)
- [ ] API keys live only in server-side secret management
- [ ] Network egress from the processing host is limited to this endpoint
- [ ] Re-run `tests/privacy` and `scripts/privacy_scan.sh` with the real adapter in a synthetic-only environment
- [ ] Incident contact and breach route for this provider added to `incident_response.md`

## Decision

| Gate result | PASS / FAIL |
|---|---|
| Approved by (facility lead) | |
| Date | |
| Conditions or limits | |

*Drafting aid only. Passing this form is a human decision; Mediscribe does not certify it.*
