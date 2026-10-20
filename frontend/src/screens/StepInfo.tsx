// Information view for a step you opened but are not on (Blueprint §8). Read-only: nothing here can
// change the session or skip a safety rule.
import type { ServerInfo } from '../api/client'
import { formatClock } from '../session/timers'
import { STEP_TITLES, type StepInfoData } from '../session/navigation'
import type { SessionState } from '../session/types'

function SetupSummary({ state }: { state: SessionState }) {
  const s = state.setup
  const rows: Array<[string, string]> = [
    ['Template', s.template === 'cardiology' ? 'Cardiology – outpatient consultation' : s.template],
    ['Temporary reference', s.tempRef || '—'],
    ['Patient', s.patient.name || '—'],
    ['Age / sex', [s.patient.age, s.patient.sex].filter(Boolean).join(' · ') || '—'],
    ['File no.', s.patient.fileNumber || '—'],
    ['Residence', s.patient.residence || '—'],
    ['Languages', s.languages],
    ['People present', s.present.join(' · ')],
    ['Clinician', state.clinician || '—'],
    ['Consent', s.consent ? 'Confirmed at session start' : 'Not confirmed'],
  ]
  return (
    <table className="summary-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RecordSummary({ state, info }: { state: SessionState; info: ServerInfo | null }) {
  const rows: Array<[string, string]> = [
    ['Recording length', formatClock(state.recordingMs)],
    ['Transcript segments', String(state.transcript?.length ?? 0)],
    [
      'Transcription',
      info
        ? info.speech === 'local'
          ? `Local speech model (${info.speech_model}) on this computer`
          : 'Simulated (mock): any audio returns the demonstration consultation'
        : '—',
    ],
    ['Audio', 'Dropped from this tab as soon as processing finished; never stored'],
  ]
  return (
    <table className="summary-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function StepInfo({
  data,
  state,
  info,
  onBack,
}: {
  data: StepInfoData
  state: SessionState
  info: ServerInfo | null
  onBack: () => void
}) {
  const badge =
    data.status === 'done' ? '✓ Done' : data.status === 'locked' ? 'Not available yet' : 'Current'
  return (
    <section className="card step-info" data-testid={`step-info-${data.step}`}>
      <p className="muted small">Step {data.step} of 5 · viewing only</p>
      <h2>
        {data.title} <span className={`status-pill ${data.status}`}>{badge}</span>
      </h2>
      <p>{data.purpose}</p>

      {data.status === 'done' && data.step === 1 && <SetupSummary state={state} />}
      {data.status === 'done' && data.step === 2 && <RecordSummary state={state} info={info} />}
      {data.status === 'done' && data.step === 1 && (
        <p className="muted small">
          To change these details, end the session and start a new one. Nothing is saved, so there
          is no way to edit a session that has already started.
        </p>
      )}
      {data.status === 'done' && data.step === 4 && state.approval && (
        <p>
          Approved version <code>{state.approval.versionHash}</code>. To change anything, go back to
          Review (this cancels the approval).
        </p>
      )}

      {data.status === 'locked' && (
        <>
          <h3>What is needed first</h3>
          <ul className="plain checklist">
            {data.requirements.map((r) => (
              <li key={r.label} className={r.ok ? 'ok' : 'bad'}>
                <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span> {r.label}
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn primary" onClick={onBack}>
        ◂ Back to your current step
      </button>
      <p className="muted small">Steps: {Object.values(STEP_TITLES).join(' → ')}</p>
    </section>
  )
}
