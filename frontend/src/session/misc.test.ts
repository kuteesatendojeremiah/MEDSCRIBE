import { describe, expect, it } from 'vitest'
import { katoDraftNote, katoExpectedNote, katoTranscript } from '../fixtures/kato'
import { createFakeClock } from './clock'
import { noteHash } from './hash'
import { neutralFileName } from './filename'
import { createSessionStore } from './store'
import { ABSOLUTE_MS, TIMEOUT_MS, WARN_MS, evaluateTimers, formatClock } from './timers'
import { katoSetup } from '../fixtures/kato'

describe('timers.evaluateTimers (§6.2)', () => {
  it('ok → warn at 13 min → timeout at 15 min', () => {
    expect(evaluateTimers(0, 0, WARN_MS - 1)).toBe('ok')
    expect(evaluateTimers(0, 0, WARN_MS)).toBe('warn')
    expect(evaluateTimers(0, 0, TIMEOUT_MS)).toBe('timeout')
  })
  it('absolute limit wins over recent activity', () => {
    expect(evaluateTimers(0, ABSOLUTE_MS - 1, ABSOLUTE_MS)).toBe('timeout')
  })
  it('formats mm:ss', () => {
    expect(formatClock(118_000)).toBe('01:58')
    expect(formatClock(-5)).toBe('00:00')
  })
})

describe('hash placeholder', () => {
  it('is stable and changes with any content change', () => {
    const a = noteHash(katoDraftNote())
    expect(noteHash(katoDraftNote())).toBe(a)
    const changed = katoDraftNote()
    changed.items[0].text += '.'
    expect(noteHash(changed)).not.toBe(a)
  })
  it('ignores key order', () => {
    const n = katoDraftNote()
    const reordered = JSON.parse(
      JSON.stringify({ review_items: n.review_items, items: n.items, header: n.header }),
    )
    expect(noteHash(reordered)).toBe(noteHash(n))
  })
})

describe('neutral file name (§10.2)', () => {
  it('matches the blueprint pattern and contains no patient detail', () => {
    const d = new Date(2026, 9, 19, 10, 38)
    expect(neutralFileName(d, 'docx')).toBe('consultation_note_2026-10-19_1038.docx')
    expect(neutralFileName(d, 'pdf')).toBe('consultation_note_2026-10-19_1038.pdf')
    expect(neutralFileName(d, 'docx')).not.toMatch(/kato|ronald/i)
  })
})

describe('store with an injected clock', () => {
  it('stamps events and times the session out without real waiting', () => {
    const clock = createFakeClock(5000)
    const store = createSessionStore(clock)
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    expect(store.getState().phase).toBe('capture')
    clock.advance(TIMEOUT_MS)
    store.dispatch({ type: 'TICK' })
    expect(store.getState().phase).toBe('ended')
  })
  it('notifies subscribers only on change and supports unsubscribe', () => {
    const store = createSessionStore(createFakeClock())
    let n = 0
    const off = store.subscribe(() => n++)
    store.dispatch({ type: 'STOP' }) // invalid while idle
    expect(n).toBe(0)
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    expect(n).toBe(1)
    off()
    store.dispatch({ type: 'END_SESSION' })
    expect(n).toBe(1)
  })
})

describe('Kato fixtures (§18)', () => {
  it('transcript has 15 segments with ids matching the note sources', () => {
    expect(katoTranscript).toHaveLength(15)
    const ids = new Set(katoTranscript.map((s) => s.id))
    for (const i of katoExpectedNote.items) {
      if (i.source.segment_id) expect(ids.has(i.source.segment_id)).toBe(true)
    }
  })
  it('the wife’s report is attributed to the relative (§7.2)', () => {
    expect(katoTranscript.find((s) => s.id === 's-005')!.speaker_role).toBe('relative')
    const item = katoExpectedNote.items.find((i) => i.id === 'f-004')!
    expect(item.source.speaker_role).toBe('relative')
  })
  it('the draft differs from the expected note only in bisoprolol and review statuses', () => {
    const draft = katoDraftNote()
    const diffItems = draft.items.filter(
      (i, idx) => JSON.stringify(i) !== JSON.stringify(katoExpectedNote.items[idx]),
    )
    expect(diffItems.map((i) => i.id)).toEqual(['f-016'])
    expect(draft.review_items.every((r) => r.status === 'open')).toBe(true)
    expect(draft.header).toEqual(katoExpectedNote.header)
  })
})
