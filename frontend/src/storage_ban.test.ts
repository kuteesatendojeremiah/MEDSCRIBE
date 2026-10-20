// Blueprint §10.2, §15.2, FR-17, CLAUDE.md rule 2: fail if browser storage is referenced in src/.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Built from parts so this file does not contain the banned words itself.
const BANNED = [
  ['local', 'Storage'],
  ['session', 'Storage'],
  ['indexed', 'DB'],
  ['service', 'Worker'],
  ['document', '.cookie'],
].map((p) => p.join(''))

export function findViolations(source: string): string[] {
  return BANNED.filter((b) => source.includes(b))
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe('storage ban', () => {
  it('scanner detects every banned API (self-test)', () => {
    for (const b of BANNED) expect(findViolations(`x = ${b}.getItem('a')`)).toContain(b)
    expect(findViolations('const a = 1')).toEqual([])
  })

  it('no source file references browser storage', () => {
    const self = resolve(__dirname, 'storage_ban.test.ts')
    const offenders = walk(resolve(__dirname))
      .filter((f) => /\.(ts|tsx|js|jsx|html)$/.test(f) && resolve(f) !== self)
      .filter((f) => findViolations(readFileSync(f, 'utf8')).length > 0)
    expect(offenders).toEqual([])
  })
})
