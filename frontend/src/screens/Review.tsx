// Screen 3 (Blueprint §8, Fig. 9): transcript | draft note | review items.
// FR-07 manual entry in every section; §4.2 source tags; clicking a tag highlights its segment.
import { useEffect, useRef, useState } from 'react'
import { ROLE_LABEL, ROLE_ORDER, RoleSelect, mmss } from '../components/common'
import { ReviewFooter, ReviewItemsPanel } from '../components/ReviewItemsPanel'
import { missingVitals } from '../session/selectors'
import { sessionStore } from '../session/store'
import { hasTypedFindings, rebuildNote } from '../session/regenerate'
import type { NoteItem, Section, Segment, SessionState, SpeakerRole } from '../session/types'

export const SECTION_TITLES: Array<[Section, string]> = [
  ['history', 'HISTORY'],
  ['meds_allergies', 'MEDICATIONS & ALLERGIES'],
  ['vitals', 'VITAL SIGNS'],
  ['exam', 'EXAMINATION'],
  ['investigations', 'INVESTIGATIONS'],
  ['assessment', 'ASSESSMENT'],
  ['treatment', 'TREATMENT'],
  ['plan', 'PLAN'],
]

/** Below this confidence a speaker label is shown as uncertain (never as a confirmed identity). */
export const UNCERTAIN_BELOW = 0.6

/** FR-18: search the current session's transcript (in memory only). */
export function searchSegments(segments: Segment[], query: string): Segment[] {
  const q = query.trim().toLowerCase()
  if (!q) return segments
  return segments.filter((t) =>
    `${t.original_text} ${t.english_text ?? ''}`.toLowerCase().includes(q),
  )
}

function SegmentRow({ t, cls, selected }: { t: Segment; cls: string; selected: boolean }) {
  const [editing, setEditing] = useState(false)
  const shown = t.english_text ?? t.original_text
  const [text, setText] = useState(shown)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])
  const translated = t.english_text !== null
  const uncertain = t.speaker_role === 'unknown' || t.confidence < UNCERTAIN_BELOW
  return (
    <div
      ref={ref}
      className={`${cls}${selected ? ' seg-selected' : ''}`}
      data-testid={`segment-${t.id}`}
      aria-current={selected ? 'true' : undefined}
    >
      <div className="seg-meta">
        <span className="time">{mmss(t.start)}</span>
        <RoleSelect
          role={t.speaker_role}
          label={`Speaker of segment ${t.id}`}
          uncertain={uncertain}
          suffix={uncertain ? <span data-testid={`uncertain-${t.id}`}> · uncertain</span> : null}
          onChange={(role) =>
            sessionStore.dispatch({ type: 'REASSIGN_ROLE', segmentId: t.id, role })
          }
        />
        {t.voice != null && (
          <span className="voice-tag" title="Grouped by sound; check it against the audio">
            voice {t.voice}
          </span>
        )}
      </div>
      {editing ? (
        <span className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={`Edit segment ${t.id}`}
          />
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              sessionStore.dispatch({ type: 'EDIT_SEGMENT', segmentId: t.id, text })
              setEditing(false)
            }}
          >
            Save
          </button>
        </span>
      ) : (
        <>
          <div className="seg-text">
            {translated ? (
              <>
                <em className="orig">“{t.original_text}”</em>
                <div className="eng">→ {t.english_text}</div>
              </>
            ) : (
              <span>{t.original_text}</span>
            )}
          </div>
          <button
            type="button"
            className="link"
            aria-label={`Edit text of segment ${t.id}`}
            onClick={() => {
              setText(shown)
              setEditing(true)
            }}
          >
            Edit segment
          </button>
        </>
      )}
    </div>
  )
}

function SuggestionsPanel({ state }: { state: SessionState }) {
  if (state.suggestions.length === 0) return null
  return (
    <div className="suggestions" data-testid="suggestions">
      <strong>Possible misheard medical terms</strong>
      <p className="muted small">
        Check against the audio. Accepting a suggestion edits the transcript only; then rebuild the
        note.
      </p>
      {state.suggestions.map((g) => (
        <div key={g.id} className="row suggestion">
          <span>
            “{g.heard}” → <strong>{g.suggest}</strong>
          </span>
          <button
            type="button"
            className="btn small primary"
            onClick={() => sessionStore.dispatch({ type: 'APPLY_SUGGESTION', id: g.id })}
          >
            Use {g.suggest}
          </button>
          <button
            type="button"
            className="link tiny"
            onClick={() => sessionStore.dispatch({ type: 'DISMISS_SUGGESTION', id: g.id })}
          >
            Ignore
          </button>
        </div>
      ))}
    </div>
  )
}

