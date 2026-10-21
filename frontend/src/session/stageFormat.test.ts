// Switching format after approval must never serve a file rendered in the other format.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { clearReadyFile, downloadApproved, readyFile } from './download'
import { createSessionStore } from './store'

afterEach(() => {
  vi.unstubAllGlobals()
  clearReadyFile()
})

describe('format choice on the download screen', () => {
  it('renders again in the new format once the cached file is cleared', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url)
        return Promise.resolve(new Response(new Blob(['x']), { status: 200 }))
      }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    store.dispatch({ type: 'STOP' })
    store.dispatch({ type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
    for (const r of store.getState().note!.review_items.filter((x) => x.level === 'HIGH')) {
      store.dispatch({ type: 'MARK_UNVERIFIED', id: r.id })
    }
    store.dispatch({ type: 'PREVIEW' })
    store.dispatch({ type: 'APPROVE' })
    expect(store.getState().phase).toBe('approved')

    expect((await downloadApproved(store)).ok).toBe(true)
    expect(urls[0]).toContain('format=docx')
    expect(readyFile()?.name).toMatch(/\.docx$/)

    clearReadyFile()
    store.dispatch({ type: 'SET_FORMAT', format: 'pdf' })
    expect(store.getState().phase).toBe('approved') // changing format keeps the approval
    expect(store.getState().approval).not.toBeNull()
    expect((await downloadApproved(store)).ok).toBe(true)
    expect(urls[1]).toContain('format=pdf')
    expect(readyFile()?.name).toMatch(/\.pdf$/)
  })
})
