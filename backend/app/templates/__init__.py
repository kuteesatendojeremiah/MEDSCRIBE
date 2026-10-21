"""Specialty note templates (Blueprint §4.1, FR-19; ADR-0010).

A template is a layer over the fixed note schema (Appendix A): it picks the document title, the
heading and order of each schema section, and whether an empty section is left out. It never creates,
changes or drops content: an item in a section a template leaves out is printed under the fallback
heading, and nothing is invented for an empty section. Transcription, extraction, hashing and export
do not depend on which template is chosen, so a new specialty is added here and nowhere else.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SectionSpec:
    key: str  # a schema section: history, meds_allergies, vitals, exam, ...
    heading: str
    omit_when_empty: bool = False


@dataclass(frozen=True)
class Template:
    id: str
    title: str
    sections: tuple[SectionSpec, ...]
    fallback_heading: str = "OTHER RECORDED FINDINGS"
    # Templates are content-free layouts; none has been validated by a clinician yet (ADR-0010).
    review_status: str = "pending_clinician_review"


CARDIOLOGY = Template(
    id="cardiology",
    title="CARDIOLOGY OUTPATIENT CONSULTATION NOTE",
    sections=(
        SectionSpec("history", "HISTORY"),
        SectionSpec("meds_allergies", "MEDICATIONS AND ALLERGIES"),
        SectionSpec("vitals", "VITAL SIGNS"),
        SectionSpec("exam", "EXAMINATION FINDINGS"),
        SectionSpec("investigations", "INVESTIGATIONS AND RESULTS"),
        SectionSpec("assessment", "ASSESSMENT"),
        SectionSpec("treatment", "TREATMENT"),
        SectionSpec("plan", "PLAN"),
    ),
)

GENERAL = Template(
    id="general",
    title="GENERAL OUTPATIENT CONSULTATION NOTE",
    sections=(
        SectionSpec("history", "HISTORY"),
        SectionSpec("meds_allergies", "MEDICATIONS AND ALLERGIES"),
        SectionSpec("exam", "EXAMINATION FINDINGS", omit_when_empty=True),
        SectionSpec("investigations", "INVESTIGATIONS AND RESULTS", omit_when_empty=True),
        SectionSpec("assessment", "ASSESSMENT"),
        SectionSpec("treatment", "TREATMENT"),
        SectionSpec("plan", "PLAN"),
    ),
)

TEMPLATES: dict[str, Template] = {t.id: t for t in (CARDIOLOGY, GENERAL)}
DEFAULT_TEMPLATE_ID = CARDIOLOGY.id


def get_template(template_id: str) -> Template:
    return TEMPLATES[template_id]  # KeyError for an unknown id; routes turn it into a 422
