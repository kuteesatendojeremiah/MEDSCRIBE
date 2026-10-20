"""Pydantic mirror of note_schema.json (Blueprint v3.0, Appendix A). Source tag is mandatory (§4.2)."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Section(str, Enum):  # §4.1
    history = "history"
    meds_allergies = "meds_allergies"
    vitals = "vitals"
    exam = "exam"
    investigations = "investigations"
    assessment = "assessment"
    treatment = "treatment"
    plan = "plan"


class BodySystem(str, Enum):
    general = "general"
    cvs = "cvs"
    resp = "resp"
    gi = "gi"
    renal = "renal"
    neuro = "neuro"
    msk = "msk"
    other = "other"


class Polarity(str, Enum):
    present = "present"
    absent = "absent"


class Certainty(str, Enum):
    confirmed = "confirmed"
    possible = "possible"
    rule_out = "rule_out"


class SourceType(str, Enum):  # §4.2
    segment = "segment"
    clinician_entered = "clinician_entered"
    clinician_edited = "clinician_edited"


class SpeakerRole(str, Enum):  # §7.2
    doctor = "doctor"
    patient = "patient"
    relative = "relative"
    other_clinician = "other_clinician"
    interpreter = "interpreter"
    unknown = "unknown"


class ReviewLevel(str, Enum):  # §4.4
    HIGH = "HIGH"
    CHECK = "CHECK"
    INFO = "INFO"


class ReviewStatus(str, Enum):
    open = "open"
    resolved = "resolved"
    unverified = "unverified"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Patient(_Strict):
    """Patient introduction details, typed by the clinician (ADR-0007). Tab memory and the export only."""

    name: Optional[str] = Field(default=None, max_length=120)
    age: Optional[str] = Field(default=None, max_length=20)  # text: "58", "6 months"
    sex: Optional[str] = Field(default=None, max_length=20)
    file_number: Optional[str] = Field(default=None, max_length=40)
    residence: Optional[str] = Field(default=None, max_length=120)


class Header(_Strict):
    patient_label: Optional[str] = None  # ADR-0001: free text, kept for older notes
    patient: Optional[Patient] = None  # ADR-0007: structured details
    clinic: str
    datetime: str
    clinician: str
    temp_ref: str
    languages: list[str]
    present: list[str]
    consent_statement: str


class Source(_Strict):
    type: SourceType
    segment_id: Optional[str] = None
    speaker_role: Optional[SpeakerRole] = None

    @model_validator(mode="after")
    def _segment_needs_ids(self):
        if self.type == SourceType.segment and not (self.segment_id and self.speaker_role):
            raise ValueError("segment source requires segment_id and speaker_role")
        return self


class Item(_Strict):
    id: str = Field(min_length=1)
    section: Section
    body_system: Optional[BodySystem] = None
    text: str = Field(min_length=1)
    polarity: Polarity
    certainty: Certainty
    time: Optional[str] = None
    source: Source


class ReviewItem(_Strict):
    id: str = Field(min_length=1)
    level: ReviewLevel
    item_id: Optional[str]
    reason: str = Field(min_length=1)
    status: ReviewStatus


class Approval(_Strict):
    approved_by: str
    approved_at: str
    version_hash: str


class Note(_Strict):
    header: Header
    items: list[Item]
    review_items: list[ReviewItem]
    approval: Optional[Approval] = None
