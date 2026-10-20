// Session types (Blueprint §6.1, §4, Appendix A). Held in browser memory only (§5.2).

export type SpeakerRole =
  'doctor' | 'patient' | 'relative' | 'other_clinician' | 'interpreter' | 'unknown'

export type Section =
  | 'history'
  | 'meds_allergies'
  | 'vitals'
  | 'exam'
  | 'investigations'
  | 'assessment'
  | 'treatment'
  | 'plan'

export type ReviewLevel = 'HIGH' | 'CHECK' | 'INFO'
export type ReviewStatus = 'open' | 'resolved' | 'unverified'

export interface Segment {
  id: string
  start: number
  end: number
  lang: string
  original_text: string
  english_text: string | null
  speaker_role: SpeakerRole
  confidence: number
  /** Which voice this sounds like (1, 2). A hint for assigning roles, never a role. */
  voice?: number | null
}

/** A transcript word or phrase that looks like a misheard medical term. Offered, never applied. */
export interface Suggestion {
  id: string
  segment_id: string
  field: 'english' | 'original'
  heard: string
  suggest: string
  score: number
}

export interface Source {
  type: 'segment' | 'clinician_entered' | 'clinician_edited'
  segment_id?: string
  speaker_role?: SpeakerRole
}

export interface NoteItem {
  id: string
  section: Section
  body_system: string | null
  text: string
  polarity: 'present' | 'absent'
  certainty: 'confirmed' | 'possible' | 'rule_out'
  time: string | null
  source: Source
}

export interface ReviewItem {
  id: string
  level: ReviewLevel
  item_id: string | null
  reason: string
  status: ReviewStatus
}

/** Patient introduction details, typed by the clinician (ADR-0007). Tab memory and the export only. */
export interface PatientDetails {
  name: string
  age: string
  sex: string
  fileNumber: string
  residence: string
}

export const EMPTY_PATIENT: PatientDetails = {
  name: '',
  age: '',
  sex: '',
  fileNumber: '',
  residence: '',
}

export interface HeaderPatient {
  name?: string
  age?: string
  sex?: string
  file_number?: string
  residence?: string
}

export interface NoteHeader {
  patient_label?: string
  patient?: HeaderPatient
  clinic: string
  datetime: string
  clinician: string
  temp_ref: string
  languages: string[]
  present: string[]
  consent_statement: string
}

export interface Note {
  header: NoteHeader
  items: NoteItem[]
  review_items: ReviewItem[]
}

export interface Setup {
  template: string
  languages: string
  present: string[]
  tempRef: string
  patient: PatientDetails
  consent: boolean
}

export type Phase =
  | 'idle'
  | 'capture'
  | 'processing'
  | 'review'
  | 'preview'
  | 'approved'
  | 'recoverable_error'
  | 'terminal_error'
  | 'ended'

export type EndReason = 'end' | 'timeout' | 'discard' | 'terminal'

export interface Approval {
  /** Short display form, e.g. a3f9-27c1. */
  versionHash: string
  /** Full SHA-256 (64 hex) of the canonical note; sent to /render (FR-11). */
  fullHash: string
  approvedAt: number
}

export type ExportFormat = 'docx' | 'pdf'

export interface SessionState {
  phase: Phase
  format: ExportFormat
  /** Signed-in clinician's display name (identity only, §10.4). */
  clinician: string
  setup: Setup
  paused: boolean
  recordingMs: number
  recordingSince: number | null
  transcript: Segment[] | null
  suggestions: Suggestion[]
  note: Note | null
  /** Original items kept during the session when the clinician edits them (§4.2). */
  originals: Record<string, NoteItem>
  openedReviewIds: string[]
  approval: Approval | null
  exported: boolean
  startedAt: number | null
  lastActivityAt: number | null
  timeoutWarning: boolean
  endReason: EndReason | null
  /** Content-free error code only (§6.3, §10.1). */
  errorCode: string | null
}
