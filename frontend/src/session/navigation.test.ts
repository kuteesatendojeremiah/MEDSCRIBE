// Clickable steps: every step opens something, and navigation never bypasses a safety rule.
import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { navigate, requirementsFor, statusOf } from './navigation'
import { emptyState, reduce, type SessionEvent } from './reducer'
import type { SessionState } from './types'

const run = (s: SessionState, e: SessionEvent): SessionState => reduce(s, { ...e, now: 1000 })
const capture = () => run(emptyState(), { type: 'START_SESSION', setup: katoSetup })
const review = () => {
  let s = run(capture(), { type: 'STOP' })
  s = run(s, { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
  return s
}
const handled = (s: SessionState) =>
  run(
    run(
      run(run(s, { type: 'OPEN_REVIEW_ITEM', id: 'r-001' }), {
        type: 'OPEN_REVIEW_ITEM',
        id: 'r-002',
      }),
      {
        type: 'MARK_UNVERIFIED',
        id: 'r-001',
      },
    ),
    { type: 'MARK_UNVERIFIED', id: 'r-002' },
  )
const approved = () => run(run(handled(review()), { type: 'PREVIEW' }), { type: 'APPROVE' })

describe('every step opens something', () => {
  it('before a session starts, steps 2-5 open information views explaining what is needed', () => {
    for (const step of [2, 3, 4, 5] as const) {
      const nav = navigate(emptyState(), step)
      expect(nav.kind).toBe('info')
      if (nav.kind === 'info') {
        expect(nav.info.status).toBe('locked')
        expect(nav.info.purpose.length).toBeGreaterThan(20)
        expect(nav.info.requirements.some((r) => !r.ok)).toBe(true)
      }
    }
  })

  it('the current step is simply shown', () => {
    expect(navigate(emptyState(), 1).kind).toBe('current')
    expect(navigate(review(), 3).kind).toBe('current')
  })

  it('earlier steps are "done" and open a summary', () => {
    const nav = navigate(review(), 1)
    expect(nav.kind).toBe('info')
    if (nav.kind === 'info') expect(nav.info.status).toBe('done')
    expect(statusOf(review(), 2)).toBe('done')
  })
})

describe('navigation never bypasses a safety rule', () => {
  it('Preview from Review is refused (info only) until every HIGH item is opened', () => {
    const nav = navigate(review(), 4)
    expect(nav.kind).toBe('info')
    if (nav.kind === 'info') {
      const labels = nav.info.requirements.map((r) => r.label).join(' | ')
      expect(labels).toContain('HIGH review item opened (0 of 2)'.replace('item', 'item'))
    }
  })

  it('Preview from Review navigates once HIGH items are opened', () => {
    const s = run(run(review(), { type: 'OPEN_REVIEW_ITEM', id: 'r-001' }), {
      type: 'OPEN_REVIEW_ITEM',
      id: 'r-002',
    })
    expect(navigate(s, 4)).toEqual({ kind: 'go', events: [{ type: 'PREVIEW' }] })
  })

  it('Download is never reachable before approval', () => {
    expect(navigate(review(), 5).kind).toBe('info')
    const preview = run(handled(review()), { type: 'PREVIEW' })
    expect(navigate(preview, 5).kind).toBe('info')
  })

  it('back to Review from Preview is free; from Approved it asks first and cancels approval', () => {
    const preview = run(handled(review()), { type: 'PREVIEW' })
    expect(navigate(preview, 3)).toEqual({ kind: 'go', events: [{ type: 'BACK_TO_EDIT' }] })
    const nav = navigate(approved(), 3)
    expect(nav.kind).toBe('go')
    if (nav.kind === 'go') {
      expect(nav.events).toEqual([{ type: 'REOPEN_FOR_EDIT' }])
      expect(nav.confirm).toMatch(/cancels the approval/i)
    }
  })

  it('opening Record, New session or Preview while approved changes nothing (info only)', () => {
    for (const step of [1, 2, 4] as const) expect(navigate(approved(), step).kind).toBe('info')
  })

  it('requirements are computed from the real state', () => {
    const r = requirementsFor(handled(review()), 4)
    expect(r.every((x) => x.ok)).toBe(true)
  })
})
