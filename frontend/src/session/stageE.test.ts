// Stage E (§4.2, §12.1, FR-09, FR-10): any change after approval cancels the approval and returns to
// Review; an approval cannot be reached with an open HIGH item; draft and approved are distinct.
import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { emptyState, reduce, type SessionEvent } from './reducer'
import type { SessionState } from './types'

const run = (s: SessionState, e: SessionEvent, now = 1000): SessionState => reduce(s, { ...e, now })

function approved(): SessionState {
  let s = run(emptyState(), { type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A. Nankya' })
  s = run(s, { type: 'STOP' })
  s = run(s, { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
  for (const r of s.note!.review_items.filter((x) => x.level === 'HIGH')) {
    s = run(s, { type: 'MARK_UNVERIFIED', id: r.id })
  }
  s = run(s, { type: 'PREVIEW' })
  return run(s, { type: 'APPROVE' })
}

describe('edits after approval require re-approval', () => {
  const firstItem = (s: SessionState) => s.note!.items[0]
  const edits: Array<[string, (s: SessionState) => SessionEvent]> = [
    ['EDIT_NOTE_ITEM', (s) => ({ type: 'EDIT_NOTE_ITEM', id: firstItem(s).id, text: 'changed' })],
    ['ADD_NOTE_ITEM', () => ({ type: 'ADD_NOTE_ITEM', section: 'plan', text: 'new finding' })],
    ['DELETE_NOTE_ITEM', (s) => ({ type: 'DELETE_NOTE_ITEM', id: firstItem(s).id })],
    [
      'MOVE_NOTE_ITEM',
      (s) => ({
        type: 'MOVE_NOTE_ITEM',
        id: firstItem(s).id,
        section: firstItem(s).section === 'plan' ? 'history' : 'plan',
      }),
    ],
    [
      'EDIT_SEGMENT',
      (s) => ({ type: 'EDIT_SEGMENT', segmentId: s.transcript![0].id, text: 'fixed' }),
    ],
    [
      'REASSIGN_ROLE',
      (s) => ({
        type: 'REASSIGN_ROLE',
        segmentId: s.transcript![0].id,
        role: s.transcript![0].speaker_role === 'patient' ? 'doctor' : 'patient',
      }),
    ],
    [
      'EDIT_PATIENT',
      (s) => ({ type: 'EDIT_PATIENT', patient: { ...s.setup.patient, name: 'Changed Name' } }),
    ],
    ['REOPEN_FOR_EDIT', () => ({ type: 'REOPEN_FOR_EDIT' })],
  ]

  it.each(edits)('%s drops the approval and returns to review', (_name, make) => {
    const s = approved()
    expect(s.phase).toBe('approved')
    expect(s.approval).not.toBeNull()
    const next = run(s, make(s), 5000)
    expect(next.phase).toBe('review')
    expect(next.approval).toBeNull()
    expect(next.exported).toBe(false)
  })

  it('export cannot be marked done until the note is approved again', () => {
    const s = run(approved(), { type: 'ADD_NOTE_ITEM', section: 'plan', text: 'x' })
    expect(run(s, { type: 'DOWNLOAD_DONE' }).exported).toBe(false)
    expect(run(s, { type: 'APPROVE' }).phase).toBe('review') // approve needs Preview first
  })
})

describe('approval cannot be reached around an open HIGH item', () => {
  it('Preview and Approve are refused until HIGH items are opened and resolved', () => {
    let s = run(emptyState(), { type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A.' })
    s = run(s, { type: 'STOP' })
    s = run(s, { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
    expect(s.note!.review_items.some((r) => r.level === 'HIGH')).toBe(true)
    expect(run(s, { type: 'PREVIEW' }).phase).toBe('review')
    expect(run(s, { type: 'APPROVE' }).phase).toBe('review')
  })
})
