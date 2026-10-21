// Component and hook tests: consent gate (FR-02), HIGH-item opening (FR-09), timers (§6.2),
// unload warning (FR-14).
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { katoDraftNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { NewSession } from '../screens/NewSession'
import { useSessionTimers, useUnloadGuard } from '../session/hooks'
import { createSessionStore, sessionStore } from '../session/store'
import { ReviewFooter, ReviewItemsPanel } from './ReviewItemsPanel'

afterEach(() => {
  cleanup()
  sessionStore.dispatch({ type: 'END_SESSION' })
  vi.useRealTimers()
})

describe('NewSession (FR-02)', () => {
  it('Start is disabled until consent is ticked, then starts a session', () => {
    render(<NewSession endReason={null} errorCode={null} terminal={false} clinician="Dr. Test" />)
    const start = screen.getByRole('button', {
      name: /continue to recording/i,
    }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(sessionStore.getState().phase).toBe('capture')
    expect(sessionStore.getState().setup.consent).toBe(true)
  })

  it('clinical text fields turn spellcheck and autocomplete off (§10.2)', () => {
    render(<NewSession endReason={null} errorCode={null} terminal={false} />)
    for (const name of [
      /temporary reference/i,
      /full name/i,
      /file \/ opd number/i,
      /residence/i,
    ]) {
      const input = screen.getByLabelText(name)
      expect(input.getAttribute('spellcheck')).toBe('false')
      expect(input.getAttribute('autocomplete')).toBe('off')
    }
  })

  it('shows a timeout message after a timed-out session', () => {
    render(<NewSession endReason="timeout" errorCode={null} terminal={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/timed out/i)
  })
})

function toReview() {
  sessionStore.dispatch({ type: 'START_SESSION', setup: katoSetup })
  sessionStore.dispatch({ type: 'STOP' })
  sessionStore.dispatch({
    type: 'PROCESS_OK',
    transcript: katoTranscript,
    note: katoDraftNote(),
  })
}

describe('ReviewItemsPanel (FR-09)', () => {
  it('Preview stays disabled until each HIGH card has been opened', () => {
    toReview()
    const ui = () => (
      <>
        <ReviewItemsPanel state={sessionStore.getState()} />
        <ReviewFooter state={sessionStore.getState()} />
      </>
    )
    const { rerender } = render(ui())
    const preview = () =>
      screen.getByRole('button', { name: /continue to preview/i }) as HTMLButtonElement
    expect(preview().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /HIGH review item: Bisoprolol/i }))
    rerender(ui())
    expect(preview().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /HIGH review item: Amlodipine/i }))
    rerender(ui())
    expect(preview().disabled).toBe(false)
  })

  it('resolve is disabled without a value; unverified needs no value', () => {
    toReview()
    const { rerender } = render(<ReviewItemsPanel state={sessionStore.getState()} />)
    fireEvent.click(screen.getByRole('button', { name: /HIGH review item: Bisoprolol/i }))
    rerender(<ReviewItemsPanel state={sessionStore.getState()} />)
    const resolve = screen.getByRole('button', {
      name: /resolve with this value/i,
    }) as HTMLButtonElement
    expect(resolve.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/enter value/i), {
      target: { value: 'Bisoprolol 2.5 mg orally once daily' },
    })
    expect(resolve.disabled).toBe(false)
    fireEvent.click(resolve)
    const item = sessionStore.getState().note!.items.find((i) => i.id === 'f-016')!
    expect(item.source.type).toBe('clinician_entered')
  })
})

describe('useSessionTimers (§6.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  const liveStore = () => createSessionStore({ now: () => Date.now() })
  const setVisibility = (v: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })

  it('warns at 13 min and ends at 15 min when the tab is hidden (no heartbeat)', () => {
    setVisibility('hidden')
    const store = liveStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    renderHook(() => useSessionTimers(store))
    act(() => void vi.advanceTimersByTime(13 * 60_000))
    expect(store.getState().timeoutWarning).toBe(true)
    act(() => void vi.advanceTimersByTime(2 * 60_000))
    expect(store.getState().phase).toBe('ended')
    expect(store.getState().endReason).toBe('timeout')
  })

  it('a visible tab sends heartbeats that keep the session alive', () => {
    setVisibility('visible')
    const store = liveStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    renderHook(() => useSessionTimers(store))
    act(() => void vi.advanceTimersByTime(30 * 60_000))
    expect(store.getState().phase).toBe('capture')
  })

  it('the 2 h absolute limit still ends a visible session', () => {
    setVisibility('visible')
    const store = liveStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    renderHook(() => useSessionTimers(store))
    act(() => void vi.advanceTimersByTime(2 * 60 * 60_000 + 2000))
    expect(store.getState().phase).toBe('ended')
  })
})

describe('useUnloadGuard (FR-14)', () => {
  const fire = () => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('prompts only while an unexported draft exists', () => {
    const store = createSessionStore()
    renderHook(() => useUnloadGuard(store))
    expect(fire()).toBe(false)
    act(() => store.dispatch({ type: 'START_SESSION', setup: katoSetup }))
    expect(fire()).toBe(true)
    act(() => store.dispatch({ type: 'END_SESSION' }))
    expect(fire()).toBe(false)
  })
})
