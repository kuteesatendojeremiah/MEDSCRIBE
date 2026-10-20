// Rebuild the draft note from the transcript as it is now (after role and wording corrections).
import { ApiFailure, extract } from '../api/client'
import { buildHeader } from './header'
import type { SessionStore } from './store'

export interface RebuildOptions {
  /** Ask before replacing; callers pass false when nothing typed by the clinician would be lost. */
  confirm?: boolean
}

export function hasTypedFindings(store: SessionStore): boolean {
  const note = store.getState().note
  return !!note && note.items.some((i) => i.source.type !== 'segment')
}

/** Returns an error code, or null on success (or when the clinician declined). */
export async function rebuildNote(
  store: SessionStore,
  opts: RebuildOptions = {},
): Promise<string | null> {
  const state = store.getState()
  if (!state.transcript) return 'E_NO_TRANSCRIPT'
  if (
    (opts.confirm ?? true) &&
    !window.confirm(
      'Rebuild the note from the current transcript? This replaces the draft note, including any findings you typed, and resets review progress.',
    )
  ) {
    return null
  }
  try {
    const header = buildHeader(state.setup, state.clinician, state.startedAt ?? Date.now())
    const { note } = await extract(state.transcript, header)
    store.dispatch({ type: 'REPLACE_NOTE', note })
    return null
  } catch (e) {
    if (e instanceof ApiFailure && e.klass === 'terminal') {
      store.dispatch({ type: 'TERMINAL_ERROR', code: e.code })
    }
    return e instanceof ApiFailure ? e.code : 'E_UNEXPECTED'
  }
}
