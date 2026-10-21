// FR-18 transcript search, and the guard that every free-text clinical input turns spellcheck and
// autocomplete off (Blueprint §10.2): browser spelling services would otherwise send text out.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { katoTranscript } from '../fixtures/kato'
import { searchSegments } from './Review'

describe('FR-18 transcript search', () => {
  it('finds text in the original or the translation, case-insensitively', () => {
    expect(searchSegments(katoTranscript, 'KIFUBA').map((s) => s.id)).toEqual(['s-001'])
    expect(searchSegments(katoTranscript, 'breathe').map((s) => s.id)).toEqual(['s-005'])
    expect(searchSegments(katoTranscript, 'bisoprolol').map((s) => s.id)).toEqual(['s-013'])
  })
  it('an empty or blank query returns everything; no match returns nothing', () => {
    expect(searchSegments(katoTranscript, '  ')).toHaveLength(15)
    expect(searchSegments(katoTranscript, 'zzzz')).toEqual([])
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('free-text inputs keep browser spelling services off (§10.2)', () => {
  it('every <input> that takes text sets spellCheck={false} and autoComplete="off"', () => {
    const offenders: string[] = []
    for (const file of walk(resolve(__dirname, '..')).filter(
      (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'),
    )) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/<input\b[\s\S]*?\/>/g)) {
        const tag = m[0]
        if (/type="(checkbox|file|range)"/.test(tag)) continue
        // Sign-in fields may use the standard credential tokens so password managers work.
        const autocompleteOk = /autoComplete="(off|username|current-password|new-password)"/.test(
          tag,
        )
        if (!/spellCheck=\{false\}/.test(tag) || !autocompleteOk) {
          offenders.push(`${file.split('src')[1]}: ${tag.slice(0, 60).replace(/\s+/g, ' ')}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

import { mmss } from '../components/common'

describe('mmss', () => {
  it('formats fractional seconds from a real speech model as whole mm:ss', () => {
    expect(mmss(8.4)).toBe('00:08')
    expect(mmss(75.9)).toBe('01:15')
    expect(mmss(8)).toBe('00:08')
  })
})
