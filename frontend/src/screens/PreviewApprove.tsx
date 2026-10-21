// Screen 4 (Blueprint §8; Figma frame 03): document preview, final review, explicit approval.
// The preview is rendered by the server from the same model as the export (§12.1). Approval is an
// explicit clinician action; it does not start a download (that is the next screen).
import { useEffect, useState } from 'react'
import { ApiFailure, renderPreview, type PreviewDocument } from '../api/client'
import { DocumentView } from '../components/DocumentView'
import { noteHash, shortHash } from '../session/hash'
import { canApprove } from '../session/selectors'
import { sessionStore } from '../session/store'
import type { SessionState } from '../session/types'

/** The clinician's own confirmations. Nothing here is ticked for them. */
const FINAL_REVIEW = [
  'Transcript checked against the note',
  'Medication names and doses verified',
  'Assessment reflects clinician judgment',
  'Missing or uncertain details reviewed',
  'Plan and follow-up confirmed',
] as const

export function PreviewApprove({ state }: { state: SessionState }) {
  const note = state.note
  const version = note ? shortHash(noteHash(note)) : ''
  const rulesOk = canApprove(state)
  const attention = (note?.review_items ?? []).filter(
    (r) => r.level === 'HIGH' && (r.status === 'open' || !state.openedReviewIds.includes(r.id)),
  )
  const [doc, setDoc] = useState<PreviewDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [confirmed, setConfirmed] = useState<boolean[]>(FINAL_REVIEW.map(() => false))
  const allConfirmed = confirmed.every(Boolean)
  const canClick = rulesOk && allConfirmed && doc !== null

  useEffect(() => {
    if (!note) return
    let cancelled = false
    void (async () => {
      try {
        const d = await renderPreview(note, state.setup.template)
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
  }, [note, attempt, state.setup.template])

  const toggle = (i: number) => setConfirmed(confirmed.map((c, j) => (j === i ? !c : c)))

  return (
    <>
      <div className="page-head">
        <h1>Preview &amp; approve</h1>
        <p>Confirm the document is accurate before creating a downloadable file.</p>
      </div>
      <div className="preview-layout">
        <section className="card doc-card" aria-label="Document preview">
          <p className="eyebrow">Document preview</p>
          {doc ? <DocumentView doc={doc} /> : <p className="muted">Rendering preview…</p>}
          <p className="helper" style={{ marginTop: 12 }}>
            Version <code data-testid="version-hash">{version}</code> ·{' '}
            <span data-testid="preview-status">DRAFT · not approved</span>. Any edit resets
            approval.
          </p>
          {error && (
            <div className="notice amber" role="alert">
              The preview could not be rendered (<code>{error}</code>). Your draft is kept.{' '}
              <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}
        </section>
        <section className="card final-card" aria-label="Final review">
          <h2>Final review</h2>
          <p className="form-sub">Confirm these items before approving.</p>
          <div role="group" aria-label="Final review checklist" style={{ marginTop: 14 }}>
            {FINAL_REVIEW.map((label, i) => (
              <label key={label} className="check-row">
                <input type="checkbox" checked={confirmed[i]} onChange={() => toggle(i)} />
                {label}
              </label>
            ))}
          </div>
          {!rulesOk && (
            <div className="notice amber" role="alert" data-testid="needs-attention">
              <strong>Approval needs your attention:</strong>
              <ul className="plain">
                {attention.map((r) => (
                  <li key={r.id}>
                    {r.reason}{' '}
                    <span className="muted small">
                      {state.openedReviewIds.includes(r.id)
                        ? '(enter the value or mark it unverified)'
                        : '(open it first)'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="small">
                Required items can be corrected in the note or marked unverified; an unverified item
                is printed in red on the document. Advisory warnings never block approval.
              </p>
            </div>
          )}
          <div className="important-box">
            <strong>Important</strong>
            Approval confirms the clinician has reviewed the documentation. It does not mean the AI
            independently validated the clinical facts.
          </div>
          <div className="approve-actions">
            <button
              type="button"
              className="btn outline"
              onClick={() => sessionStore.dispatch({ type: 'BACK_TO_EDIT' })}
            >
              Return to edit
            </button>
            <button
              type="button"
              className="btn approve"
              disabled={!canClick}
              title={
                canClick
                  ? undefined
                  : !rulesOk
                    ? 'Resolve or mark unverified every required item first'
                    : 'Tick every final-review item first'
              }
              onClick={() => sessionStore.dispatch({ type: 'APPROVE' })}
            >
              Approve note
            </button>
          </div>
        </section>
      </div>
      <p className="page-foot">
        The note remains temporary. Download it before ending the session.
      </p>
    </>
  )
}
