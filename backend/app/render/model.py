"""Document model shared by the preview and the DOCX/PDF export (Blueprint §4.1, §4.3, §4.4).

One builder feeds both, so the clinician previews exactly what will be exported.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from app.extract.review_engine import VITAL_NAMES, join_and, missing_vitals
from app.render.hash import note_hash, short_hash

SECTION_TITLES = [
    ("history", "HISTORY"),
    ("meds_allergies", "MEDICATIONS AND ALLERGIES"),
    ("vitals", "VITAL SIGNS"),
    ("exam", "EXAMINATION FINDINGS"),
    ("investigations", "INVESTIGATIONS AND RESULTS"),
    ("assessment", "ASSESSMENT"),
    ("treatment", "TREATMENT"),
    ("plan", "PLAN"),
]
ATTRIBUTION = {
    "patient": "patient",
    "other_clinician": "nurse / other clinician",
    "interpreter": "via interpreter",
}


@dataclass
class Line:
    text: str
    unverified: bool = False


@dataclass
class Section:
    title: str
    lines: list[Line] = field(default_factory=list)


@dataclass
class Document:
    title: str
    demo_line: Optional[str]
    header_rows: list[tuple[str, str]]
    sections: list[Section]
    review: list[Line]
    footer: str
    short_hash: str

    def as_dict(self) -> dict:
        return {
            "title": self.title,
            "demo_line": self.demo_line,
            "header_rows": [{"label": k, "value": v} for k, v in self.header_rows],
            "sections": [
                {
                    "title": s.title,
                    "lines": [{"text": ln.text, "unverified": ln.unverified} for ln in s.lines],
                }
                for s in self.sections
            ],
            "review": [{"text": ln.text, "unverified": ln.unverified} for ln in self.review],
            "footer": self.footer,
            "short_hash": self.short_hash,
        }


def format_when(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    offset = d.strftime("%z")
    tz = f" (UTC{offset[:3]}:{offset[3:]})" if offset else ""
    return f"{d.day} {d:%B %Y} · {d:%H:%M}{tz}"


def line_text(item: dict) -> str:
    """Item text plus where it came from, unless the text already says so."""
    src = item["source"]
    text = item["text"]
    low = text.lower()
    if src["type"] == "clinician_entered":
        return text if "entered by clinician" in low else f"{text} (entered by clinician)"
    if src["type"] == "clinician_edited":
        return f"{text} (edited by clinician)"
    who = ATTRIBUTION.get(src.get("speaker_role", ""))
    if not who or who.split()[0] in low or "reported by" in low:
        return text
    return f"{text} ({who})"


def patient_rows(header: dict) -> list[tuple[str, str]]:
    """The patient introduction rows (only what was typed; nothing is invented)."""
    p = header.get("patient") or {}
    rows: list[tuple[str, str]] = []
    if p.get("name") or header.get("patient_label"):
        rows.append(("Patient", p.get("name") or header["patient_label"]))
    age_sex = " · ".join(x for x in (p.get("age") and f"{p['age']}", p.get("sex")) if x)
    if age_sex:
        rows.append(("Age / sex", age_sex))
    if p.get("file_number"):
        rows.append(("File no.", p["file_number"]))
    if p.get("residence"):
        rows.append(("Residence", p["residence"]))
    if not rows:
        rows.append(("Patient", "not recorded"))
    return rows


def build_document(
    note: dict,
    *,
    approver: str,
    approved_at: Optional[datetime] = None,
    demo: bool = True,
) -> Document:
    header = note["header"]
    review = note["review_items"]
    unverified_ids = {r["item_id"] for r in review if r["status"] == "unverified" and r["item_id"]}

    rows: list[tuple[str, str]] = patient_rows(header)
    rows += [
        ("Temporary ref.", f"{header['temp_ref']} (not stored by Mediscribe)"),
        ("Date / time", format_when(header["datetime"])),
        ("Clinician", header["clinician"]),
        ("Languages", ", ".join(header["languages"])),
        ("Present", " · ".join(header["present"])),
        ("Consent", header["consent_statement"]),
    ]

    sections: list[Section] = []
    for key, title in SECTION_TITLES:
        sec = Section(title)
        for it in (i for i in note["items"] if i["section"] == key):
            sec.lines.append(Line(line_text(it), it["id"] in unverified_ids))
        if key == "vitals":
            missing = missing_vitals(note["items"])
            if missing:
                names = [VITAL_NAMES.get(m, m) for m in missing]
                sec.lines.append(Line(f"{join_and(names)}: not recorded during this consultation."))
        if not sec.lines:
            sec.lines.append(Line("not recorded"))
        sections.append(sec)

    resolved = [r["reason"] for r in review if r["status"] == "resolved" and r["level"] != "INFO"]
    unverified = [r["reason"] for r in review if r["status"] == "unverified"]
    unresolved = [r["reason"] for r in review if r["status"] == "open" and r["level"] != "INFO"]
    rev: list[Line] = []
    if resolved:
        rev.append(Line("Resolved: " + " · ".join(resolved)))
    if unverified:
        rev.append(Line("Unverified at approval: " + " · ".join(unverified), True))
    if unresolved:
        rev.append(Line("Not resolved: " + " · ".join(unresolved)))
    if not rev:
        rev.append(Line("No review items."))

    h = short_hash(note_hash(note))
    when = f" on {approved_at:%d %B %Y %H:%M}" if approved_at else ""
    footer = (
        f"AI-assisted draft generated by Mediscribe; reviewed, edited and approved by "
        f"{approver}{when}. Version {h}. Mediscribe keeps no copy of this note."
    )
    return Document(
        title="CARDIOLOGY OUTPATIENT CONSULTATION NOTE",
        demo_line="DEMONSTRATION – FICTIONAL PATIENT" if demo else None,
        header_rows=rows,
        sections=sections,
        review=rev,
        footer=footer,
        short_hash=h,
    )
