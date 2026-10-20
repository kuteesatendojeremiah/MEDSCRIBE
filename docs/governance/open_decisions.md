# Open human decisions (Blueprint §17) and other items that need a person

Nothing below can be decided by the build. "Proposed default" is what the prototype uses meanwhile.

## Decisions listed in §17

| Decision | Proposed owner | Proposed default in the prototype | Needed before |
|---|---|---|---|
| Final note layout and wording | Clinical lead | the layout in `docs/reference/example_note_fictional.docx`, rendered by `backend/app/render` | pilot |
| Inactivity timeout and absolute limit | Clinical lead + security lead | 15 min (warning 13), 2 h absolute; constants in `frontend/src/session/timers.ts` and `settings.py` | pilot |
| Speech / translation / LLM provider or local model | Technical lead + DPO | mock only; real adapters are stubs behind the gate | any real data |
| Lawful basis and consent wording (incl. s.19 if processing abroad) | DPO / legal | the §18 consent sentence, unreviewed | any real data |
| PDPO registration | Facility administration | not done | pilot |
| How exports reach the paper file or EMR | Ward/clinic managers | download a DOCX/PDF and file it by hand | pilot |
| Who verifies cleanup and handles incidents | Security lead | roles blank in `incident_response.md` | pilot |

## Raised by the build

| Item | Why it needs a person |
|---|---|
| Patient label in the header (ADR-0001) | accepted by the product owner on 19 Oct 2026; the DPO should confirm that a clinician-typed label printed on the note is acceptable |
| "Opened" vs "resolved" for the Preview lock (ADR-0002) | interpretation of FR-09 vs §12.1; confirm |
| Real SSO | choose the identity provider and token format (ADR-0003) |
| Review time and usability | needs clinicians running the fictional cases (`docs/evaluation/clinician_guide.md`); the §14 Phase 1 criterion (9 of 10 explain data-loss behaviour) uses `docs/phase1/data_loss_comprehension_questions.md` |
| Luganda fixtures | every Luganda line is illustrative and must be reviewed by a fluent speaker |
| Real WER / speaker targets | set before a real provider is used (§15.1) |
| Host verification | build and run the Dockerfile; confirm swap off, core dumps off, proxy and load-balancer body logging off, LibreOffice PDF output, TLS, secret management |
| Independent security assessment | required by §11.1 before a pilot |
| Real-patient pilot | only after all §11.1 approvals exist in writing (Phase 7 of the roadmap) |
