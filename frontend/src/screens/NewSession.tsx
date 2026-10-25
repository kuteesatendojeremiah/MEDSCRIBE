// Screen 1 (Blueprint §8, Fig. 7). Start stays disabled until consent is ticked (FR-02).
import { useState } from 'react'
import { WARN_MS, TIMEOUT_MS } from '../session/timers'
import { DEFAULT_SETUP } from '../session/reducer'
import { sessionStore } from '../session/store'
import type { EndReason, Setup } from '../session/types'

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
  const [typedName, setTypedName] = useState(askName ? '' : clinician)
  const who = typedName.trim()
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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
    <>
      {endReason && (
        <div
          className={`notice ${endReason === 'terminal' ? 'red' : 'green'}`}
          role="status"
          style={{ marginBottom: 20 }}
        >
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
      <div className="page-head">
        <h1>Start a new consultation</h1>
        <p>Set up a temporary session. Patient information is not saved by Mediscribe.</p>
      </div>
      <div className="new-grid">
        <section className="card form-card">
          <h2>Consultation details</h2>
          <p className="form-sub">Choose a template and language before recording.</p>

          <div className="form-grid cols-2" style={{ marginTop: 20 }}>
            <div className="field">
              <label htmlFor="ns-template">Note template</label>
              <select
                id="ns-template"
                value={setup.template}
                onChange={(e) => set('template', e.target.value)}
              >
                <option value="cardiology">Cardiology — outpatient consultation</option>
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
              <label htmlFor="ns-ref">Temporary reference (optional)</label>
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

          <hr className="form-rule" />
          <fieldset className="form-section" data-testid="patient-details">
            <legend>
              <h3>Patient details</h3>
            </legend>
            <p className="form-sub">
              Optional. Used only in this temporary session and printed on the note.
            </p>
            <div className="form-grid cols-3" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="ns-name">Patient full name</label>
                <input
                  id="ns-name"
                  value={setup.patient.name}
                  onChange={(e) => setPatient({ name: e.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={120}
                  placeholder="Enter patient name"
                />
              </div>
              <div className="field">
                <label htmlFor="ns-age">Age</label>
                <input
                  id="ns-age"
                  value={setup.patient.age}
                  onChange={(e) => setPatient({ age: e.target.value })}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={20}
                  placeholder="e.g. 54"
                />
              </div>
              <div className="field">
                <label htmlFor="ns-sex">Sex</label>
                <select
                  id="ns-sex"
                  value={setup.patient.sex}
                  onChange={(e) => setPatient({ sex: e.target.value })}
                >
                  <option value="">Select if relevant</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            <div className="form-grid cols-2" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="ns-date">Consultation date</label>
                <input
                  id="ns-date"
                  value={today}
                  readOnly
                  spellCheck={false}
                  autoComplete="off"
                  title="Set automatically when the session starts"
                />
              </div>
              <div className="field" data-testid="clinician-name">
                <label htmlFor="ns-clinician">Clinician name</label>
                <input
                  id="ns-clinician"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={100}
                  placeholder="Enter clinician name"
                />
              </div>
              <div className="field">
                <label htmlFor="ns-file">File / OPD number</label>
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
                <label htmlFor="ns-res">Residence (village / district)</label>
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

          <hr className="form-rule" />
          <div className="form-section">
            <h3>People present</h3>
            <div className="chips" style={{ marginTop: 10 }}>
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

          <div className="consent-box">
            <strong>Before recording</strong>
            <span className="helper">
              Confirm the patient understands and agrees to recording, where required.
            </span>
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
            <button type="button" className="btn outline" onClick={reset}>
              Clear form
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!setup.consent || !signedIn || !who}
              onClick={() =>
                sessionStore.dispatch({ type: 'START_SESSION', setup, clinician: who })
              }
            >
              Continue to recording
            </button>
          </div>
        </section>
        <aside>
          <section className="card side-card accent">
            <h3>Your session is temporary</h3>
            <span className="tag">No patient history</span>
            <p>
              Mediscribe does not store patient records. Download the approved note before closing
              this tab. Everything is cleared when you end the session or after {TIMEOUT_MS / 60000}{' '}
              minutes without activity.
            </p>
          </section>
          <section className="card side-card" data-testid="ns-next">
            <h3>Next: upload the recording</h3>
            <p>
              Upload the recorded consultation as a video or audio file. You can also record now;
              your browser then asks for microphone permission. You will review and approve the note
              before it can be downloaded.
            </p>
            <p className="helper">Inactivity warning after {WARN_MS / 60000} minutes.</p>
          </section>
        </aside>
      </div>
      <p className="page-foot">
        Clinical documentation assistant · Review every AI-generated note before use.
      </p>
    </>
  )
}
