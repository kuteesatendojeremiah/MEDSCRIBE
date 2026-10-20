# ADR-0001: Optional `patient_label` in the note header

- Status: accepted (product owner, 2026-10-19)
- Blueprint refs: §4.1 (Header), §4.3, Appendix A, FR-02, §10.1; reference note `docs/reference/example_note_fictional.docx`

## Context
The reference note's header shows "Ronald Kato (FICTIONAL) · 58 years · Male". Appendix A / §4.1 list no
patient field, and FR-02 says sessions have no patient profile. The blueprint wins, so this is a
recorded deviation.

## Decision
Add one optional free-text header field, `patient_label`, typed by the clinician at session start.
- Never derived, looked up or invented by Mediscribe (§4.1 "never invent identifiers").
- Lives only in tab memory and in the exported document; not a profile, not searchable, not stored.
- Added to the banned log-field list (§10.1); never in file names (§10.2 neutral names).
- Optional: omitted means the export header shows no patient line.
- Synthetic data only until the §11.1 approvals exist.

## Consequences
Schema, Pydantic model, Kato fixture and tests updated. Phase 1 New-session screen gets a
"Patient label (optional)" input with spellcheck off / autocomplete off; Phase 5 renders it in the header table.
