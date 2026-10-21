// Stage C (§6.1, §6.3): processing stages, no duplicate submissions, invalid transitions refused.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audioBuffer } from '../audio/buffer'
import { reduce, emptyState, DEFAULT_SETUP } from './reducer'
import { processingStage } from './selectors'
import { createSessionStore } from './store'
import type { SessionEvent } from './reducer'
import type { SessionState } from './types'

const setup = { ...DEFAULT_SETUP, consent: true, tempRef: 'T-1' }
const step = (s: SessionState, e: SessionEvent, now = 1000) => reduce(s, { ...e, now })

describe('processing stages', () => {
  it('is transcribing until a transcript exists, then generating', () => {
    let s = step(emptyState(), { type: 'START_SESSION', setup })
    s = step(s, { type: 'STOP' }, 2000)
    expect(s.phase).toBe('processing')
    expect(processingStage(s)).toBe('transcribing')
    s = step(s, { type: 'TRANSCRIPT_READY', transcript: [] }, 2100)
    expect(processingStage(s)).toBe('generating')
  })
})

describe('invalid transitions are ignored', () => {
  it('cannot start without consent, stop when idle, approve or download from review', () => {
    expect(step(emptyState(), { type: 'START_SESSION', setup: DEFAULT_SETUP }).phase).toBe('idle')
    expect(step(emptyState(), { type: 'STOP' }).phase).toBe('idle')
    let s = step(emptyState(), { type: 'START_SESSION', setup })
    expect(step(s, { type: 'APPROVE' }).phase).toBe('capture')
    expect(step(s, { type: 'DOWNLOAD_DONE' }).exported).toBe(false)
    s = step(s, { type: 'STOP' }, 2000)
    expect(step(s, { type: 'STOP' }, 2100)).toBe(s) // a second Stop is a no-op
  })

  it('pause only while capturing, and clearing returns to a clean state', () => {
    const idle = emptyState()
    expect(step(idle, { type: 'PAUSE' })).toBe(idle)
    let s = step(idle, { type: 'START_SESSION', setup })
    s = step(s, { type: 'PAUSE' }, 2000)
    expect(s.paused).toBe(true)
    s = step(s, { type: 'END_SESSION' }, 3000)
    expect(s.phase).toBe('ended')
    expect(s.transcript).toBeNull()
    expect(s.note).toBeNull()
  })
})

describe('duplicate submissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    audioBuffer.clear()
  })

  it('a second runPipeline while one is running joins it (audio is sent once)', async () => {
    audioBuffer.set(new Blob(['x'], { type: 'audio/webm' }))
    let release: (r: Response) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { runPipeline } = await import('./pipeline')
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup })
    store.dispatch({ type: 'STOP' })
    const a = runPipeline(store)
    const b = runPipeline(store)
    expect(b).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(new Response(JSON.stringify({ error: 'E_X', class: 'recoverable' }), { status: 502 }))
    await a
    expect(store.getState().phase).toBe('recoverable_error')
  })

  it('a second download click joins the render in progress', async () => {
    const { downloadApproved } = await import('./download')
    const store = createSessionStore()
    const a = downloadApproved(store)
    const b = downloadApproved(store)
    expect(b).toBe(a)
    expect(await a).toEqual({ ok: false, code: 'E_NOT_APPROVED' })
  })
})