function VoicePanel({ state }: { state: SessionState }) {
  const [choice, setChoice] = useState<Record<number, SpeakerRole | ''>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voices = [
    ...new Set((state.transcript ?? []).map((t) => t.voice).filter((v): v is number => v != null)),
  ].sort()
  if (voices.length < 2) return null
  const chosen = Object.entries(choice).filter(([, r]) => r)
  const apply = async () => {
    setBusy(true)
    setError(null)
    const roles = Object.fromEntries(chosen) as unknown as Record<number, SpeakerRole>
    sessionStore.dispatch({ type: 'ASSIGN_VOICE_ROLES', roles })
    // Rebuild straight away; ask first only if typed findings would be replaced.
    setError(await rebuildNote(sessionStore, { confirm: hasTypedFindings(sessionStore) }))
    setBusy(false)
  }
  return (
    <div className="suggestions voices" data-testid="voice-panel">
      <strong>Voices detected: {voices.length}</strong>
      <p className="muted small">
        Grouped by how they sound, to save you labelling each line. Check the groups against the
        audio: people with similar voices can be mixed up. You decide who is who.
      </p>
      {voices.map((v) => {
        const n = (state.transcript ?? []).filter((t) => t.voice === v).length
        return (
          <div key={v} className="row">
            <span>
              Voice {v} <span className="muted small">({n} segments)</span>
            </span>
            <select
              aria-label={`Role for voice ${v}`}
              value={choice[v] ?? ''}
              onChange={(e) => setChoice({ ...choice, [v]: e.target.value as SpeakerRole | '' })}
            >
              <option value="">Choose a role…</option>
              {ROLE_ORDER.filter((r) => r !== 'unknown').map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <button
        type="button"
        className="btn small primary"
        disabled={busy || chosen.length === 0}
        onClick={apply}
      >
        Apply roles &amp; rebuild note
      </button>
      {error && (
        <p className="muted small" role="alert">
          Could not rebuild the note (<code>{error}</code>). Your roles are set; try Rebuild again.
        </p>
      )}
    </div>
  )
}

function Transcript({ state, highlightId }: { state: SessionState; highlightId: string | null }) {
  const [query, setQuery] = useState('')
  const all = state.transcript ?? []
  const matching = searchSegments(all, query)
  const openHigh = new Set(
    (state.note?.review_items ?? [])
      .filter((r) => r.level === 'HIGH' && r.status === 'open')
      .map((r) => state.note?.items.find((i) => i.id === r.item_id)?.source.segment_id),
  )
  return (
    <section className="panel transcript-panel" aria-label="Transcript">
      <div className="panel-head">
        <h2>Transcript</h2>
        <span className="count-pill">
          {all.length} {all.length === 1 ? 'segment' : 'segments'}
        </span>
      </div>
      {all.length === 0 && (
        <p className="muted">No transcript. Type findings directly into the note.</p>
      )}
      {all.length > 0 && (
        <div className="row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript…"
            aria-label="Search transcript"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      )}
      {query.trim() && (
        <p className="helper" role="status" data-testid="search-count">
          {matching.length} of {all.length}
        </p>
      )}
      <p className="helper">Select a speaker label to reassign it.</p>
      <VoicePanel state={state} />
      <SuggestionsPanel state={state} />
      {matching.map((t) => {
        const cls = openHigh.has(t.id)
          ? 'seg seg-high'
          : t.speaker_role === 'unknown'
            ? 'seg seg-check'
            : 'seg'
        return (
          <SegmentRow
            key={`${t.id}-${t.speaker_role}`}
            t={t}
            cls={cls}
            selected={highlightId === t.id}
          />
        )
      })}
    </section>
  )
}

function tag(item: NoteItem, state: SessionState): string {
  if (item.source.type === 'clinician_entered') return 'typed by clinician'
  if (item.source.type === 'clinician_edited') return 'edited by clinician'
  const seg = state.transcript?.find((t) => t.id === item.source.segment_id)
  const role = item.source.speaker_role
  const who = role === 'relative' ? 'reported by relative' : role ? ROLE_LABEL[role] : ''
  return seg ? `${mmss(seg.start)} ${who}` : who
}

function ItemMenu({ item }: { item: NoteItem }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [confirming, setConfirming] = useState(false)
  const close = () => {
    setConfirming(false)
    if (ref.current) ref.current.open = false
  }
  return (
    <details
      ref={ref}
      className="menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          close()
          ref.current?.querySelector('summary')?.focus()
        }
      }}
    >
      <summary className="btn small outline" aria-label={`More actions for ${item.id}`}>
        More
      </summary>
      <div className="menu-panel">
        <label>
          Move to section
          <select
            aria-label={`Move ${item.id} to section`}
            value={item.section}
            onChange={(e) => {
              sessionStore.dispatch({
                type: 'MOVE_NOTE_ITEM',
                id: item.id,
                section: e.target.value as Section,
              })
              close()
            }}
          >
            {SECTION_TITLES.map(([s, title]) => (
              <option key={s} value={s}>
                {title.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        {confirming ? (
          <div role="alert" className="menu-confirm">
            <p>Delete this finding from the note? The transcript is not changed.</p>
            <button
              type="button"
              className="btn small danger"
              aria-label={`Confirm delete ${item.id}`}
              onClick={() => sessionStore.dispatch({ type: 'DELETE_NOTE_ITEM', id: item.id })}
            >
              Confirm delete
            </button>{' '}
            <button
              type="button"
              className="btn small outline"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn small outline danger-text"
            aria-label={`Delete ${item.id}`}
            onClick={() => setConfirming(true)}
          >
            Delete…
          </button>
        )}
      </div>
    </details>
  )
}

function ItemRow({
  item,
  state,
  highlightId,
  onHighlight,
}: {
  item: NoteItem
  state: SessionState
  highlightId: string | null
  onHighlight: (id: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const flagged = state.note?.review_items.some(
    (r) => r.item_id === item.id && r.level === 'HIGH' && r.status === 'open',
  )
  const segmentId = item.source.type === 'segment' ? (item.source.segment_id ?? null) : null
  const active = segmentId !== null && highlightId === segmentId
  return (
    <li data-testid={`item-${item.id}`} className={active ? 'item-active' : undefined}>
      {editing ? (
        <span className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={`Edit ${item.id}`}
          />
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              if (text.trim() && text !== item.text) {
                sessionStore.dispatch({ type: 'EDIT_NOTE_ITEM', id: item.id, text: text.trim() })
              }
              setEditing(false)
            }}
          >
            Save
          </button>
        </span>
      ) : (
        <>
          {item.text} {flagged && <span title="Needs review">⚠</span>}{' '}
          {segmentId ? (
            <button
              type="button"
              className="src src-btn"
              aria-pressed={active}
              title="Show source in transcript"
              onClick={() => onHighlight(active ? null : segmentId)}
            >
              [{tag(item, state)}]
            </button>
          ) : (
            <span className="src typed">{tag(item, state)}</span>
          )}{' '}
          <button
            type="button"
            className="btn small outline"
            onClick={() => {
              setText(item.text)
              setEditing(true)
            }}
          >
            Edit
          </button>{' '}
          <ItemMenu item={item} />
        </>
      )}
    </li>
  )
}

function AddFinding({ section }: { section: Section }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) {
    return (
      <button
        type="button"
        className="link"
        data-testid={`add-${section}`}
        onClick={() => setOpen(true)}
      >
        + Add finding
      </button>
    )
  }
  const save = () => {
    if (text.trim()) sessionStore.dispatch({ type: 'ADD_NOTE_ITEM', section, text })
    setText('')
    setOpen(false)
  }
  return (
    <span className="row">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
        spellCheck={false}
        autoComplete="off"
        aria-label={`New ${section} finding`}
        autoFocus
      />
      <button type="button" className="btn small primary" onClick={save}>
        Add
      </button>
    </span>
  )
}

/** Sentence-case headings under each section label (the schema sections are fixed, ADR-0010). */
const SECTION_HEADING: Record<Section, string> = {
  history: 'Presenting complaint and history',
  meds_allergies: 'Current medications and allergies',
  vitals: 'Vital signs',
  exam: 'Findings',
  investigations: 'Results',
  assessment: 'Assessment',
  treatment: 'Treatment',
  plan: 'Plan and follow-up',
}

function Draft({
  state,
  highlightId,
  onHighlight,
}: {
  state: SessionState
  highlightId: string | null
  onHighlight: (id: string | null) => void
}) {
  const note = state.note
  if (!note) return null
  return (
    <section className="panel note-panel" aria-label="Clinical note">
      <div className="panel-head">
        <div>
          <h2>Clinical note</h2>
          <p className="panel-sub">Generated from the transcript · review before approval</p>
        </div>
        <span className="status-pill draft" data-testid="draft-pill">
          Draft
        </span>
      </div>
      {SECTION_TITLES.map(([sec, title]) => {
        const items = note.items.filter((i) => i.section === sec)
        const missing = sec === 'vitals' ? missingVitals(note) : []
        const empty = items.length === 0 && missing.length === 0
        return (
          <div key={sec}>
            <hr className="note-divider" />
            <div className="note-section">
              <p className="eyebrow">{title}</p>
              <div className="note-section-head">
                <h3>{SECTION_HEADING[sec]}</h3>
              </div>
              <div className={`field-box${empty ? ' warn' : ''}`}>
                {empty && <p className="muted">not recorded</p>}
                <ul className="items">
                  {items.map((i) => (
                    <ItemRow
                      key={`${i.id}-${i.text}-${i.source.type}-${i.section}`}
                      item={i}
                      state={state}
                      highlightId={highlightId}
                      onHighlight={onHighlight}
                    />
                  ))}
                </ul>
                {missing.length > 0 && <p className="muted">{missing.join(' / ')}: not recorded</p>}
              </div>
              <div className="add-row">
                <AddFinding section={sec} />
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** The patient introduction at the top of Review, with a way to fix a typo (cancels any approval). */
function PatientBanner({ state }: { state: SessionState }) {
  const p = state.setup.patient
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p)
  const ageSex = [p.age && `${p.age}`, p.sex].filter(Boolean).join(' · ')
  const shown = [p.name, ageSex, p.fileNumber && `File ${p.fileNumber}`, p.residence].filter(
    Boolean,
  )
  if (editing) {
    const field = (key: keyof typeof p, label: string, width?: number) => (
      <label style={width ? { width } : undefined} className={width ? undefined : 'grow'}>
        {label}
        <input
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
    )
    return (
      <section className="card patient-banner" data-testid="patient-banner">
        <div className="row">
          {field('name', 'Full name')}
          {field('age', 'Age', 90)}
          {field('sex', 'Sex', 110)}
          {field('fileNumber', 'File / OPD number')}
          {field('residence', 'Residence')}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              sessionStore.dispatch({ type: 'EDIT_PATIENT', patient: draft })
              setEditing(false)
            }}
          >
            Save patient details
          </button>
          <button type="button" className="link" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="patient-strip" data-testid="patient-banner">
      <strong>Patient</strong>
      {shown.length ? (
        <span data-testid="patient-summary">{shown.join(' · ')}</span>
      ) : (
        <span className="muted" data-testid="patient-summary">
          Not recorded
        </span>
      )}
      <button
        type="button"
        className="link"
        aria-label="Edit patient details"
        onClick={() => {
          setDraft(p)
          setEditing(true)
        }}
      >
        Edit details
      </button>
      <span className="pill-green grow">Temporary session</span>
    </section>
  )
}

export function Review({ state }: { state: SessionState }) {
  const [highlightId, setHighlightId] = useState<string | null>(null)
  return (
    <>
      <PatientBanner state={state} />
      <div className="review-grid">
        <Transcript state={state} highlightId={highlightId} />
        <Draft state={state} highlightId={highlightId} onHighlight={setHighlightId} />
        <ReviewItemsPanel state={state} onLocate={setHighlightId} />
      </div>
      <ReviewFooter state={state} />
    </>
  )
}
