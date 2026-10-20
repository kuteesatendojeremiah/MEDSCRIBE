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
}: {
  endReason: EndReason | null
  errorCode: string | null
  terminal: boolean
  signedIn?: boolean
  clinician?: string
}) {
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

  return (
    <div className="grid two">
      <section className="card">
        {endReason && (
          <div className={`notice ${endReason === 'terminal' ? 'red' : 'green'}`} role="status">
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
          </div>
        )}
        <h2>New temporary consultation</h2>
        <label>
          Note template
          <select value={setup.template} onChange={(e) => set('template', e.target.value)}>
            <option value="cardiology">Cardiology – outpatient consultation</option>
          </select>
        </label>
        <div className="row">
          <label className="grow">
            Temporary reference (not saved)
            <input
              value={setup.tempRef}
              onChange={(e) => set('tempRef', e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="e.g. OPD-07"
            />
          </label>
          <label className="grow">
            Expected language(s)
            <select value={setup.languages} onChange={(e) => set('languages', e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="patient-box" data-testid="patient-details">
          <legend>Patient details</legend>
          <p className="muted small">
            Typed by you and printed at the top of the note. Kept only in this tab; never saved by
            Mediscribe. Leave blank anything you do not have.
          </p>
          <div className="row">
            <label className="grow">
              Full name
              <input
                value={setup.patient.name}
                onChange={(e) => setPatient({ name: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={120}
              />
            </label>
            <label style={{ width: 120 }}>
              Age
              <input
                value={setup.patient.age}
                onChange={(e) => setPatient({ age: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={20}
                placeholder="e.g. 58"
              />
            </label>
            <label style={{ width: 150 }}>
              Sex
              <select
                value={setup.patient.sex}
                onChange={(e) => setPatient({ sex: e.target.value })}
              >
                <option value="">Not stated</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label className="grow">
              File / OPD number
              <input
                value={setup.patient.fileNumber}
                onChange={(e) => setPatient({ fileNumber: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={40}
              />
            </label>
            <label className="grow">
              Residence (village / district)
              <input
                value={setup.patient.residence}
                onChange={(e) => setPatient({ residence: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                maxLength={120}
              />
            </label>
          </div>
        </fieldset>
        <div className="field-label">People present</div>
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
        <div className="field-label">Consent</div>
        <label className="consent">
          <input
            type="checkbox"
            checked={setup.consent}
            onChange={(e) => set('consent', e.target.checked)}
          />
          <span>
            The patient was told the consultation will be recorded to draft a note, and agreed
            verbally. <em>(this statement is printed on the final note)</em>
          </span>
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={!setup.consent || !signedIn}
          onClick={() => sessionStore.dispatch({ type: 'START_SESSION', setup, clinician })}
        >
          Start session ▸
        </button>
        {!signedIn && (
          <p className="muted small" role="status">
            Signing in…
          </p>
        )}
      </section>
      <aside className="stack">
        <div className="notice amber">
          <strong>This session is temporary.</strong>
          <br />
          Mediscribe does not save consultations, audio or notes. If you close or lose this tab
          before downloading, the draft is gone. Save the approved document in the patient&apos;s
          official record.
        </div>
        <section className="card">
          <h3>What happens next</h3>
          <ul className="plain">
            <li>Record the consultation</li>
            <li>Check the transcript and speaker labels</li>
            <li>Type findings that were not spoken aloud</li>
            <li>Open every red review item</li>
            <li>Preview, approve, download</li>
            <li>End session – memory cleared</li>
          </ul>
        </section>
        <section className="card muted">
          Session expires after {TIMEOUT_MS / 60000} min of inactivity (warning at {WARN_MS / 60000}{' '}
          min). Recording, processing and an open review tab count as activity.
        </section>
      </aside>
    </div>
  )
}
