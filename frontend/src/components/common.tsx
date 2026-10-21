import { useId, useState, type ReactNode } from 'react'
import { stepIndex } from '../session/selectors'
import { sessionStore } from '../session/store'
import { msUntilTimeout, formatClock } from '../session/timers'
import { useNow } from '../session/hooks'
import type { AuthUser, ServerInfo } from '../api/client'
import { STEP_TITLES, type Step } from '../session/navigation'
import type { Phase, SessionState, SpeakerRole } from '../session/types'

export const ROLE_LABEL: Record<SpeakerRole, string> = {
  doctor: 'Doctor',
  patient: 'Patient',
  relative: 'Relative',
  other_clinician: 'Other clinician',
  interpreter: 'Interpreter',
  unknown: 'Unknown',
}

export const ROLE_ORDER: SpeakerRole[] = [
  'doctor',
  'patient',
  'relative',
  'other_clinician',
  'interpreter',
  'unknown',
]

export function mmss(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      M
    </span>
  )
}

/** Live countdown to the inactivity timeout (§6.2); same values as the session timers. */
function SessionClock({ lastActivityAt }: { lastActivityAt: number }) {
  const now = useNow()
  const left = msUntilTimeout(lastActivityAt, now)
  const level = left < 60_000 ? 'critical' : left < 120_000 ? 'warn' : 'ok'
  // Announce only when the level changes, not every second.
  const spoken =
    level === 'critical'
      ? 'Session expires in less than one minute'
      : level === 'warn'
        ? 'Session expires in less than two minutes'
        : ''
  return (
    <>
      <span
        className={`chip-light session-clock${level === 'ok' ? '' : ` ${level}`}`}
        data-testid="session-clock"
        title="Time left before the session ends for inactivity"
      >
        Session {formatClock(left)}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {spoken}
      </span>
    </>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function demoStrip(info: ServerInfo | null): string {
  const engine =
    info?.speech === 'local'
      ? `local speech model (${info.speech_model}) · audio stays on this computer`
      : 'mock transcription (any audio returns the demo consultation)'
  return `Demo mode · fictional patient · ${engine}`
}

export function Shell({
  state,
  user = null,
  info = null,
  viewStep = null,
  onStep,
  onSignOut,
  onAdmin,
  showSteps = true,
  screen,
  children,
}: {
  state: SessionState
  user?: AuthUser | null
  info?: ServerInfo | null
  viewStep?: Step | null
  onStep?: (n: Step) => void
  onSignOut?: () => void
  onAdmin?: () => void
  showSteps?: boolean
  screen?: string
  children: ReactNode
}) {
  const step = stepIndex(state.phase)
  const draftLabel = draftBadge(state.phase)
  const inSession =
    state.phase !== 'idle' && state.phase !== 'ended' && state.phase !== 'terminal_error'
  return (
    <>
      <header className="topbar">
        <span className="brand">
          <BrandMark />
          Mediscribe
        </span>
        {inSession && (
          <span className="chip-light chip-ref" title="Temporary reference (not stored)">
            {state.setup.tempRef ? `Ref ${state.setup.tempRef} · temporary` : 'Ref · temporary'}
          </span>
        )}
        {draftLabel && <span className="chip-light">{draftLabel}</span>}
        <span className="spacer" />
        <span className="chip-light" data-testid="engine-badge" title={demoStrip(info)}>
          {info?.speech === 'local' ? 'Demo mode' : 'Demo · mock transcription'}
          <span className="sr-only"> · {demoStrip(info)}</span>
        </span>
        {user && inSession && state.lastActivityAt !== null && (
          <SessionClock lastActivityAt={state.lastActivityAt} />
        )}
        {user && (
          <span className="user-menu" data-testid="user-menu">
            <span className="chip-light">
              {user.name} · {user.role === 'admin' ? 'Admin' : 'Doctor'}
            </span>
            {user.role === 'admin' && onAdmin && (
              <button
                type="button"
                className="topbar-btn"
                onClick={onAdmin}
                disabled={inSession}
                title={inSession ? 'End the current session first' : 'Manage doctor accounts'}
              >
                Doctors
              </button>
            )}
            {inSession && (
              <button
                type="button"
                className="topbar-btn"
                data-testid="clear-session"
                onClick={() => {
                  const risk =
                    !state.exported && state.phase !== 'capture'
                      ? ' The unsaved draft will be lost.'
                      : ''
                  if (
                    window.confirm(
                      `Clear this session? Audio, transcript and note are removed from this tab.${risk}`,
                    )
                  )
                    sessionStore.dispatch({ type: 'END_SESSION' })
                }}
              >
                Clear session
              </button>
            )}
            {onSignOut && (
              <button type="button" className="topbar-btn" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </span>
        )}
      </header>
      {showSteps && (
        <nav className="stepper" aria-label="Progress">
          <ol>
            {([1, 2, 3, 4, 5] as Step[]).map((n) => {
              const status = n === step ? ' current' : n < step ? ' done' : ''
              const cls = 'step' + status + (viewStep === n ? ' viewing' : '')
              return (
                <li key={n} className={n < step ? 'done' : undefined}>
                  <button
                    type="button"
                    className={cls}
                    aria-current={n === step ? 'step' : undefined}
                    aria-pressed={viewStep === n}
                    data-testid={`step-${n}`}
                    onClick={() => onStep?.(n)}
                  >
                    <span className="step-dot" aria-hidden="true">
                      {n < step ? <CheckIcon /> : n}
                    </span>
                    <span className="step-label">
                      <span className="sr-only">
                        Step {n}
                        {n < step ? ' (completed)' : ''}:{' '}
                      </span>
                      {STEP_TITLES[n]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="stepper-compact" aria-hidden="true">
            Step {step} of 5 · <b>{STEP_TITLES[step as Step]}</b>
            <div className="progress">
              <span style={{ width: `${(step / 5) * 100}%` }} />
            </div>
          </div>
        </nav>
      )}
      <main className={`content${screen ? ` screen-${screen}` : ''}`}>{children}</main>
    </>
  )
}

export function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 8.2v4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="5.6" r="1" fill="currentColor" />
    </svg>
  )
}

/** A password input with a show/hide toggle. The label text is the field's accessible name. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'new-password' | 'current-password'
}) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        {autoComplete === 'new-password' ? (
          <input
            id={id}
            type={shown ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            required
          />
        ) : (
          <input
            id={id}
            type={shown ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="current-password"
            spellCheck={false}
            required
          />
        )}
        <button
          type="button"
          className="input-toggle"
          aria-pressed={shown}
          aria-label={shown ? 'Hide characters' : 'Show characters'}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

function draftBadge(phase: Phase): string | null {
  if (phase === 'review' || phase === 'preview') return 'AI draft · not approved'
  if (phase === 'approved') return 'Approved version'
  return null
}

export function RoleChip({ role, onClick }: { role: SpeakerRole; onClick?: () => void }) {
  const cls = `role role-${role}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title="Click to reassign">
      {ROLE_LABEL[role]}
    </button>
  ) : (
    <span className={cls}>{ROLE_LABEL[role]}</span>
  )
}

export function InactivityNote({ state }: { state: SessionState }) {
  const now = useNow()
  if (state.lastActivityAt === null) return null
  return (
    <div className="notice amber">
      Session active · next inactivity check in{' '}
      {formatClock(msUntilTimeout(state.lastActivityAt, now))}
    </div>
  )
}

/** A role dropdown styled as a speaker chip: who spoke this segment (clinician decides, §7.2).
 * `suffix` is shown inside the chip, for example the "uncertain" marker. */
export function RoleSelect({
  role,
  onChange,
  label,
  uncertain = false,
  suffix,
}: {
  role: SpeakerRole
  onChange: (r: SpeakerRole) => void
  label: string
  uncertain?: boolean
  suffix?: ReactNode
}) {
  const tone = uncertain
    ? 'uncertain'
    : role === 'patient' || role === 'doctor' || role === 'relative'
      ? role
      : 'other'
  return (
    <span className={`chip chip-${tone}`}>
      <select
        className="role-select"
        value={role}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as SpeakerRole)}
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {suffix}
    </span>
  )
}
