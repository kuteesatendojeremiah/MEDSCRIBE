// Screen 4 (Blueprint §8, Fig. 10): checklist, rendered preview, version, approve.
// The preview is rendered by the server from the same model as the export (§12.1).
import { useEffect, useState } from 'react'
import { ApiFailure, renderPreview, type PreviewDocument } from '../api/client'
import { DocumentView } from '../components/DocumentView'
import { downloadApproved } from '../session/download'
import { noteHash, shortHash } from '../session/hash'
import { approvalChecklist, canApprove } from '../session/selectors'
import { sessionStore } from '../session/store'
import type { SessionState } from '../session/types'

export function PreviewApprove({ state }: { state: SessionState }) {
  const lines = approvalChecklist(state)
  const note = state.note
  const version = note ? shortHash(noteHash(note)) : ''
  const ok = canApprove(state)
  const [doc, setDoc] = useState<PreviewDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!note) return
    let cancelled = false
    void (async () => {
      try {
        const d = await renderPreview(note)
        if (cancelled) return
        // Integrity check: what the server previews must be exactly what this tab will approve.
        if (d.short_hash !== shortHash(noteHash(note))) {
          sessionStore.dispatch({ type: 'TERMINAL_ERROR', code: 'E_HASH_MISMATCH' })
          return
        }
        setDoc(d)
        setError(null)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiFailure && e.klass === 'terminal') {
          sessionStore.dispatch({ type: 'TERMINAL_ERROR', code: e.code })
        } else {
          setError(e instanceof ApiFailure ? e.code : 'E_UNEXPECTED')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [note, attempt])

  const approve = async () => {
    sessionStore.dispatch({ type: 'APPROVE' })
    await downloadApproved(sessionStore) // approve this exact version, then render and save it
  }

  return (
    <div className="grid preview-grid">
      <section className="card">
        <h2>Approval checklist</h2>
        <ul className="plain checklist">
          {lines.map((l) => (
            <li key={l.label} className={l.ok ? 'ok' : 'bad'}>
              <span aria-hidden="true">{l.ok ? '✓' : '✗'}</span> {l.label}
            </li>
          ))}
        </ul>
        <div className="notice amber">
          You are approving <strong>exactly the document shown</strong>.
          <br />
          Version <code data-testid="version-hash">{version}</code>. Any edit resets approval.
        </div>
        <div className="field-label">Format</div>
        <div className="row">
          {(['docx', 'pdf'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={state.format === f ? 'btn primary' : 'btn outline'}
              aria-pressed={state.format === f}
              onClick={() => sessionStore.dispatch({ type: 'SET_FORMAT', format: f })}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn outline"
            onClick={() => sessionStore.dispatch({ type: 'BACK_TO_EDIT' })}
          >
            ◂ Back to edit
          </button>
          <button type="button" className="btn approve" disabled={!ok || !doc} onClick={approve}>
            ✓ Approve this version &amp; download
          </button>
        </div>
        {!ok && <p className="muted small">Resolve or mark unverified every HIGH item first.</p>}
        {error && (
          <div className="notice amber" role="alert">
            The preview could not be rendered (<code>{error}</code>). Your draft is kept.{' '}
            <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}
      </section>
      <section className="preview-pane">
        {doc ? <DocumentView doc={doc} /> : <p className="muted">Rendering preview…</p>}
      </section>
    </div>
  )
}
