// Screen 5 (Blueprint §8, Fig. 11): neutral file name, reminder to file the note, End & clear.
// The browser decides where a download goes (normally your Downloads folder); Mediscribe cannot see it
// and keeps no copy. A visible Download button is always offered because some browsers quietly block
// downloads that are not started by a click.
import { useState } from 'react'
import { downloadApproved, readyFile, saveReady } from '../session/download'
import { neutralFileName } from '../session/filename'
import { evalMetrics, sessionStore } from '../session/store'
import type { SessionState } from '../session/types'

export function DownloadEnd({ state }: { state: SessionState }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [clicked, setClicked] = useState(false)
  const when = new Date(state.approval?.approvedAt ?? 0)
  const name = neutralFileName(when, state.format)
  const ready = readyFile()

  const download = async () => {
    setBusy(true)
    setError(null)
    if (saveReady()) {
      sessionStore.dispatch({ type: 'DOWNLOAD_DONE' })
    } else {
      const r = await downloadApproved(sessionStore)
      if (!r.ok) setError(r.code)
    }
    setClicked(true)
    setBusy(false)
  }

  return (
    <section className="card center-card">
      <div className="big-check" aria-hidden="true">
        ✔
      </div>
      <h2>{ready ? 'Approved – your note is ready' : 'Approved – preparing your note'}</h2>
      <div className="filename" data-testid="filename">
        {name}
      </div>
      <p className="muted small">File name contains no patient details.</p>

      <button
        type="button"
        className="btn approve big-download"
        disabled={busy}
        onClick={download}
        data-testid="download-file"
      >
        ⬇ Download file
      </button>
      <p className="muted" role="status" data-testid="download-status">
        {clicked || state.exported
          ? `The download was started. Look in your browser's Downloads folder for ${name}. If nothing appeared, press Download file again or check that your browser is not blocking downloads from this site.`
          : 'Press Download file to save the note to this computer. Your browser chooses the folder (usually Downloads).'}
      </p>

      <div className="notice amber">
        <strong>Next:</strong> file this document in the patient&apos;s official record (paper file
        or EMR). Mediscribe keeps no copy, and the file cannot be fetched again after the session
        ends.
      </div>
      {error && (
        <div className="notice red" role="alert">
          The file could not be created (<code>{error}</code>). The approved version is kept in this
          tab – press Download file to try again.
        </div>
      )}
      <div className="row center">
        <button
          type="button"
          className="btn outline"
          onClick={() => sessionStore.dispatch({ type: 'REOPEN_FOR_EDIT' })}
        >
          Edit note (resets approval)
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => sessionStore.dispatch({ type: 'END_SESSION' })}
        >
          End session &amp; clear ▸
        </button>
      </div>
      {evalMetrics && (
        <details className="eval-panel" data-testid="eval-panel">
          <summary>Evaluation metrics (content-free)</summary>
          <pre>{JSON.stringify(evalMetrics.snapshot(), null, 2)}</pre>
        </details>
      )}
      <p className="muted small">
        Ending clears audio, transcript, draft and the file from this tab and revokes the session
        token.
      </p>
    </section>
  )
}
