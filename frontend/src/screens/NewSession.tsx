// Screen 1 (Blueprint §8, Fig. 7). Start stays disabled until consent is ticked (FR-02).
import { useState } from 'react'
import { WARN_MS, TIMEOUT_MS } from '../session/timers'
import { DEFAULT_SETUP } from '../session/reducer'
import { sessionStore } from '../session/store'
import type { EndReason, Setup } from '../session/types'
import { InfoIcon } from '../components/common'

const LANGUAGES = [
  'English',
  'Luganda',
  'English + Luganda (mixed)',
  'Other local language + English',
]

const ENDED_MESSAGE: Record<EndReason, string> = {
  end: 'Session ended. Everything was cleared from this tab.',
  discard: 'Draft discarded. Everything was cleared from this tab.',
  timeout:
    'The session timed out. Everything was cleared from this tab; nothing is restored after a refresh.',
  terminal: 'A security or integrity error ended the session. Everything was cleared.',
}

export function NewSession({
  endReason,
  errorCode,
  terminal,
  signedIn = true,
  clinician = '',
  askName = false,
}: {
  endReason: EndReason | null
  errorCode: string | null
  terminal: boolean
  signedIn?: boolean
  clinician?: string
  /** Guest sessions have no account name, so the clinician types the name printed on the note. */
  askName?: boolean
}) {
  const [typedName, setTypedName] = useState('')
  const who = askName ? typedName.trim() : clinician
  const [setup, setSetup] = useState<Setup>({
    ...DEFAULT_SETUP,
    present: [...DEFAULT_SETUP.present],
  })
  const [adding, setAdding] = useState('')
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((s) => ({ ...s, [k]: v }))
  const setPatient = (p: Partial<Setup['patient']>) =>
    setSetup((s) => ({ ...s, patient: { ...s.patient, ...p } }))

  const addPerson = () => {
    const name = adding.trim()
    if (name && !setup.present.includes(name)) set('present', [...setup.present, name])
    setAdding('')
  }

  const reset = () => {
    setSetup({ ...DEFAULT_SETUP, present: [...DEFAULT_SETUP.present] })
    setAdding('')
  }

  return (
    <div className="grid two">
      <section className="card">
        {endReason && (
          <div className={`notice ${endReason === 'terminal' ? 'red' : 'green'}`} role="status">
            <span>
              {ENDED_MESSAGE[endReason]}
              {errorCode && (
                <>
                  {' '}
                  Error code: <code>{errorCode}</code>
                </>
              )}{' '}
              <button
                type="button"
                className="link"
                onClick={() =>
                  sessionStore.dispatch({ type: terminal ? 'ACK_TERMINAL' : 'CLEAN_START' })
                }
              >
                {terminal ? 'Acknowledge' : 'Dismiss'}
              </button>
            </span>
          </div>
        )}
        <h2>New temporary consultation</h2>
        <p className="helper" data-testid="ns-intro">
          Set up the consultation, confirm consent, then record. The note is drafted for you to
          review, correct and approve before anything can be downloaded.
        </p>
        <p className="selected-summary" data-testid="ns-selected" aria-live="polite">
          <span className="badge badge-ok">
            {setup.template === 'cardiology' ? 'Cardiology template' : setup.template}
          </span>{' '}
          <span className="badge badge-ok">{setup.languages}</span>
        </p>

        <div className="form-section first">
          <h3>Consultation</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ns-template">Note template</label>
              <select
                id="ns-template"
                value={setup.template}
                onChange={(e) => set('template', e.target.value)}
              >
                <option value="cardiology">Cardiology – outpatient consultation</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ns-lang">Expected language(s)</label>
              <select
                id="ns-lang"
                value={setup.languages}
                onChange={(e) => set('languages', e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field span-2">
              <label htmlFor="ns-ref">Temporary reference (not saved)</label>
              <input
                id="ns-ref"
                value={setup.tempRef}
                onChange={(e) => set('tempRef', e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="e.g. OPD-07"
              />
            </div>
          </div>
        </div>

        {askName && (
          <div className="form-section" data-testid="clinician-name">
            <div className="field">
              <label htmlFor="ns-clinician">
                Your name, as printed on the note <span className="opt req">required</span>
              </label>
              <input
                id="ns-clinician"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                maxLength={100}
                placeholder="e.g. Dr. A. Nankya"
              />
            </div>
          </div>
        )}

        <fieldset className="form-section plain-fieldset" data-testid="patient-details">
          <legend>
            <h3>Patient details</h3>
          </legend>
          <p className="helper">
            Typed by you and printed at the top of the note. Kept only in this tab. Optional.
          </p>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="ns-name">
                Full name <span className="opt">optional</span>
              </label>
              <input
                id="ns-name"
                value={setup.patient.name}
                onChange={(e) => setPatient({ name: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="ns-age">
                Age <span className="opt">optional</span>
              </label>
              <input
                id="ns-age"
                value={setup.patient.age}
                onChange={(e) => setPatient({ age: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={20}
                placeholder="e.g. 58"
              />
            </div>
            <div className="field">
              <label htmlFor="ns-sex">
                Sex <span className="opt">optional</span>
              </label>
              <select
                id="ns-sex"
                value={setup.patient.sex}
                onChange={(e) => setPatient({ sex: e.target.value })}
              >
                <option value="">Not stated</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ns-file">
                File / OPD number <span className="opt">optional</span>
              </label>
              <input
                id="ns-file"
                value={setup.patient.fileNumber}
                onChange={(e) => setPatient({ fileNumber: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={40}
              />
            </div>
            <div className="field">
              <label htmlFor="ns-res">
                Residence (village / district) <span className="opt">optional</span>
              </label>
              <input
                id="ns-res"
                value={setup.patient.residence}
                onChange={(e) => setPatient({ residence: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={120}
              />
            </div>
          </div>
        </fieldset>

        <div className="form-section">
          <h3>People present</h3>
          <div className="chips">
            {setup.present.map((p) => (
              <span key={p} className="person">
                {p}
                {p !== 'Doctor' && p !== 'Patient' && (
                  <button
                    type="button"
                    aria-label={`Remove ${p}`}
                    onClick={() =>
                      set(
                        'present',
                        setup.present.filter((x) => x !== p),
                      )
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            <input
              className="add-person"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPerson())}
              placeholder="+ add"
              aria-label="Add person present"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>
            Consent <span className="opt req">required</span>
          </h3>
          <label className="consent">
            <input
              type="checkbox"
              checked={setup.consent}
              onChange={(e) => set('consent', e.target.checked)}
            />
            <span>
              The patient was told the consultation will be recorded to draft a note, and agreed
              verbally. <em>(This statement is printed on the final note.)</em>
            </span>
          </label>
        </div>

        <div className="form-actions">
          {!signedIn && (
            <p className="helper" role="status">
              Signing in…
            </p>
          )}
          <button type="button" className="btn ghost" onClick={reset}>
            Cancel session
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!setup.consent || !signedIn || (askName && !who)}
            onClick={() => sessionStore.dispatch({ type: 'START_SESSION', setup, clinician: who })}
          >
            Start session, continue to recording →
          </button>
        </div>
      </section>
      <aside className="stack">
        <div className="notice compact with-icon">
          <InfoIcon />
          <span>
            <strong>This session is temporary.</strong>
            <br />
            Nothing is saved. Download the approved note before closing this tab.
          </span>
        </div>
        <div className="helper" data-testid="ns-next">
          <strong>What happens next</strong>
          <ol>
            <li>Record the consultation, or upload a synthetic audio file.</li>
            <li>Review the transcript and the draft note, and fix anything flagged.</li>
            <li>Approve the note, then download it as Word or PDF.</li>
          </ol>
          Sessions end after {TIMEOUT_MS / 60000} minutes of inactivity (warning at{' '}
          {WARN_MS / 60000}).
        </div>
      </aside>
    </div>
  )
}
