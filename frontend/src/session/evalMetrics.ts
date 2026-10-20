// Evaluation mode (Blueprint §14 Phase 6, §15.4, §16): CONTENT-FREE metrics only.
// Counts, durations and section names. Never any transcript, note, name or free text.
import type { StampedEvent } from './reducer'
import type { SessionState } from './types'

export interface EvalMetrics {
  schema: 1
  review_seconds: number
  approval_seconds: number | null
  edits_by_section: Record<string, number>
  review_items_by_level: Record<string, number>
  review_items_final_status: Record<string, number>
  segment_edits: number
  role_reassignments: number
  items_added: number
  items_deleted: number
  items_moved: number
  high_items_opened: number
  preview_visits: number
  approvals: number
  recoverable_errors: number
  terminal_errors: number
}

const empty = (): EvalMetrics => ({
  schema: 1,
  review_seconds: 0,
  approval_seconds: null,
  edits_by_section: {},
  review_items_by_level: {},
  review_items_final_status: {},
  segment_edits: 0,
  role_reassignments: 0,
  items_added: 0,
  items_deleted: 0,
  items_moved: 0,
  high_items_opened: 0,
  preview_visits: 0,
  approvals: 0,
  recoverable_errors: 0,
  terminal_errors: 0,
})

export function createMetrics() {
  let m = empty()
  let reviewStart: number | null = null
  let lastNow = 0

  const bump = (section: string) => {
    m.edits_by_section[section] = (m.edits_by_section[section] ?? 0) + 1
  }

  /** Called by the store after every event. Reads only structure, never text. */
  function observe(e: StampedEvent, before: SessionState, after: SessionState) {
    lastNow = e.now
    if (e.type === 'START_SESSION' && after.phase === 'capture') {
      m = empty()
      reviewStart = null
    }
    if (before.phase !== 'review' && after.phase === 'review' && reviewStart === null) {
      reviewStart = e.now
      for (const r of after.note?.review_items ?? []) {
        m.review_items_by_level[r.level] = (m.review_items_by_level[r.level] ?? 0) + 1
      }
    }
    switch (e.type) {
      case 'RECOVERABLE_ERROR':
        m.recoverable_errors++
        break
      case 'TERMINAL_ERROR':
        m.terminal_errors++
        break
      case 'OPEN_REVIEW_ITEM':
        if (after.openedReviewIds.length > before.openedReviewIds.length) {
          const r = after.note?.review_items.find((x) => x.id === e.id)
          if (r?.level === 'HIGH') m.high_items_opened++
        }
        break
      case 'EDIT_NOTE_ITEM': {
        const it = before.note?.items.find((i) => i.id === e.id)
        if (it && after !== before) bump(it.section)
        break
      }
      case 'RESOLVE_ITEM': {
        const ri = before.note?.review_items.find((r) => r.id === e.id)
        const it = before.note?.items.find((i) => i.id === ri?.item_id)
        if (it && after !== before) bump(it.section)
        break
      }
      case 'ADD_NOTE_ITEM':
        if (after !== before) {
          bump(e.section)
          m.items_added++
        }
        break
      case 'DELETE_NOTE_ITEM': {
        const it = before.note?.items.find((i) => i.id === e.id)
        if (it && after !== before) {
          bump(it.section)
          m.items_deleted++
        }
        break
      }
      case 'MOVE_NOTE_ITEM':
        if (after !== before) {
          bump(e.section)
          m.items_moved++
        }
        break
      case 'EDIT_SEGMENT':
        if (after !== before) m.segment_edits++
        break
      case 'REASSIGN_ROLE':
        if (after !== before) m.role_reassignments++
        break
      case 'PREVIEW':
        if (after.phase === 'preview') m.preview_visits++
        break
      case 'APPROVE':
        if (after.phase === 'approved') {
          m.approvals++
          if (m.approval_seconds === null && reviewStart !== null) {
            m.approval_seconds = Math.round((e.now - reviewStart) / 1000)
          }
        }
        break
    }
    if (reviewStart !== null) m.review_seconds = Math.round((e.now - reviewStart) / 1000)
    const status: Record<string, number> = {}
    for (const r of after.note?.review_items ?? []) status[r.status] = (status[r.status] ?? 0) + 1
    if (after.note) m.review_items_final_status = status
  }

  return {
    observe,
    snapshot: (): EvalMetrics => ({
      ...m,
      review_seconds:
        reviewStart === null ? 0 : m.review_seconds || Math.round((lastNow - reviewStart) / 1000),
    }),
    reset() {
      m = empty()
      reviewStart = null
    },
  }
}

export type Metrics = ReturnType<typeof createMetrics>

/** Evaluation mode is opt-in: `?eval=1` in the URL or VITE_EVAL=1 at build time. */
export function evalModeEnabled(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get('eval') === '1' ||
      import.meta.env.VITE_EVAL === '1'
    )
  } catch {
    return false
  }
}
