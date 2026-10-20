// Browser-side wiring for §6.2 (activity, heartbeat, timeout) and FR-14 (unload warning).
import { useEffect, useState } from 'react'
import { ApiFailure, refreshToken } from '../api/client'
import { realClock, type Clock } from './clock'
import { hasUnexportedDraft, isActive } from './selectors'
import { sessionStore, useSession, type SessionStore } from './store'
import { HEARTBEAT_MS } from './timers'

/** 1 s tick + 60 s heartbeat (only while the tab is visible) + user input as activity. */
export function useSessionTimers(store: SessionStore = sessionStore) {
  const active = isActive(useSession(store).phase)
  useEffect(() => {
    if (!active) return
    const tick = window.setInterval(() => store.dispatch({ type: 'TICK' }), 1000)
    const beat = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      store.dispatch({ type: 'HEARTBEAT' })
      // Renew the short-lived token with the heartbeat; the 2 h absolute cap still applies (§6.2).
      refreshToken().catch((e) => {
        if (e instanceof ApiFailure && e.klass === 'terminal') {
          store.dispatch({ type: 'TERMINAL_ERROR', code: e.code })
        }
      })
    }, HEARTBEAT_MS)
    let last = 0
    const onInput = () => {
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      store.dispatch({ type: 'ACTIVITY' })
    }
    window.addEventListener('pointerdown', onInput)
    window.addEventListener('keydown', onInput)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(beat)
      window.removeEventListener('pointerdown', onInput)
      window.removeEventListener('keydown', onInput)
    }
  }, [active, store])
}

/** FR-14: warn that closing or refreshing loses an unexported draft. */
export function useUnloadGuard(store: SessionStore = sessionStore) {
  const guard = hasUnexportedDraft(useSession(store))
  useEffect(() => {
    if (!guard) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [guard])
}

/** Re-renders every second with the current time, for countdowns and timers. */
export function useNow(clock: Clock = realClock): number {
  const [now, setNow] = useState(clock.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock.now()), 1000)
    return () => window.clearInterval(id)
  }, [clock])
  return now
}
