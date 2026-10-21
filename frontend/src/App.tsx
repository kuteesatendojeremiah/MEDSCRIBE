import { useCallback, useEffect, useRef, useState } from 'react'
import { audioBuffer } from './audio/buffer'
import { clearReadyFile } from './session/download'
import {
  authStatus,
  clearToken,
  getInfo,
  getUser,
  refreshToken,
  setUnauthorizedHandler,
  signOut,
  startOpenSession,
  type AuthStatus,
  type AuthUser,
  type ServerInfo,
} from './api/client'
import { Shell } from './components/common'
import { Admin } from './screens/Admin'
import { DownloadEnd } from './screens/DownloadEnd'
import { NewSession } from './screens/NewSession'
import { PreviewApprove } from './screens/PreviewApprove'
import { Record } from './screens/Record'
import { Review } from './screens/Review'
import { SignIn } from './screens/SignIn'
import { StepInfo } from './screens/StepInfo'
import { useSessionTimers, useUnloadGuard } from './session/hooks'
import { navigate, type Step } from './session/navigation'
import { isActive } from './session/selectors'
import { sessionStore, useSession } from './session/store'

const IDLE_SIGN_OUT_MS = 15 * 60_000 // §6.2: sign-in ends after 15 minutes without activity
const REFRESH_EVERY_MS = 60_000
const WAKING_NOTICE_MS = 3_000

