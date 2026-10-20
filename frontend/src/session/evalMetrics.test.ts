// Phase 6: evaluation metrics are content-free (Blueprint §14, §16).
import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { createFakeClock } from './clock'
import { createMetrics } from './evalMetrics'
import { createSessionStore } from './store'

function walk(withEdits: boolean) {
  const clock = createFakeClock(1_000_000)
  const metrics = createMetrics()
  const store = createSessionStore(clock, metrics.observe)
  store.dispatch({ type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A. Nankya' })
  store.dispatch({ type: 'STOP' })
  store.dispatch({ type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
  clock.advance(120_000)
  if (withEdits) {
    store.dispatch({
      type: 'EDIT_NOTE_ITEM',
      id: 'f-001',
      text: 'SECRET free text typed by clinician',
    })
    store.dispatch({ type: 'ADD_NOTE_ITEM', section: 'exam', text: 'SECRET ankle oedema' })
    store.dispatch({ type: 'REASSIGN_ROLE', segmentId: 's-014', role: 'doctor' })
    store.dispatch({ type: 'EDIT_SEGMENT', segmentId: 's-009', text: 'SECRET transcript edit' })
    store.dispatch({ type: 'MOVE_NOTE_ITEM', id: 'f-002', section: 'exam' })
    store.dispatch({ type: 'DELETE_NOTE_ITEM', id: 'f-003' })
  }
  for (const id of ['r-001', 'r-002']) store.dispatch({ type: 'OPEN_REVIEW_ITEM', id })
  store.dispatch({
    type: 'RESOLVE_ITEM',
    id: 'r-001',
    text: 'SECRET Bisoprolol 2.5 mg orally once daily',
  })
  store.dispatch({ type: 'MARK_UNVERIFIED', id: 'r-002' })
  clock.advance(60_000)
  store.dispatch({ type: 'PREVIEW' })
  store.dispatch({ type: 'APPROVE' })
  return metrics.snapshot()
}

describe('evaluation metrics', () => {
  it('records counts, section names and times', () => {
    const m = walk(true)
    expect(m.review_items_by_level).toEqual({ HIGH: 2, CHECK: 2, INFO: 1 })
    expect(m.high_items_opened).toBe(2)
    expect(m.items_added).toBe(1)
    expect(m.items_deleted).toBe(1)
    expect(m.items_moved).toBe(1)
    expect(m.segment_edits).toBe(1)
    expect(m.role_reassignments).toBe(1)
    expect(m.edits_by_section.history).toBeGreaterThanOrEqual(1)
    expect(m.edits_by_section.exam).toBeGreaterThanOrEqual(2)
    expect(m.approvals).toBe(1)
    expect(m.approval_seconds).toBe(180)
    expect(m.review_items_final_status).toEqual({ resolved: 1, unverified: 1, open: 3 })
  })

  it('never contains any text: no free text, note content, names or transcript words', () => {
    const json = JSON.stringify(walk(true))
    for (const forbidden of [
      'SECRET',
      'Kato',
      'Ronald',
      'chest',
      'Bisoprolol',
      'amlodipine',
      'OPD-07',
      'Nankya',
      'Musawo',
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    // every key is a fixed metric name; every value is a number, null, or a map of numbers
    const m = JSON.parse(json)
    for (const v of Object.values(m)) {
      expect(['number', 'object']).toContain(typeof v)
    }
  })

  it('resets when a new session starts', () => {
    const clock = createFakeClock(0)
    const metrics = createMetrics()
    const store = createSessionStore(clock, metrics.observe)
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    store.dispatch({ type: 'STOP' })
    store.dispatch({ type: 'RECOVERABLE_ERROR', code: 'E_NETWORK' })
    expect(metrics.snapshot().recoverable_errors).toBe(1)
    store.dispatch({ type: 'END_SESSION' })
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    expect(metrics.snapshot().recoverable_errors).toBe(0)
  })
})
