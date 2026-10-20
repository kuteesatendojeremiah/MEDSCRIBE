# Uganda Data Protection and Privacy Act 2019 – mapping to the design (Blueprint §11)

> **FOR REVIEW BY THE DATA-PROTECTION OFFICER – NOT LEGAL ADVICE.**
> This is a planning aid that maps obligations, as summarised in Blueprint §11, to design decisions and
> evidence. The facility's data-protection officer and legal adviser must confirm the section references,
> the 2021 Regulations, and any other applicable law (health professions, research ethics). Nothing here
> asserts compliance.

| # | Obligation (DPPA 2019, as listed in §11) | What it means for Mediscribe | Design decision / evidence | Open items for the DPO |
|---|---|---|---|---|
| 1 | Health information is "special personal data" (s.9): processed only where the law permits | Document the lawful basis with the facility **before any real use** | Synthetic data only is enforced by process (CLAUDE.md rule 6) and the export carries a DEMONSTRATION line while `SYNTHETIC_ONLY=true`. No real-patient mode exists | Identify the lawful basis and who is controller/processor for the pilot |
| 2 | Processing or storage outside Uganda only if the destination has equivalent protection or the data subject consents (s.19) | Prefer in-country or local processing; otherwise consent wording must cover it and the provider gate must check it | Provider gate item 3 (`provider_gate_checklist.md`); the mock runs in-process with no transfer; `PROVIDER_GATE_APPROVED=false` | Decide in-country vs abroad; approve consent wording that names any provider location |
| 3 | Collectors, processors and controllers register with the Personal Data Protection Office (PDPO) | Facility and/or Mediscribe operator registers before the pilot | Not a code matter | Confirm who registers and when; record the registration number here: ______ |
| 4 | Breaches must be notified to the PDPO (s.23) | The incident plan names who notifies and how | `incident_response.md` (roles are placeholders) | Name the notifier, deadline and route; confirm the legal timeframe |
| 5 | Consent and purpose limitation | Consent statement captured each session and printed on the note | New-session screen requires the consent tick before Start (FR-02, tested); the statement is printed in the export header (`backend/tests/test_render.py`). No secondary use: nothing is stored, so nothing can be reused | Approve the exact consent wording (also for any recording/AI-processing disclosure, and whether verbal consent is sufficient) |
| 6 | (supporting) Data minimisation and storage limitation | Collect only what the note needs; keep nothing | No database, no server session, browser memory only, `no-store` everywhere; privacy tests find 0 markers (`tests/privacy`, `frontend/e2e/privacy.spec.ts`) | Confirm that holding the draft in browser memory for the session is acceptable |
| 7 | (supporting) Security safeguards | Appropriate technical and organisational measures | `docs/deploy.md` (read-only filesystem, no swap, no core dumps, TLS, secrets), signed short-lived tokens, rate and size limits, content-free logs | Independent security assessment (Appendix B, §11.1) |
| 8 | (supporting) Data-subject rights (access, correction, deletion) | The patient's record is the facility's paper file/EMR, not Mediscribe | Mediscribe holds nothing to access or delete; the doctor reviews and corrects before approval | Confirm the facility's procedure for requests relating to the AI-assisted note |
| 9 | (supporting) Transparency | The patient should be told about recording and AI drafting | Consent statement; AI declaration printed on every export (§4.3) | Provide a patient-facing notice |

## Approvals needed before any real-patient pilot (Blueprint §11.1) – status

| Approval | Status |
|---|---|
| Facility management approval and named clinical lead | not obtained |
| Ethics/research committee review (if evaluated as research) | not obtained |
| Data-flow map and DPIA signed off | data-flow map drafted (`data_flow_map.md`); DPIA not done |
| Provider gate passed | not applicable until a real provider exists |
| Security assessment and verified cleanup tests | automated cleanup tests pass on a development host; assessment not done |
| Incident-response procedure including PDPO notification | drafted with placeholders |
