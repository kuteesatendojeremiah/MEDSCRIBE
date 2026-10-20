import type { ReactNode } from 'react'
import { stepIndex } from '../session/selectors'
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

export function Shell({
  state,
  user = null,
  info = null,
  viewStep = null,
  onStep,
  onSignOut,
  onAdmin,
  showSteps = true,
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
  children: ReactNode
}) {
  const step = stepIndex(state.phase)
  const draftLabel = draftBadge(state.phase)
  const inSession =
    state.phase !== 'idle' && state.phase !== 'ended' && state.phase !== 'terminal_error'
  return (
    <>
      <header className="topbar">
        <span className="brand">MEDISCRIBE</span>
        {inSession && <span className="chip-light">Session {state.setup.tempRef} · temporary</span>}
        <span className="spacer" />
        {info && (
          <span
            className={info.speech === 'local' ? 'engine-badge local' : 'engine-badge mock'}
            data-testid="engine-badge"
            title={
              info.speech === 'local'
                ? 'Audio is transcribed on this computer. Nothing is sent over the internet.'
                : 'Transcription is simulated: any audio returns the same demonstration consultation.'
            }
          >
            {info.speech === 'local'
              ? `Local speech model (${info.speech_model}) · audio stays on this computer`
              : 'MOCK transcription · any audio returns the demo consultation'}
          </span>
        )}
        {draftLabel && <span className="chip-light">{draftLabel}</span>}
        <span className="demo-badge">DEMONSTRATION · FICTIONAL PATIENT</span>
        {user && (
          <span className="user-menu" data-testid="user-menu">
            <span className="chip-light">
              {user.name} · {user.role}
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
          {([1, 2, 3, 4, 5] as Step[]).map((n) => {
            const cls =
              'step' +
              (n === step ? ' current' : n < step ? ' done' : '') +
              (viewStep === n ? ' viewing' : '')
            return (
              <button
                key={n}
                type="button"
                className={cls}
                aria-current={n === step ? 'step' : undefined}
                aria-pressed={viewStep === n}
                data-testid={`step-${n}`}
                onClick={() => onStep?.(n)}
              >
                {n < step ? '✓ ' : `${n} `}
                {STEP_TITLES[n]}
              </button>
            )
          })}
        </nav>
      )}
      <main className="content">{children}</main>
    </>
  )
}

function draftBadge(phase: Phase): string | null {
  if (phase === 'review' || phase === 'preview') return 'AI DRAFT – not yet approved'
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

/** A role dropdown styled like the role chip: who spoke this segment (clinician decides, §7.2). */
export function RoleSelect({
  role,
  onChange,
  label,
}: {
  role: SpeakerRole
  onChange: (r: SpeakerRole) => void
  label: string
}) {
  return (
    <select
      className={`role role-select role-${role}`}
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
  )
}
