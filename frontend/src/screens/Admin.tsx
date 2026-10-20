// Administrator screen: manage doctor accounts (identity only, no clinical content).
import { useCallback, useEffect, useState } from 'react'
import { PasswordField } from '../components/common'
import { normalizeUsername } from './SignIn'
import {
  ApiFailure,
  addUser,
  listUsers,
  removeUser,
  resetPassword,
  type AuthUser,
} from '../api/client'

const MESSAGES: Record<string, string> = {
  E_USERNAME_TAKEN: 'That username is already used.',
  E_USERNAME_INVALID:
    'Username: 3–32 characters, lower-case letters, digits, dot, dash or underscore.',
  E_NAME_INVALID: 'Enter the name to print on notes.',
  E_PASSWORD_WEAK: 'Password must be at least 10 characters.',
  E_LAST_ADMIN: 'You cannot remove the last administrator.',
  E_CANNOT_REMOVE_SELF: 'You cannot remove your own account.',
}
const say = (e: unknown) =>
  e instanceof ApiFailure ? (MESSAGES[e.code] ?? `Failed (${e.code}).`) : 'Failed.'

export function Admin({ me, onClose }: { me: AuthUser; onClose: () => void }) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers())
    } catch (e) {
      setError(say(e))
    }
  }, [])

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((e) => setError(say(e)))
  }, [])

  const act = async (fn: () => Promise<void>, ok: string) => {
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(ok)
      await refresh()
    } catch (e) {
      setError(say(e))
    }
  }

  return (
    <div className="grid two">
      <section className="card" data-testid="admin-users">
        <h2>Doctors</h2>
        <table className="summary-table users">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="link tiny"
                    onClick={() => {
                      const pw = window.prompt(
                        `New password for ${u.username} (at least 10 characters)`,
                      )
                      if (pw)
                        void act(
                          () => resetPassword(u.username, pw),
                          `Password reset for ${u.username}.`,
                        )
                    }}
                  >
                    Reset password
                  </button>
                  {u.username !== me.username && (
                    <button
                      type="button"
                      className="link tiny danger-link"
                      onClick={() => {
                        if (window.confirm(`Remove ${u.name}?`)) {
                          void act(() => removeUser(u.username), `${u.name} removed.`)
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {message && (
          <div className="notice green" role="status">
            {message}
          </div>
        )}
        {error && (
          <div className="notice red" role="alert">
            {error}
          </div>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <h3>Add a doctor</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void act(async () => {
                await addUser(username, name, password)
                setUsername('')
                setName('')
                setPassword('')
              }, 'Doctor added. Give them the username and password; they can ask you to reset it.')
            }}
          >
            <label>
              Name as printed on notes
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
            <PasswordField
              label="Temporary password (at least 10 characters)"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <button type="submit" className="btn primary" style={{ marginTop: 16 }}>
              Add doctor
            </button>
          </form>
        </section>
        <button type="button" className="btn outline" onClick={onClose}>
          ◂ Back to consultations
        </button>
      </aside>
    </div>
  )
}
