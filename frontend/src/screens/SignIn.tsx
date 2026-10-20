// Sign-in (Blueprint §3 step 1, FR-01, §10.4). Doctors sign in with accounts created by their hospital
// administrator. On first run the first administrator account is created here. Identity only: no
// clinical content is involved, and passwords are never kept in the browser.
import { useState } from 'react'
import {
  ApiFailure,
  demoLogin,
  login,
  setupFirstAccount,
  type AuthStatus,
  type AuthUser,
} from '../api/client'
import { PasswordField } from '../components/common'

const MESSAGES: Record<string, string> = {
  E_BAD_CREDENTIALS: 'Wrong username or password.',
  E_TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes and try again.',
  E_USERNAME_INVALID:
    'Username: 3–32 characters, lower-case letters, digits, dot, dash or underscore.',
  E_NAME_INVALID: 'Enter the name that should be printed on notes (for example “Dr. A. Nankya”).',
  E_PASSWORD_WEAK: 'Password must be at least 10 characters.',
  E_NETWORK: 'Cannot reach the server. Check that Mediscribe is running.',
  E_SETUP_DONE: 'An administrator already exists. Sign in instead.',
}
/** Usernames are lower-case with no spaces: typing "Sheila Nakafeero" becomes "sheila.nakafeero". */
export const normalizeUsername = (v: string) => v.toLowerCase().replace(/\s+/g, '.')

const say = (e: unknown) =>
  e instanceof ApiFailure
    ? (MESSAGES[e.code] ?? `Could not sign in (${e.code}).`)
    : 'Could not sign in.'

export function SignIn({
  status,
  onSignedIn,
  notice,
}: {
  status: AuthStatus | null
  onSignedIn: (u: AuthUser) => void
  notice?: string | null
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setup = status?.setup_needed ?? false

  const run = async (fn: () => Promise<AuthUser>) => {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await fn())
      setPassword('')
      setConfirm('')
    } catch (e) {
      setError(say(e))
    } finally {
      setBusy(false)
    }
  }

  const longEnough = password.length >= 10
  const matches = confirm.length > 0 && password === confirm
  const submitClass = `btn primary block${busy ? ' loading' : ''}`

  return (
    <section className="card auth-card signin">
      <h2>{setup ? 'Set up Mediscribe' : 'Sign in'}</h2>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="notice red" role="alert" data-testid="form-error">
          {error}
        </div>
      )}
      {setup ? (
        <>
          <p className="muted">
            No accounts exist yet. Create the first administrator account; it can then add accounts
            for the doctors.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (password !== confirm) return setError('The two passwords do not match.')
              void run(() => setupFirstAccount(username, name, password))
            }}
          >
            <div className="field">
              <label htmlFor="su-name">Your name as printed on notes</label>
              <input
                id="su-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="su-user">Username (lower-case, no spaces)</label>
              <input
                id="su-user"
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div>
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <ul className="rules">
                <li className={longEnough ? 'ok' : undefined}>At least 10 characters</li>
              </ul>
            </div>
            <div>
              <PasswordField
                label="Repeat password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              <ul className="rules" aria-live="polite">
                <li className={matches ? 'ok' : undefined}>Passwords match</li>
              </ul>
            </div>
            <button type="submit" className={submitClass} disabled={busy} aria-busy={busy}>
              Create administrator account
            </button>
          </form>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => login(username, password))
          }}
        >
          <div className="field">
            <label htmlFor="si-user">Username</label>
            <input
              id="si-user"
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              autoComplete="username"
              spellCheck={false}
              required
            />
          </div>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
          <button type="submit" className={submitClass} disabled={busy} aria-busy={busy}>
            Sign in
          </button>
        </form>
      )}
      {status?.demo_login && (
        <div className="demo-signin">
          <p className="muted small">Testing only (turned on by the server):</p>
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => void run(() => demoLogin('Dr. A. Nankya'))}
          >
            Continue with demo account
          </button>
        </div>
      )}
      <p className="auth-note">
        {setup
          ? 'Your account only identifies you on the notes you approve. '
          : 'Accounts are created by your hospital administrator; ask them to reset a forgotten password. '}
        Nothing clinical is stored by Mediscribe, and you are signed out after 15 minutes of
        inactivity.
      </p>
    </section>
  )
}
