// "Needs attention" panel and the Review footer (Blueprint §4.4, FR-09; Figma frame 02). Opening a card
// records it as opened. Required (HIGH) items stay visible in the panel and block Preview until they are
// opened and then resolved or marked unverified; advisory items never block.
import { useState } from 'react'
import { approvalChecklist, canPreview, highItems } from '../session/selectors'
import { rebuildNote } from '../session/regenerate'
import { sessionStore } from '../session/store'
import type { ReviewItem, SessionState } from '../session/types'
import { ROLE_LABEL, mmss } from './common'

/** Plain-language meaning of each level, and whether it blocks approval. */
export const LEVEL_INFO = {
  HIGH: {
    kind: 'Required',
    why: 'This could change care if wrong. Open it, then enter the correct value or mark it unverified. Approval is blocked until you do.',
  },
  CHECK: {
    kind: 'Advisory',
    why: 'Worth a look before you approve. It does not block approval.',
  },
  INFO: {
    kind: 'Advisory',
    why: 'For your information, for example something that was not recorded. It does not block approval.',
  },
} as const

function Card({
  item,
  state,
  onLocate,
}: {
  item: ReviewItem
  state: SessionState
  onLocate: (segmentId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const opened = state.openedReviewIds.includes(item.id)
  const linked = state.note?.items.find((i) => i.id === item.item_id)
  const segmentId = linked?.source.type === 'segment' ? (linked.source.segment_id ?? null) : null
  const segment = segmentId ? state.transcript?.find((t) => t.id === segmentId) : undefined
  const dispatch = sessionStore.dispatch
  const info = LEVEL_INFO[item.level]

  const toggle = () => {
    setOpen(!open)
    if (!opened) dispatch({ type: 'OPEN_REVIEW_ITEM', id: item.id })
  }

  return (
    <div
      className={`attention-card ri ri-${item.level} ri-${item.status}`}
      data-testid={`review-${item.id}`}
    >
      <button
        type="button"
        className="ri-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${item.level} review item: ${item.reason}`}
      >
        <span className="lvl">
          {item.level}
          {item.status !== 'open' && ` · ${item.status}`}
          {item.level === 'HIGH' && opened && item.status === 'open' && ' · opened'}
        </span>
        <span>{item.reason}</span>
        <span className="go">{open ? 'Hide details' : 'Review item →'}</span>
      </button>
      {open && (
        <div className="ri-body">
          <p className="ri-meta">
            <span className={`badge ${item.level === 'HIGH' ? 'badge-req' : 'badge-adv'}`}>
              {info.kind}
            </span>{' '}
            {info.why}
          </p>
          {segment && (
            <p className="ri-meta small">
              Source: {mmss(segment.start)} · {ROLE_LABEL[segment.speaker_role]}{' '}
              <button
                type="button"
                className="link"
                aria-label={`Show source of ${item.id} in transcript`}
                onClick={() => onLocate(segment.id)}
              >
                Show in transcript
              </button>
            </p>
          )}
          {item.level === 'HIGH' ? (
            <>
              {linked && <p className="muted small">Note says: {linked.text}</p>}
              <label>
                Enter value (e.g. dose, route)
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <div className="row">
                <button
                  type="button"
                  className="btn small primary"
                  disabled={!value.trim()}
                  onClick={() => {
                    dispatch({ type: 'RESOLVE_ITEM', id: item.id, text: value.trim() })
                    setValue('')
                  }}
                >
                  Resolve with this value
                </button>
                <button
                  type="button"
                  className="btn small outline"
                  onClick={() => dispatch({ type: 'MARK_UNVERIFIED', id: item.id })}
                >
                  Mark unverified
                </button>
              </div>
            </>
          ) : (
            <div className="row">
              <button
                type="button"
                className="btn small outline"
                onClick={() => dispatch({ type: 'ACKNOWLEDGE_ITEM', id: item.id })}
              >
                {item.level === 'CHECK' ? 'Confirm / acknowledge' : 'Leave as not recorded'}
              </button>
              <button
                type="button"
                className="btn small outline"
                onClick={() => dispatch({ type: 'MARK_UNVERIFIED', id: item.id })}
              >
                Mark unverified
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ReviewItemsPanel({
  state,
  onLocate = () => undefined,
}: {
  state: SessionState
  onLocate?: (segmentId: string | null) => void
}) {
  const [regenError, setRegenError] = useState<string | null>(null)
  const items = state.note?.review_items ?? []
  const order = { HIGH: 0, CHECK: 1, INFO: 2 } as const
  const sorted = [...items].sort((a, b) => order[a.level] - order[b.level])
  const openCount = items.filter((r) => r.status === 'open').length
  const openHigh = items.filter((r) => r.level === 'HIGH' && r.status === 'open').length
  const unopened = highItems(state.note).filter((r) => !state.openedReviewIds.includes(r.id)).length
  const unlocked = canPreview(state)
  return (
    <section className="panel attention-panel" aria-label="Review items">
      <div className="panel-head">
        <h2>Needs attention</h2>
        <span
          className={openCount ? 'count-pill red' : 'count-pill'}
          data-testid="review-summary"
          aria-label={`${openHigh} required items open, ${openCount - openHigh} advisory open`}
        >
          {openCount} {openCount === 1 ? 'item' : 'items'}
        </span>
      </div>
      <p className="panel-sub">Resolve critical items before approval.</p>
      <div>
        {sorted.map((r) => (
          <Card key={r.id} item={r} state={state} onLocate={onLocate} />
        ))}
      </div>
      <p className="helper" role="status">
        {unlocked
          ? 'All required items opened. Preview is unlocked.'
          : `Open every required item to unlock Preview (${unopened} left).`}
      </p>
      <details className="checklist-box">
        <summary>Review checklist</summary>
        <ul className="plain checklist">
          {approvalChecklist(state).map((l) => (
            <li key={l.label} className={l.ok ? 'ok' : 'bad'}>
              <span aria-hidden="true">{l.ok ? '✓' : '✗'}</span> {l.label}
            </li>
          ))}
        </ul>
      </details>
      {state.transcript && (
        <div className="regen">
          <button
            type="button"
            className="btn small outline"
            onClick={async () => setRegenError(await rebuildNote(sessionStore))}
          >
            ↻ Rebuild note from transcript
          </button>
          <p className="helper">
            After fixing speaker roles or text in the transcript, rebuild the draft.
          </p>
          {regenError && (
            <p className="helper" role="alert">
              Could not rebuild the note (<code>{regenError}</code>). Your draft is unchanged.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** Bottom bar of the Review screen: the draft notice and the real navigation actions. */
export function ReviewFooter({ state }: { state: SessionState }) {
  const unlocked = canPreview(state)
  const confirmDiscard = () => {
    if (window.confirm('Discard this draft? Everything will be cleared from this tab.')) {
      sessionStore.dispatch({ type: 'DISCARD' })
    }
  }
  return (
    <div className="review-foot">
      <span>
        Draft content is temporary. Approval must be explicit; edits after approval require
        reapproval.
      </span>
      <span className="spacer" />
      <button type="button" className="btn outline" onClick={confirmDiscard}>
        Discard draft
      </button>
      <button
        type="button"
        className="btn primary"
        disabled={!unlocked}
        title={unlocked ? undefined : 'Open every required item first'}
        onClick={() => sessionStore.dispatch({ type: 'PREVIEW' })}
      >
        Continue to Preview &amp; approve
      </button>
    </div>
  )
}
