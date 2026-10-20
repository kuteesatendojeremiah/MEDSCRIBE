# ADR-0007: Structured patient details on the note; PDF built in Python

- Status: accepted (product owner asked for a patient introduction section and reported the PDF failing), 19 Oct 2026
- Blueprint refs: §4.1 (header: only entered or captured values, never invented identifiers), §4.3, §10.1, §13, FR-02, FR-12; extends ADR-0001

## 1. Patient introduction details
The product owner asked for a patient introduction (name, age, sex ...) on the note. ADR-0001 allowed only one free-text
label. Decision: an optional structured block `header.patient` = `{name, age, sex, file_number, residence}`:
- typed by the clinician on the **New session** screen (own "Patient details" box), shown as a banner at the top of
  **Review** with an **Edit patient details** link (a correction updates the note header and cancels any approval);
- printed in the Word/PDF header as Patient, Age / sex, File no., Residence - **only what was typed**; if nothing was typed the
  row says "not recorded" (never invented);
- kept only in tab memory and the export; never stored, never logged (`patient`, `patient_name`, `patient_label` are banned
  log fields); cleared on End;
- part of the hashed note, so approving fixes them too; `patient_label` remains for older notes.
Age is free text ("58", "6 months"). These are direct identifiers: real use still needs the §11.1 approvals.

## 2. PDF without LibreOffice
Blueprint §13 names LibreOffice headless for PDF. In practice it was not installed, and the user saw `E_PDF_FAILED`. Decision: build
the PDF with **ReportLab** from the same document model as the DOCX (`app/render/pdf_builder.py`). It is pure Python, in memory,
creates no temp files or profile directories (removing a cleanup risk), and needs nothing installed on the host. Trade-off: the
built-in font covers Western European text only (characters outside it, such as the subscript in SpO2, are mapped to safe
equivalents or `?`); layout is similar to, not identical with, the Word file. The LibreOffice code and its settings were removed.
