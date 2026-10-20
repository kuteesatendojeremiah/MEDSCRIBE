// Review-items panel (Blueprint §4.4, FR-09). Opening a card records it as opened.
import { useState } from 'react'
import { canPreview, highItems } from '../session/selectors'
import { rebuildNote } from '../session/regenerate'
import { sessionStore } from '../session/store'
import type { ReviewItem, SessionState } from '../session/types'

function Card({ item, state }: { item: ReviewItem; state: SessionState }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const opened = state.openedReviewIds.includes(item.id)
  const linked = state.note?.items.find((i) => i.id === item.item_id)
  const dispatch = sessionStore.dispatch

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

export function ReviewItemsPanel({ state }: { state: SessionState }) {
  const [regenError, setRegenError] = useState<string | null>(null)
  const items = state.note?.review_items ?? []
  const order = { HIGH: 0, CHECK: 1, INFO: 2 } as const
  const sorted = [...items].sort((a, b) => order[a.level] - order[b.level])
  const unlocked = canPreview(state)
  const confirmDiscard = () => {
    if (window.confirm('Discard this draft? Everything will be cleared from this tab.')) {
      sessionStore.dispatch({ type: 'DISCARD' })
    }
  }
  return (
    <section className="card">
      <h2>Review items ({items.length})</h2>
      {sorted.map((r) => (
        <Card key={r.id} item={r} state={state} />
      ))}
      <p className="muted">
        {unlocked
          ? 'All HIGH items opened. Preview is unlocked.'
          : `Open every HIGH item to unlock Preview (${
              highItems(state.note).filter((r) => !state.openedReviewIds.includes(r.id)).length
            } left).`}
      </p>
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
            After fixing speaker roles or text on the left, rebuild the draft.
          </p>
          {regenError && (
            <p className="muted small" role="alert">
              Could not rebuild the note (<code>{regenError}</code>). Your draft is unchanged.
            </p>
          )}
        </div>
      )}
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
