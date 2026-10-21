# Cardiology template: checklist for qualified clinician review

Status: **not yet reviewed.** Synthetic data only. Nothing here is clinical advice. Template code: `backend/app/templates/__init__.py`;
rules: Blueprint §4.1, §4.4; decision: ADR-0010. Fictional cases: `fixtures/synthetic/` (Kato worked example, 13 cases).

For the reviewing cardiologist, tick or comment on each:

1. Are the section headings and their order what you expect on a cardiology outpatient note? (History, Medications and allergies, Vital
   signs, Examination findings, Investigations and results, Assessment, Treatment, Plan)
2. Is it acceptable that Presenting Complaint, HPI, cardiovascular, medical and family history share one HISTORY heading, and that
   medications share a heading with allergies? If not, which split matters most?
3. Vital signs shown: BP, pulse, RR, SpO2, temperature, weight. Missing ones print "not recorded". Anything else needed (e.g. height/BMI)?
4. Are ECG, echo, labs and imaging correctly limited to results actually stated, with planned tests going to Plan?
5. Review flags (HIGH: missing dose/route/frequency, unknown allergy status, conflicting facts, unknown speaker; CHECK; INFO):
   are the severities right? Any critical item that is missing?
6. Open the worked example (`docs/reference/example_note_fictional.docx`): is the wording of negations, uncertain diagnoses and
   relative-reported history safe and clear?
7. Anything that could be read as Mediscribe diagnosing, prescribing or approving? (It must not.)

Reviewer, role, date and decision are recorded outside the repository. Until this is done the template is a technical demonstration.
