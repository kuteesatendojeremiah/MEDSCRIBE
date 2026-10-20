// Session state machine (Blueprint §6.1, §6.3, Figure 4). Pure: no clock, no I/O, no storage.
import { buildHeader } from './header'
import { noteHash, shortHash } from './hash'
import { canApprove, canPreview, isActive } from './selectors'
import { evaluateTimers } from './timers'
import { EMPTY_PATIENT } from './types'
import type {
  ExportFormat,
  Note,
  NoteItem,
  PatientDetails,
  ReviewStatus,
  Section,
  Segment,
  SessionState,
  Suggestion,
  Setup,
  SpeakerRole,
} from './types'

export const DEFAULT_SETUP: Setup = {
  template: 'cardiology',
  languages: 'English + Luganda (mixed)',
  present: ['Doctor', 'Patient'],
  tempRef: '',
  patient: { ...EMPTY_PATIENT },
  consent: false,
}

export function emptyState(): SessionState {
  return {
    phase: 'idle',
    format: 'docx',
    clinician: '',
    setup: { ...DEFAULT_SETUP, present: [...DEFAULT_SETUP.present] },
    paused: false,
    recordingMs: 0,
    recordingSince: null,
    transcript: null,
    suggestions: [],
    note: null,
    originals: {},
    openedReviewIds: [],
    approval: null,
    exported: false,
    startedAt: null,
    lastActivityAt: null,
    timeoutWarning: false,
    endReason: null,
    errorCode: null,
  }
}

export type SessionEvent =
  | { type: 'START_SESSION'; setup: Setup; clinician?: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'PROCESS_OK'; transcript: Segment[]; note: Note }
  | { type: 'RECOVERABLE_ERROR'; code: string }
  | { type: 'RETRY' }
  | { type: 'CONTINUE_MANUAL' }
  | { type: 'TERMINAL_ERROR'; code: string }
  | { type: 'ACK_TERMINAL' }
  | { type: 'OPEN_REVIEW_ITEM'; id: string }
  | { type: 'RESOLVE_ITEM'; id: string; text: string }
  | { type: 'MARK_UNVERIFIED'; id: string }
  | { type: 'EDIT_NOTE_ITEM'; id: string; text: string }
  | { type: 'TRANSCRIPT_READY'; transcript: Segment[]; suggestions?: Suggestion[] }
  | { type: 'APPLY_SUGGESTION'; id: string }
  | { type: 'DISMISS_SUGGESTION'; id: string }
  | { type: 'REPLACE_NOTE'; note: Note }
  | { type: 'EDIT_PATIENT'; patient: PatientDetails }
  | { type: 'ADD_NOTE_ITEM'; section: Section; text: string }
  | { type: 'DELETE_NOTE_ITEM'; id: string }
  | { type: 'MOVE_NOTE_ITEM'; id: string; section: Section }
  | { type: 'EDIT_SEGMENT'; segmentId: string; text: string }
  | { type: 'ACKNOWLEDGE_ITEM'; id: string }
  | { type: 'SET_FORMAT'; format: ExportFormat }
  | { type: 'REOPEN_FOR_EDIT' }
  | { type: 'REASSIGN_ROLE'; segmentId: string; role: SpeakerRole }
  | { type: 'ASSIGN_VOICE_ROLES'; roles: Record<number, SpeakerRole> }
  | { type: 'PREVIEW' }
  | { type: 'BACK_TO_EDIT' }
  | { type: 'APPROVE' }
  | { type: 'DOWNLOAD_DONE' }
  | { type: 'DISCARD' }
  | { type: 'END_SESSION' }
  | { type: 'TIMEOUT' }
  | { type: 'CLEAN_START' }
  | { type: 'ACTIVITY' }
  | { type: 'HEARTBEAT' }
  | { type: 'TICK' }

/** Events are stamped with `now` by the store, so the reducer stays deterministic. */
export type StampedEvent = SessionEvent & { now: number }

function ended(reason: NonNullable<SessionState['endReason']>, code: string | null = null) {
  return { ...emptyState(), phase: 'ended' as const, endReason: reason, errorCode: code }
}

export function blankNote(s: SessionState, now: number): Note {
  return {
    header: buildHeader(s.setup, s.clinician, s.startedAt ?? now),
    items: [],
    review_items: [],
  }
}

