# ADR-0010: Specialty templates are a layer over the fixed note schema

- Status: accepted by the product owner for Stages D and H of the engineering upgrade
- Blueprint refs: §4.1 (section rules), Appendix A (schema), §4.4, FR-19; CLAUDE.md "the blueprint wins"

## Context
The upgrade spec lists finer cardiology sections (Presenting Complaint, History of Present Illness, Relevant Cardiovascular History,
Relevant Medical and Family History, Current Medications, Allergies, Examination and Vital Signs, ...) than the eight sections in
Appendix A (`history`, `meds_allergies`, `vitals`, `exam`, `investigations`, `assessment`, `treatment`, `plan`). The product owner chose
to keep the schema and add a template layer.

## Decision
- `backend/app/templates/` holds `Template` and `SectionSpec`: document title, heading and order for each schema section, and
  `omit_when_empty`. Registered: `cardiology` (the default, headings identical to the reference note) and `general` (proves the layer;
  not offered in the UI).
- `/render` takes an optional `template` query parameter (unknown id: 422 `E_BAD_REQUEST`). The template is not part of the hashed
  note: it changes headings and order only, never content, so the approved hash and the DOCX/PDF equivalence are unaffected.
- A template can never drop content. An item in a section the template does not list is printed under `OTHER RECORDED FINDINGS`; an
  omitted-when-empty section is simply absent and nothing is written in its place (§4.4: empty sections stay INFO review items).
- Extraction, transcription, hashing and export do not import a template, so specialties are added only in `app/templates`.

## Mapping of the spec's cardiology sections (no schema change)
| Spec heading | Where it appears |
|---|---|
| Presenting Complaint, History of Present Illness, Relevant Cardiovascular / Medical / Family History | `HISTORY` (items keep their text, time and who reported it) |
| Current Medications, Allergies | `MEDICATIONS AND ALLERGIES` (unknown allergy status is a HIGH review item) |
| Examination and Vital Signs | `VITAL SIGNS` and `EXAMINATION FINDINGS` |
| Investigations incl. ECG | `INVESTIGATIONS AND RESULTS` (results only; planned tests go to `PLAN`) |
| Assessment, Treatment, Plan and Follow-up | `ASSESSMENT`, `TREATMENT`, `PLAN` |
| Missing or Uncertain Information | Review items section and `not recorded` lines |

## Consequences / limits
- Presenting Complaint, HPI and the history types are not separate headings, and medications are not separate from allergies. Splitting
  them needs an optional item-level field (a schema change and a blueprint amendment) and was declined for now.
- No template has been reviewed by a clinician: `review_status = "pending_clinician_review"` and `docs/clinical/cardiology_template_review.md`
  is the checklist for a qualified cardiologist before any live pilot.
