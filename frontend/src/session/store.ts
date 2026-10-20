// In-memory session store (Blueprint §5.2). No persistence of any kind: state dies with the tab.
import { useSyncExternalStore } from 'react'
import { realClock, type Clock } from './clock'
import { createMetrics, evalModeEnabled } from './evalMetrics'
import { emptyState, reduce, type SessionEvent, type StampedEvent } from './reducer'
import type { SessionState } from './types'

export type Observer = (event: StampedEvent, before: SessionState, after: SessionState) => void

export function createSessionStore(clock: Clock = realClock, observer?: Observer) {
  let state: SessionState = emptyState()
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispatch(event: SessionEvent) {
      const stamped = { ...event, now: clock.now() } as StampedEvent
      const next = reduce(state, stamped)
      observer?.(stamped, state, next)
      if (next !== state) {
        state = next
        listeners.forEach((l) => l())
      }
    },
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>

/** Content-free evaluation metrics, only when evaluation mode is switched on (Phase 6). */
export const evalMetrics = evalModeEnabled() ? createMetrics() : null
if (evalMetrics) {
  ;(window as unknown as { __mediscribeEval: unknown }).__mediscribeEval = {
    snapshot: evalMetrics.snapshot,
  }
}

export const sessionStore = createSessionStore(realClock, evalMetrics?.observe)

export function useSession(store: SessionStore = sessionStore): SessionState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
