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

  return (
    <div className="signin-wrap">
      <section className="card signin">
        <h2>{setup ? 'Set up Mediscribe' : 'Sign in'}</h2>
        {notice && (
          <div className="notice amber" role="status">
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
              No accounts exist yet. Create the first administrator account. The administrator can
              then add accounts for the doctors.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (password !== confirm) return setError('The two passwords do not match.')
                void run(() => setupFirstAccount(username, name, password))
              }}
            >
              <label>
                Your name as printed on notes
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                Username (lower-case, no spaces)
                <input
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                Password (at least 10 characters)
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                Repeat password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
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
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                autoComplete="username"
                spellCheck={false}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                spellCheck={false}
                required
              />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              Sign in
            </button>
            <p className="muted small">
              Accounts are created by your hospital administrator. Forgotten password? Ask them to
              reset it.
            </p>
          </form>
        )}
        {status?.demo_login && (
          <div className="demo-signin">
            <p className="muted small">Testing only (turned on by the server):</p>
            <button
              type="button"
              className="btn outline small"
              disabled={busy}
              onClick={() => void run(() => demoLogin('Dr. A. Nankya'))}
            >
              Continue with demo account
            </button>
          </div>
        )}
      </section>
      <aside className="card muted small signin-note">
        <strong>About signing in</strong>
        <p>
          Your account identifies you on the notes you approve. Nothing about patients is linked to
          your account, and nothing clinical is stored by Mediscribe. You are signed out after 15
          minutes of inactivity.
        </p>
      </aside>
    </div>
  )
}