export default function App() {
  const state = useSession()
  const [user, setUser] = useState<AuthUser | null>(getUser())
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openError, setOpenError] = useState(false)
  const [openTry, setOpenTry] = useState(0)
  const [waking, setWaking] = useState(false) // slow first response: a sleeping free-tier server
  const [view, setView] = useState<'consult' | 'admin'>('consult')
  const [viewStep, setViewStep] = useState<Step | null>(null)
  const lastInput = useRef(0)
  useSessionTimers()
  useUnloadGuard()

  const { phase } = state

  // Return to the current step whenever the session moves on.
  useEffect(() => {
    const id = window.setTimeout(() => setViewStep(null), 0)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    const slow = window.setTimeout(() => setWaking(true), WAKING_NOTICE_MS)
    authStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => window.clearTimeout(slow))
    getInfo()
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  // Demo deployments (ADR-0011): no sign-in form. A guest session starts by itself, and starts again
  // after expiry or Clear session.
  const open = status?.open_access === true
  useEffect(() => {
    if (!open || user) return
    let live = true
    startOpenSession()
      .then((u) => live && setUser(u))
      .catch(() => live && setOpenError(true))
    return () => {
      live = false
    }
  }, [open, user, openTry])

  // Audio is only needed until processing succeeds; drop it as soon as it is not (§10.2).
  useEffect(() => {
    if (phase !== 'capture' && phase !== 'processing' && phase !== 'recoverable_error') {
      audioBuffer.clear()
    }
    if (phase !== 'approved') clearReadyFile() // the rendered file never outlives its approval
  }, [phase])

  const leave = useCallback((message: string | null) => {
    clearToken()
    sessionStore.dispatch({ type: 'END_SESSION' })
    setUser(null)
    setView('consult')
    setNotice(message)
    authStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  // The server rejected our token (expired, revoked): sign out cleanly, clearing the consultation.
  useEffect(() => {
    setUnauthorizedHandler(() => leave('Your sign-in expired. Please sign in again.'))
    return () => setUnauthorizedHandler(null)
  }, [leave])

  // Keep the sign-in alive while the doctor is working; sign out after 15 idle minutes.
  useEffect(() => {
    if (!user) return
    lastInput.current = Date.now()
    const touch = () => {
      lastInput.current = Date.now()
    }
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    const id = window.setInterval(() => {
      const idle = Date.now() - lastInput.current
      if (idle >= IDLE_SIGN_OUT_MS && !isActive(sessionStore.getState().phase)) {
        leave('You were signed out after 15 minutes of inactivity.')
      } else if (document.visibilityState === 'visible' && idle < IDLE_SIGN_OUT_MS) {
        refreshToken().catch(() => undefined) // a 401 triggers the unauthorized handler
      }
    }, REFRESH_EVERY_MS)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
      window.clearInterval(id)
    }
  }, [user, leave])

  const doSignOut = async () => {
    if (
      isActive(phase) &&
      !window.confirm('Signing out clears the current consultation. Continue?')
    )
      return
    await signOut()
    leave(null)
  }

  const onStep = (n: Step) => {
    const nav = navigate(state, n)
    if (nav.kind === 'current') return setViewStep(null)
    if (nav.kind === 'go') {
      if (nav.confirm && !window.confirm(nav.confirm)) return
      nav.events.forEach((e) => sessionStore.dispatch(e))
      return setViewStep(null)
    }
    setViewStep(n)
  }

  // ---- not signed in ------------------------------------------------------------------------------
  if (!user && open) {
    return (
      <Shell state={state} info={info} showSteps={false}>
        <section className="card auth-card signin" role="status" data-testid="auto-start">
          {openError ? (
            <>
              <h2>Could not start a session</h2>
              <p className="muted">
                The server did not answer. This can take up to a minute to wake.
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setOpenError(false)
                  setOpenTry((n) => n + 1)
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <h2>Starting a temporary session…</h2>
              <p className="muted">
                {waking
                  ? 'The server is waking up. This can take up to a minute.'
                  : 'No account is needed and nothing is saved.'}
              </p>
            </>
          )}
        </section>
      </Shell>
    )
  }

  if (!user) {
    return (
      <Shell state={state} info={info} showSteps={false}>
        <SignIn
          status={status}
          notice={
            notice ??
            (waking && !status ? 'The server is waking up. This can take up to a minute.' : null)
          }
          onSignedIn={(u) => {
            setNotice(null)
            setUser(u)
          }}
        />
      </Shell>
    )
  }

  // ---- administrator screen -----------------------------------------------------------------------------
  if (view === 'admin' && user.role === 'admin') {
    return (
      <Shell state={state} user={user} info={info} showSteps={false} onSignOut={doSignOut}>
        <Admin me={user} onClose={() => setView('consult')} />
      </Shell>
    )
  }

  const warning = state.timeoutWarning && (
    <div className="notice amber timeout-warning" role="alert">
      Your session will expire soon because of inactivity.{' '}
      <button
        type="button"
        className="btn small primary"
        onClick={() => sessionStore.dispatch({ type: 'ACTIVITY' })}
      >
        I&apos;m still here
      </button>
    </div>
  )

  const peek = viewStep ? navigate(state, viewStep) : null
  let screen
  if (peek && peek.kind === 'info') {
    screen = (
      <StepInfo data={peek.info} state={state} info={info} onBack={() => setViewStep(null)} />
    )
  } else {
    switch (phase) {
      case 'capture':
      case 'processing':
      case 'recoverable_error':
        screen = <Record state={state} />
        break
      case 'review':
        screen = <Review state={state} />
        break
      case 'preview':
        screen = <PreviewApprove state={state} />
        break
      case 'approved':
        screen = <DownloadEnd state={state} />
        break
      default:
        screen = (
          <NewSession
            key={state.endReason ?? 'fresh'}
            endReason={state.endReason}
            errorCode={state.errorCode}
            terminal={phase === 'terminal_error'}
            signedIn
            clinician={user.name}
            askName={open}
          />
        )
    }
  }

  const screenName =
    phase === 'review'
      ? 'review'
      : phase === 'preview'
        ? 'preview'
        : phase === 'approved'
          ? 'download'
          : phase === 'capture' || phase === 'processing' || phase === 'recoverable_error'
            ? 'record'
            : 'new'

  return (
    <Shell
      state={state}
      user={user}
      info={info}
      screen={screenName}
      viewStep={viewStep}
      onStep={onStep}
      onSignOut={open ? undefined : doSignOut}
      onAdmin={() => setView('admin')}
    >
      {warning}
      {screen}
    </Shell>
  )
}
