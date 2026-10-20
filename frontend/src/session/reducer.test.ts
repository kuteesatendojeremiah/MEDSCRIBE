// One test per Figure 4 transition (Blueprint §6.1, §6.3). Synthetic fixtures only.
import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { emptyState, reduce, type SessionEvent } from './reducer'
import { ABSOLUTE_MS, TIMEOUT_MS, WARN_MS } from './timers'
import type { SessionState } from './types'

const T0 = 1_000_000
const run = (s: SessionState, e: SessionEvent, now = T0): SessionState => reduce(s, { ...e, now })

const started = () => run(emptyState(), { type: 'START_SESSION', setup: katoSetup })
const processing = () => run(started(), { type: 'STOP' })
const review = () =>
  run(processing(), { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
const openAllHigh = (s: SessionState) =>
  ['r-001', 'r-002'].reduce((a, id) => run(a, { type: 'OPEN_REVIEW_ITEM', id }), s)
const resolveAllHigh = (s: SessionState) =>
  run(run(s, { type: 'RESOLVE_ITEM', id: 'r-001', text: 'Bisoprolol 2.5 mg orally once daily' }), {
    type: 'MARK_UNVERIFIED',
    id: 'r-002',
  })
const preview = () => run(resolveAllHigh(openAllHigh(review())), { type: 'PREVIEW' })
const approved = () => run(preview(), { type: 'APPROVE' })

describe('Idle → Capture (start session + consent confirmed)', () => {
  it('starts when consent is given', () => {
    const s = started()
    expect(s.phase).toBe('capture')
    expect(s.startedAt).toBe(T0)
  })
  it('refuses to start without consent (FR-02)', () => {
    const s = run(emptyState(), {
      type: 'START_SESSION',
      setup: { ...katoSetup, consent: false },
    })
    expect(s.phase).toBe('idle')
  })
  it('cannot start while a session is active', () => {
    const s = run(review(), { type: 'START_SESSION', setup: katoSetup })
    expect(s.phase).toBe('review')
  })
})

describe('Capture', () => {
  it('pause and resume track recording time', () => {
    const paused = run(started(), { type: 'PAUSE' }, T0 + 5000)
    expect(paused.paused).toBe(true)
    expect(paused.recordingMs).toBe(5000)
    const resumed = run(paused, { type: 'RESUME' }, T0 + 9000)
    expect(resumed.paused).toBe(false)
    const stopped = run(resumed, { type: 'STOP' }, T0 + 12000)
    expect(stopped.recordingMs).toBe(8000)
  })
  it('Capture → Processing on stop', () => {
    expect(processing().phase).toBe('processing')
  })
  it('Capture → Terminal error (dashed edge)', () => {
    expect(run(started(), { type: 'TERMINAL_ERROR', code: 'E_INTEGRITY' }).phase).toBe(
      'terminal_error',
    )
  })
})

describe('Processing', () => {
  it('Processing → Review on success, with transcript and draft', () => {
    const s = review()
    expect(s.phase).toBe('review')
    expect(s.transcript).toHaveLength(15)
    expect(s.note?.items.length).toBeGreaterThan(0)
  })
  it('Processing → Recoverable error keeps what the tab holds (§6.3)', () => {
    const s = run(processing(), { type: 'RECOVERABLE_ERROR', code: 'E_PROVIDER_TIMEOUT' })
    expect(s.phase).toBe('recoverable_error')
    expect(s.setup.tempRef).toBe(katoSetup.tempRef)
    expect(s.errorCode).toBe('E_PROVIDER_TIMEOUT')
  })
  it('Recoverable error → Processing on retry', () => {
    const e = run(processing(), { type: 'RECOVERABLE_ERROR', code: 'E_NETWORK' })
    expect(run(e, { type: 'RETRY' }).phase).toBe('processing')
  })
  it('Recoverable error → Review on continue with manual entry', () => {
    const e = run(processing(), { type: 'RECOVERABLE_ERROR', code: 'E_NETWORK' })
    const s = run(e, { type: 'CONTINUE_MANUAL' })
    expect(s.phase).toBe('review')
    expect(s.note?.items).toEqual([])
  })
  it('Processing → Terminal error', () => {
    expect(run(processing(), { type: 'TERMINAL_ERROR', code: 'E_TOKEN' }).phase).toBe(
      'terminal_error',
    )
  })
})

describe('Review', () => {
  it('opening a HIGH item is recorded once', () => {
    const s = run(run(review(), { type: 'OPEN_REVIEW_ITEM', id: 'r-001' }), {
      type: 'OPEN_REVIEW_ITEM',
      id: 'r-001',
    })
    expect(s.openedReviewIds).toEqual(['r-001'])
  })
  it('Review → Preview is refused until every HIGH item is opened (FR-09)', () => {
    expect(run(review(), { type: 'PREVIEW' }).phase).toBe('review')
    const one = run(review(), { type: 'OPEN_REVIEW_ITEM', id: 'r-001' })
    expect(run(one, { type: 'PREVIEW' }).phase).toBe('review')
    expect(run(openAllHigh(review()), { type: 'PREVIEW' }).phase).toBe('preview')
  })
  it('resolving enters the value as clinician_entered and keeps the original (§4.2)', () => {
    const s = run(openAllHigh(review()), {
      type: 'RESOLVE_ITEM',
      id: 'r-001',
      text: 'Bisoprolol 2.5 mg orally once daily',
    })
    const item = s.note!.items.find((i) => i.id === 'f-016')!
    expect(item.source.type).toBe('clinician_entered')
    expect(s.originals['f-016'].source.type).toBe('segment')
    expect(s.note!.review_items.find((r) => r.id === 'r-001')!.status).toBe('resolved')
  })
  it('marking unverified keeps the item and flags it for the export (§4.4)', () => {
    const s = run(openAllHigh(review()), { type: 'MARK_UNVERIFIED', id: 'r-002' })
    expect(s.note!.review_items.find((r) => r.id === 'r-002')!.status).toBe('unverified')
  })
  it('editing an item tags it clinician_edited and keeps the original', () => {
    const s = run(review(), { type: 'EDIT_NOTE_ITEM', id: 'f-001', text: 'Chest pain for 4 days' })
    expect(s.note!.items.find((i) => i.id === 'f-001')!.source.type).toBe('clinician_edited')
    expect(s.originals['f-001'].text).toBe('Chest pain for 3 days')
  })
  it('Review → Ended on discard', () => {
    const s = run(review(), { type: 'DISCARD' })
    expect(s.phase).toBe('ended')
    expect(s.endReason).toBe('discard')
  })
  it('Review → Terminal error', () => {
    expect(run(review(), { type: 'TERMINAL_ERROR', code: 'E_HASH' }).phase).toBe('terminal_error')
  })
})

describe('Preview and Approved', () => {
  it('Preview → Review on back to edit', () => {
    expect(run(preview(), { type: 'BACK_TO_EDIT' }).phase).toBe('review')
  })
  it('Preview → Approved freezes a version hash', () => {
    const s = approved()
    expect(s.phase).toBe('approved')
    expect(s.approval?.versionHash).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/)
  })
  it('approval is refused while a HIGH item is still open (§12.1)', () => {
    const s = run(run(openAllHigh(review()), { type: 'PREVIEW' }), { type: 'APPROVE' })
    expect(s.phase).toBe('preview')
    expect(s.approval).toBeNull()
  })
  it('edit after approval returns to Review and clears approval (B5, FR-10)', () => {
    const s = run(approved(), {
      type: 'EDIT_NOTE_ITEM',
      id: 'f-001',
      text: 'Chest pain for 4 days',
    })
    expect(s.phase).toBe('review')
    expect(s.approval).toBeNull()
    expect(s.exported).toBe(false)
  })
  it('edit in Preview also resets to Review', () => {
    const s = run(preview(), { type: 'EDIT_NOTE_ITEM', id: 'f-001', text: 'x' })
    expect(s.phase).toBe('review')
  })
  it('role reassignment after approval resets approval', () => {
    const s = run(approved(), { type: 'REASSIGN_ROLE', segmentId: 's-014', role: 'doctor' })
    expect(s.phase).toBe('review')
    expect(s.approval).toBeNull()
  })
  it('the hash changes when the approved content changes', () => {
    const a = approved().approval!.versionHash
    const edited = run(approved(), { type: 'EDIT_NOTE_ITEM', id: 'f-001', text: 'Chest pain 4d' })
    const again = run(run(openAllHigh(edited), { type: 'PREVIEW' }), { type: 'APPROVE' })
    expect(again.approval!.versionHash).not.toBe(a)
  })
  it('download marks the draft exported', () => {
    expect(run(approved(), { type: 'DOWNLOAD_DONE' }).exported).toBe(true)
  })
  it('Approved → Ended on End (download confirmed → End)', () => {
    const s = run(run(approved(), { type: 'DOWNLOAD_DONE' }), { type: 'END_SESSION' })
    expect(s.phase).toBe('ended')
  })
})

describe('Review item acknowledgement, export format and reopening', () => {
  it('a CHECK item can be acknowledged; a HIGH item cannot', () => {
    const s = run(review(), { type: 'ACKNOWLEDGE_ITEM', id: 'r-003' })
    expect(s.note!.review_items.find((r) => r.id === 'r-003')!.status).toBe('resolved')
    const h = run(review(), { type: 'ACKNOWLEDGE_ITEM', id: 'r-001' })
    expect(h.note!.review_items.find((r) => r.id === 'r-001')!.status).toBe('open')
  })
  it('format can be chosen while reviewing and is cleared with the session', () => {
    const s = run(review(), { type: 'SET_FORMAT', format: 'pdf' })
    expect(s.format).toBe('pdf')
    expect(run(s, { type: 'END_SESSION' }).format).toBe('docx')
  })
  it('Approved → Review on explicit reopen, approval cleared (§6.1)', () => {
    const s = run(approved(), { type: 'REOPEN_FOR_EDIT' })
    expect(s.phase).toBe('review')
    expect(s.approval).toBeNull()
  })
})

describe('Ended, terminal error and clean start', () => {
  const emptyShell = (s: SessionState) => {
    expect(s.transcript).toBeNull()
    expect(s.note).toBeNull()
    expect(s.approval).toBeNull()
    expect(s.originals).toEqual({})
    expect(s.openedReviewIds).toEqual([])
    expect(s.setup).toEqual(emptyState().setup)
    expect(s.startedAt).toBeNull()
  }
  it('End clears every piece of content', () => {
    const s = run(approved(), { type: 'END_SESSION' })
    expect(s.phase).toBe('ended')
    emptyShell(s)
  })
  it('terminal error clears the draft and holds only a content-free code (§6.3)', () => {
    const s = run(approved(), { type: 'TERMINAL_ERROR', code: 'E_HASH_MISMATCH' })
    expect(s.phase).toBe('terminal_error')
    expect(s.errorCode).toBe('E_HASH_MISMATCH')
    emptyShell(s)
  })
  it('Terminal error → Ended → clean start (Idle)', () => {
    const t = run(review(), { type: 'TERMINAL_ERROR', code: 'E_TOKEN' })
    const e = run(t, { type: 'ACK_TERMINAL' })
    expect(e.phase).toBe('ended')
    expect(run(e, { type: 'CLEAN_START' })).toEqual(emptyState())
  })
  it('a new session may start straight from Ended', () => {
    const e = run(review(), { type: 'END_SESSION' })
    expect(run(e, { type: 'START_SESSION', setup: katoSetup }).phase).toBe('capture')
  })
  it('a new session carries nothing over from the previous one', () => {
    const e = run(approved(), { type: 'END_SESSION' })
    const next = run(e, { type: 'START_SESSION', setup: katoSetup })
    expect(next.note).toBeNull()
    expect(next.transcript).toBeNull()
    expect(next.approval).toBeNull()
  })
})

describe('Timeouts (§6.2, FR-16)', () => {
  it('Review → Ended after 15 min of inactivity', () => {
    const s = review()
    const t = reduce(s, { type: 'TICK', now: T0 + TIMEOUT_MS })
    expect(t.phase).toBe('ended')
    expect(t.endReason).toBe('timeout')
    expect(t.note).toBeNull()
  })
  it('warns at 13 min but does not end', () => {
    const t = reduce(review(), { type: 'TICK', now: T0 + WARN_MS })
    expect(t.phase).toBe('review')
    expect(t.timeoutWarning).toBe(true)
  })
  it('no warning before 13 min', () => {
    const t = reduce(review(), { type: 'TICK', now: T0 + WARN_MS - 1 })
    expect(t.timeoutWarning).toBe(false)
  })
  it("'I'm still here' (activity) clears the warning and restarts the clock", () => {
    const warned = reduce(review(), { type: 'TICK', now: T0 + WARN_MS })
    const alive = reduce(warned, { type: 'ACTIVITY', now: T0 + WARN_MS + 1000 })
    expect(alive.timeoutWarning).toBe(false)
    expect(reduce(alive, { type: 'TICK', now: T0 + TIMEOUT_MS + 500 }).phase).toBe('review')
  })
  it('heartbeat counts as activity (§6.2)', () => {
    const hb = reduce(review(), { type: 'HEARTBEAT', now: T0 + 10 * 60_000 })
    expect(reduce(hb, { type: 'TICK', now: T0 + 20 * 60_000 }).phase).toBe('review')
  })
  it('absolute 2 h limit ends the session even with constant activity', () => {
    let s = review()
    for (let t = 60_000; t < ABSOLUTE_MS; t += 60_000) {
      s = reduce(s, { type: 'HEARTBEAT', now: T0 + t })
    }
    expect(s.phase).toBe('review')
    expect(reduce(s, { type: 'HEARTBEAT', now: T0 + ABSOLUTE_MS }).phase).toBe('ended')
  })
  it('an expired session cannot be revived by late activity', () => {
    expect(reduce(review(), { type: 'ACTIVITY', now: T0 + TIMEOUT_MS + 1 }).phase).toBe('ended')
  })
  it('timeout applies in every active phase', () => {
    for (const s of [started(), processing(), preview(), approved()]) {
      expect(reduce(s, { type: 'TICK', now: T0 + TIMEOUT_MS }).phase).toBe('ended')
    }
  })
  it('explicit TIMEOUT event ends an active session', () => {
    expect(run(review(), { type: 'TIMEOUT' }).phase).toBe('ended')
  })
  it('ticks are ignored when idle', () => {
    expect(reduce(emptyState(), { type: 'TICK', now: T0 + ABSOLUTE_MS }).phase).toBe('idle')
  })
})

describe('Invalid transitions are ignored', () => {
  it('cannot approve from Review', () => {
    expect(run(review(), { type: 'APPROVE' }).phase).toBe('review')
  })
  it('cannot stop when idle', () => {
    expect(run(emptyState(), { type: 'STOP' }).phase).toBe('idle')
  })
  it('cannot download before approval', () => {
    expect(run(review(), { type: 'DOWNLOAD_DONE' }).exported).toBe(false)
  })
})
