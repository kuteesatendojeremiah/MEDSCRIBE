// Version hash of the approved note (Blueprint §12, FR-10, FR-11): SHA-256 of canonical JSON.
// Canonical form = sorted keys, no whitespace, UTF-8; the backend recomputes it identically
// (`app/render/hash.py`) and refuses to render on a mismatch.
import { sha256Hex } from './sha256'
import type { Note } from './types'

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Full 64-hex SHA-256 over the note (the approval itself is never part of what is hashed). */
export function noteHash(note: Note): string {
  const { header, items, review_items } = note
  return sha256Hex(canonicalJson({ header, items, review_items }))
}

/** Short form shown to the clinician and printed on the note, e.g. `a3f9-27c1`. */
export function shortHash(full: string): string {
  return `${full.slice(0, 4)}-${full.slice(4, 8)}`
}
