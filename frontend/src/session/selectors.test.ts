import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { emptyState, reduce, type SessionEvent } from './reducer'
import {
  approvalChecklist,
  canApprove,
  canPreview,
  hasUnexportedDraft,
  missingVitals,
  stepIndex,
} from './selectors'
import type { SessionState } from './types'

const run = (s: SessionState, e: SessionEvent): SessionState => reduce(s, { ...e, now: 1000 })
const review = () => {
  let s = run(emptyState(), { type: 'START_SESSION', setup: katoSetup })
  s = run(s, { type: 'STOP' })
  return run(s, { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
}

describe('selectors', () => {
  it('no draft → nothing to warn about, preview locked', () => {
    const s = emptyState()
    expect(hasUnexportedDraft(s)).toBe(false)
    expect(canPreview(s)).toBe(false)
  })
  it('an active unexported session warns on unload (FR-14)', () => {
    expect(hasUnexportedDraft(review())).toBe(true)
  })
  it('canPreview needs opened HIGH items; canApprove also needs them dispositioned', () => {
    let s = review()
    expect(canPreview(s)).toBe(false)
    s = run(run(s, { type: 'OPEN_REVIEW_ITEM', id: 'r-001' }), {
      type: 'OPEN_REVIEW_ITEM',
      id: 'r-002',
    })
    expect(canPreview(s)).toBe(true)
    expect(canApprove(s)).toBe(false)
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    expect(canApprove(s)).toBe(true)
  })
  it('stepIndex maps phases to the five screens', () => {
    expect(stepIndex('idle')).toBe(1)
    expect(stepIndex('capture')).toBe(2)
    expect(stepIndex('processing')).toBe(2)
    expect(stepIndex('review')).toBe(3)
    expect(stepIndex('preview')).toBe(4)
    expect(stepIndex('approved')).toBe(5)
  })
  it('missing vitals for the Kato case are RR, SpO₂ and temperature (§18.3)', () => {
    expect(missingVitals(katoDraftNote())).toEqual(['RR', 'SpO₂', 'Temperature'])
  })
  it('checklist reports open HIGH items as not ok, then ok when handled', () => {
    let s = review()
    expect(approvalChecklist(s).some((l) => !l.ok)).toBe(true)
    s = run(run(s, { type: 'OPEN_REVIEW_ITEM', id: 'r-001' }), {
      type: 'OPEN_REVIEW_ITEM',
      id: 'r-002',
    })
    s = run(run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' }), {
      type: 'MARK_UNVERIFIED',
      id: 'r-002',
    })
    const lines = approvalChecklist(s)
    expect(lines.every((l) => l.ok)).toBe(true)
    expect(lines[0].label).toBe('All 2 HIGH review items opened')
  })
})
