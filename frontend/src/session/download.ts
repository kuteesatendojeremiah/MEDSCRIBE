// Download of the approved document (Blueprint §10.2, §12.1 steps 4-5, FR-13).
// The blob is held only for the click and its URL is revoked straight after; the file name is neutral.
import { ApiFailure, renderFinal } from '../api/client'
import { neutralFileName } from './filename'
import type { SessionStore } from './store'

export type DownloadResult = { ok: true } | { ok: false; code: string }

/** The rendered file, held in tab memory only so the clinician can press Download as often as needed
 * without re-rendering. Never stored; cleared when the approval ends or the session is over. */
let ready: { blob: Blob; name: string } | null = null
export const readyFile = () => (ready ? { name: ready.name, bytes: ready.blob.size } : null)
export const clearReadyFile = () => {
  ready = null
}

/** Save the file already rendered (a user click, so the browser always allows it). */
export function saveReady(): boolean {
  if (!ready) return false
  saveBlob(ready.blob, ready.name)
  return true
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000) // revoke right after use (§10.2)
}

/** Render and save the approved version. Recoverable failures keep the approved version (§12.2). */
let rendering: Promise<DownloadResult> | null = null

/** Duplicate clicks join the render in progress, so one approval never produces two exports at once. */
export function downloadApproved(store: SessionStore): Promise<DownloadResult> {
  if (rendering) return rendering
  rendering = renderAndSave(store).finally(() => {
    rendering = null
  })
  return rendering
}

async function renderAndSave(store: SessionStore): Promise<DownloadResult> {
  const s = store.getState()
  if (s.phase !== 'approved' || !s.note || !s.approval) return { ok: false, code: 'E_NOT_APPROVED' }
  try {
    const blob = await renderFinal(
      s.note,
      s.approval.fullHash,
      s.approval.approvedAt,
      s.format,
      s.setup.template,
    )
    ready = { blob, name: neutralFileName(new Date(s.approval.approvedAt), s.format) }
    saveBlob(ready.blob, ready.name)
    store.dispatch({ type: 'DOWNLOAD_DONE' })
    return { ok: true }
  } catch (e) {
    const code = e instanceof ApiFailure ? e.code : 'E_UNEXPECTED'
    if (e instanceof ApiFailure && e.klass === 'terminal') {
      store.dispatch({ type: 'TERMINAL_ERROR', code }) // hash mismatch etc.: clear everything (§6.3)
    }
    return { ok: false, code }
  }
}
