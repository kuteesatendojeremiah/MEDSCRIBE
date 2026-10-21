// Review-items dock (Blueprint §4.4, FR-09). Opening a card records it as opened. The list can be
// collapsed, but the summary bar (counts, Preview, Discard) never is, so an unresolved HIGH item can
// not be hidden from the clinician.
import { useId, useState } from 'react'
import { canPreview, highItems } from '../session/selectors'
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
    <div className={`ri ri-${item.level} ri-${item.status}`} data-testid={`review-${item.id}`}>
      <button
        type="button"
        className="ri-head"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${item.level} review item: ${item.reason}`}
      >
        <strong>{item.level}</strong> {item.reason}
        {item.status !== 'open' && (
          <span className="ri-status"> · {item.status.toUpperCase()}</span>
        )}
        {item.level === 'HIGH' && opened && item.status === 'open' && (
          <span className="ri-status"> · opened</span>
        )}
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
                className="link tiny"
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
  const [collapsed, setCollapsed] = useState(false)
  const listId = useId()
  const items = state.note?.review_items ?? []
  const order = { HIGH: 0, CHECK: 1, INFO: 2 } as const
  const sorted = [...items].sort((a, b) => order[a.level] - order[b.level])
  const unlocked = canPreview(state)
  const openHigh = items.filter((r) => r.level === 'HIGH' && r.status === 'open').length
  const unopened = highItems(state.note).filter((r) => !state.openedReviewIds.includes(r.id)).length
  const advisory = items.filter((r) => r.level !== 'HIGH' && r.status === 'open').length
  const confirmDiscard = () => {
    if (window.confirm('Discard this draft? Everything will be cleared from this tab.')) {
      sessionStore.dispatch({ type: 'DISCARD' })
    }
  }
  return (
    <section className="card review-dock" aria-label="Review items">
      <div className="panel-head">
        <h2>Review items ({items.length})</h2>
        <span className="dock-chips" data-testid="review-summary">
          <span className={openHigh ? 'badge badge-req' : 'badge badge-ok'}>
            {openHigh ? `${openHigh} required open` : 'No required items open'}
          </span>
          <span className="badge badge-adv">{advisory} advisory open</span>
        </span>
        <button
          type="button"
          className="btn small outline"
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Show review items' : 'Hide review items'}
        </button>
      </div>
      <div id={listId} hidden={collapsed}>
        {sorted.map((r) => (
          <Card key={r.id} item={r} state={state} onLocate={onLocate} />
        ))}
        {state.transcript && (
          <div className="regen">
            <button
              type="button"
              className="btn small outline"
              onClick={async () => setRegenError(await rebuildNote(sessionStore))}
            >
              ↻ Rebuild note from transcript
            </button>
            <p className="muted small">
              After fixing speaker roles or text in the transcript, rebuild the draft.
            </p>
            {regenError && (
              <p className="muted small" role="alert">
                Could not rebuild the note (<code>{regenError}</code>). Your draft is unchanged.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="muted" role="status">
        {unlocked
          ? 'All required items opened. Preview is unlocked.'
          : `Open every required item to unlock Preview (${unopened} left).`}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn outline"
          disabled={!unlocked}
          onClick={() => sessionStore.dispatch({ type: 'PREVIEW' })}
        >
          Preview ▸
        </button>
        <button type="button" className="link" onClick={confirmDiscard}>
          Discard draft
        </button>
      </div>
    </section>
  )
}