const EDITABLE = ['review', 'preview', 'approved']

function approvalFor(note: Note, now: number) {
  const fullHash = noteHash(note)
  return { versionHash: shortHash(fullHash), fullHash, approvedAt: now }
}

function nextManualId(note: Note): string {
  const used = note.items
    .map((i) => /^m-(\d+)$/.exec(i.id)?.[1])
    .filter(Boolean)
    .map(Number)
  return `m-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`
}

/** Any change to the note or transcript invalidates approval and returns to Review (B5, FR-10). */
function touched(s: SessionState): SessionState {
  const phase = s.phase === 'preview' || s.phase === 'approved' ? 'review' : s.phase
  return { ...s, phase, approval: null, exported: false }
}

function expired(s: SessionState, now: number) {
  return isActive(s.phase) && evaluateTimers(s.startedAt, s.lastActivityAt, now) === 'timeout'
}

function transition(s: SessionState, e: StampedEvent): SessionState {
  const { now } = e
  switch (e.type) {
    case 'START_SESSION':
      if ((s.phase !== 'idle' && s.phase !== 'ended') || !e.setup.consent) return s
      return {
        ...emptyState(),
        setup: e.setup,
        clinician: e.clinician ?? '',
        phase: 'capture',
        recordingSince: now,
        startedAt: now,
        lastActivityAt: now,
      }
    case 'PAUSE':
      if (s.phase !== 'capture' || s.paused || s.recordingSince === null) return s
      return {
        ...s,
        paused: true,
        recordingMs: s.recordingMs + (now - s.recordingSince),
        recordingSince: null,
      }
    case 'RESUME':
      if (s.phase !== 'capture' || !s.paused) return s
      return { ...s, paused: false, recordingSince: now }
    case 'STOP': {
      if (s.phase !== 'capture') return s
      const ms =
        s.recordingSince === null ? s.recordingMs : s.recordingMs + (now - s.recordingSince)
      return { ...s, phase: 'processing', paused: false, recordingMs: ms, recordingSince: null }
    }
    case 'TRANSCRIPT_READY':
      if (s.phase !== 'processing') return s
      return { ...s, transcript: e.transcript, suggestions: e.suggestions ?? [] }
    case 'PROCESS_OK':
      if (s.phase !== 'processing') return s
      return { ...s, phase: 'review', transcript: e.transcript, note: e.note, errorCode: null }
    case 'RECOVERABLE_ERROR':
      if (s.phase !== 'processing') return s
      return { ...s, phase: 'recoverable_error', errorCode: e.code }
    case 'RETRY':
      if (s.phase !== 'recoverable_error') return s
      return { ...s, phase: 'processing', errorCode: null }
    case 'CONTINUE_MANUAL':
      if (s.phase !== 'recoverable_error') return s
      return { ...s, phase: 'review', errorCode: null, note: s.note ?? blankNote(s, now) }
    case 'TERMINAL_ERROR':
      if (!isActive(s.phase)) return s
      return { ...emptyState(), phase: 'terminal_error', endReason: 'terminal', errorCode: e.code }
    case 'ACK_TERMINAL':
      if (s.phase !== 'terminal_error') return s
      return ended('terminal', s.errorCode)
    case 'OPEN_REVIEW_ITEM':
      if (s.phase !== 'review' || !s.note?.review_items.some((r) => r.id === e.id)) return s
      if (s.openedReviewIds.includes(e.id)) return s
      return { ...s, openedReviewIds: [...s.openedReviewIds, e.id] }
    case 'RESOLVE_ITEM':
    case 'MARK_UNVERIFIED': {
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const ri = s.note.review_items.find((r) => r.id === e.id)
      if (!ri) return s
      const opened = s.openedReviewIds.includes(e.id)
        ? s.openedReviewIds
        : [...s.openedReviewIds, e.id]
      let items = s.note.items
      let originals = s.originals
      if (e.type === 'RESOLVE_ITEM' && ri.item_id) {
        const orig = items.find((i) => i.id === ri.item_id)
        if (orig) {
          originals = { ...originals, [orig.id]: originals[orig.id] ?? orig }
          const entered: NoteItem = { ...orig, text: e.text, source: { type: 'clinician_entered' } }
          items = items.map((i) => (i.id === orig.id ? entered : i))
        }
      }
      const status: ReviewStatus = e.type === 'RESOLVE_ITEM' ? 'resolved' : 'unverified'
      const review_items = s.note.review_items.map((r) => (r.id === e.id ? { ...r, status } : r))
      return touched({
        ...s,
        openedReviewIds: opened,
        originals,
        note: { ...s.note, items, review_items },
      })
    }
    case 'EDIT_NOTE_ITEM': {
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const orig = s.note.items.find((i) => i.id === e.id)
      if (!orig) return s
      const source =
        orig.source.type === 'clinician_entered'
          ? orig.source
          : { type: 'clinician_edited' as const }
      const items = s.note.items.map((i) => (i.id === e.id ? { ...i, text: e.text, source } : i))
      return touched({
        ...s,
        originals: { ...s.originals, [orig.id]: s.originals[orig.id] ?? orig },
        note: { ...s.note, items },
      })
    }
    case 'EDIT_PATIENT': {
      // Fix a typo in the patient's details after the session started: updates the setup and the note
      // header together, and (like any change to the note) cancels an approval.
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const header = buildHeader(
        { ...s.setup, patient: e.patient },
        s.clinician,
        s.startedAt ?? now,
      )
      return touched({
        ...s,
        setup: { ...s.setup, patient: e.patient },
        note: { ...s.note, header: { ...s.note.header, patient: header.patient } },
      })
    }
    case 'REPLACE_NOTE': {
      // Regenerate the draft from the (corrected) transcript: typed findings and review progress
      // are discarded, approval is cleared, and the transcript is kept.
      if (!EDITABLE.includes(s.phase)) return s
      return touched({ ...s, note: e.note, originals: {}, openedReviewIds: [] })
    }
    case 'DISMISS_SUGGESTION':
      return { ...s, suggestions: s.suggestions.filter((g) => g.id !== e.id) }
    case 'APPLY_SUGGESTION': {
      // The clinician accepted a suggested correction: replace the heard phrase in that segment.
      const g = s.suggestions.find((x) => x.id === e.id)
      if (!g || !s.transcript || !EDITABLE.includes(s.phase)) return s
      const rest = s.suggestions.filter((x) => x.id !== e.id)
      let applied = false
      const transcript = s.transcript.map((t) => {
        if (t.id !== g.segment_id) return t
        const key = g.field === 'english' ? 'english_text' : 'original_text'
        const current = t[key]
        if (current === null || !current.includes(g.heard)) return t
        applied = true
        return { ...t, [key]: current.replace(g.heard, g.suggest) }
      })
      return applied
        ? touched({ ...s, transcript, suggestions: rest })
        : { ...s, suggestions: rest }
    }
    case 'ADD_NOTE_ITEM': {
      if (!s.note || !EDITABLE.includes(s.phase) || !e.text.trim()) return s
      const item: NoteItem = {
        id: nextManualId(s.note),
        section: e.section,
        body_system: null,
        text: e.text.trim(),
        polarity: 'present',
        certainty: 'confirmed',
        time: null,
        source: { type: 'clinician_entered' },
      }
      return touched({ ...s, note: { ...s.note, items: [...s.note.items, item] } })
    }
    case 'DELETE_NOTE_ITEM': {
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const orig = s.note.items.find((i) => i.id === e.id)
      if (!orig) return s
      // Review items about a deleted item stay (unlinked) so a HIGH flag can never be bypassed.
      const review_items = s.note.review_items.map((r) =>
        r.item_id === e.id ? { ...r, item_id: null } : r,
      )
      return touched({
        ...s,
        originals: { ...s.originals, [orig.id]: s.originals[orig.id] ?? orig },
        note: { ...s.note, items: s.note.items.filter((i) => i.id !== e.id), review_items },
      })
    }
    case 'MOVE_NOTE_ITEM': {
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const orig = s.note.items.find((i) => i.id === e.id)
      if (!orig || orig.section === e.section) return s
      const source =
        orig.source.type === 'clinician_entered'
          ? orig.source
          : { type: 'clinician_edited' as const }
      const items = s.note.items.map((i) =>
        i.id === e.id ? { ...i, section: e.section, source } : i,
      )
      return touched({
        ...s,
        originals: { ...s.originals, [orig.id]: s.originals[orig.id] ?? orig },
        note: { ...s.note, items },
      })
    }
    case 'EDIT_SEGMENT': {
      if (!s.transcript || !EDITABLE.includes(s.phase)) return s
      const text = e.text.trim()
      if (!text) return s
      const transcript = s.transcript.map((t) =>
        t.id === e.segmentId
          ? t.english_text !== null
            ? { ...t, english_text: text }
            : { ...t, original_text: text }
          : t,
      )
      return touched({ ...s, transcript })
    }
    case 'ACKNOWLEDGE_ITEM': {
      if (!s.note || !EDITABLE.includes(s.phase)) return s
      const ri = s.note.review_items.find((r) => r.id === e.id)
      if (!ri || ri.level === 'HIGH') return s // HIGH items must be resolved or marked unverified
      const review_items = s.note.review_items.map((r) =>
        r.id === e.id ? { ...r, status: 'resolved' as const } : r,
      )
      return touched({ ...s, note: { ...s.note, review_items } })
    }
    case 'SET_FORMAT':
      return EDITABLE.includes(s.phase) ? { ...s, format: e.format } : s
    case 'REOPEN_FOR_EDIT':
      return s.phase === 'approved' ? touched(s) : s
    case 'REASSIGN_ROLE': {
      if (!s.transcript || !EDITABLE.includes(s.phase)) return s
      const transcript = s.transcript.map((t) =>
        t.id === e.segmentId ? { ...t, speaker_role: e.role } : t,
      )
      return touched({ ...s, transcript })
    }
    case 'ASSIGN_VOICE_ROLES': {
      // The clinician decided who each voice is; applied to every segment with that voice.
      if (!s.transcript || !EDITABLE.includes(s.phase)) return s
      let changed = false
      const transcript = s.transcript.map((t) => {
        const role = t.voice != null ? e.roles[t.voice] : undefined
        if (!role || role === t.speaker_role) return t
        changed = true
        return { ...t, speaker_role: role }
      })
      return changed ? touched({ ...s, transcript }) : s
    }
    case 'PREVIEW':
      if (s.phase !== 'review' || !canPreview(s)) return s
      return { ...s, phase: 'preview' }
    case 'BACK_TO_EDIT':
      if (s.phase !== 'preview') return s
      return { ...s, phase: 'review' }
    case 'APPROVE':
      if (s.phase !== 'preview' || !s.note || !canApprove(s)) return s
      return {
        ...s,
        phase: 'approved',
        approval: approvalFor(s.note, now),
      }
    case 'DOWNLOAD_DONE':
      if (s.phase !== 'approved') return s
      return { ...s, exported: true }
    case 'DISCARD':
      return s.phase === 'review' ? ended('discard') : s
    case 'END_SESSION':
      return isActive(s.phase) ? ended('end') : s
    case 'TIMEOUT':
      return isActive(s.phase) ? ended('timeout') : s
    case 'CLEAN_START':
      return s.phase === 'ended' ? emptyState() : s
    case 'ACTIVITY':
    case 'HEARTBEAT':
      return isActive(s.phase) ? { ...s, timeoutWarning: false } : s
    case 'TICK': {
      if (!isActive(s.phase)) return s
      const st = evaluateTimers(s.startedAt, s.lastActivityAt, now)
      if (st === 'timeout') return ended('timeout')
      return s.timeoutWarning === (st === 'warn') ? s : { ...s, timeoutWarning: st === 'warn' }
    }
  }
}

export function reduce(s: SessionState, e: StampedEvent): SessionState {
  // Once the inactivity or absolute limit has passed, nothing can revive the session (§6.2).
  if (e.type !== 'TIMEOUT' && expired(s, e.now)) return ended('timeout')
  const next = transition(s, e)
  // Any user-driven event is activity (§6.2); the TICK evaluation itself is not.
  if (e.type !== 'TICK' && isActive(next.phase) && (next !== s || e.type === 'ACTIVITY')) {
    return { ...next, lastActivityAt: e.now }
  }
  return next
}
