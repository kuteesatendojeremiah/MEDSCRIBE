// Upload-first input (ADR-0013, FR-03): which files the Record screen accepts. No content is read here.
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, checkUpload } from './upload'

const file = (name: string, type: string, size = 10) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('checkUpload', () => {
  it.each([
    ['visit.mp4', 'video/mp4'],
    ['visit.webm', 'video/webm'],
    ['visit.mov', 'video/quicktime'],
    ['visit.m4a', 'audio/mp4'],
    ['visit.wav', 'audio/wav'],
    ['visit.mp3', 'audio/mpeg'],
  ])('accepts %s', (name, type) => {
    expect(checkUpload(file(name, type))).toBeNull()
  })

  it('accepts a known extension when the browser gives no type', () => {
    expect(checkUpload(file('visit.m4a', ''))).toBeNull()
  })

  it('rejects other files with a content-free code', () => {
    expect(checkUpload(file('notes.pdf', 'application/pdf'))).toBe('E_UPLOAD_TYPE')
  })

  it('rejects an empty file', () => {
    expect(checkUpload(file('a.wav', 'audio/wav', 0))).toBe('E_EMPTY_AUDIO')
  })

  it('rejects a file over the size limit', () => {
    expect(checkUpload(file('a.mp4', 'video/mp4', MAX_UPLOAD_BYTES + 1))).toBe('E_UPLOAD_TOO_LARGE')
  })
})
