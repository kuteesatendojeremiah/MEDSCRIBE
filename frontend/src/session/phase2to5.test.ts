// Phases 2-5 frontend logic: SHA-256 (FR-10/11), manual entry (FR-07), pipeline (§6.3, §12.2),
// download hygiene (§10.2), audio buffer (§10.2).
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import expectedHash from '@fixtures/kato_expected_note.sha256?raw'
import { ApiFailure } from '../api/client'
import { audioBuffer } from '../audio/buffer'
import { katoDraftNote, katoExpectedNote, katoSetup, katoTranscript } from '../fixtures/kato'
import { noteHash, shortHash } from './hash'
import { emptyState, reduce, type SessionEvent } from './reducer'
import { sha256Hex } from './sha256'
import { createSessionStore } from './store'
import type { SessionState } from './types'

const run = (s: SessionState, e: SessionEvent, now = 1000): SessionState => reduce(s, { ...e, now })
const review = () => {
  let s = run(emptyState(), { type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A. Nankya' })
  s = run(s, { type: 'STOP' })
  return run(s, { type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
}

describe('sha256 (FR-10, FR-11)', () => {
  it('matches node:crypto for edge-case lengths and unicode', () => {
    for (const text of [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      'é–SpO₂ 😀'.repeat(40),
    ]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
  })
  it('the Kato note hashes to the same constant the Python backend asserts', () => {
    expect(noteHash(katoExpectedNote)).toBe(expectedHash.trim())
  })
  it('ignores key order and approval; any change alters it', () => {
    const a = noteHash(katoExpectedNote)
    const n = JSON.parse(JSON.stringify(katoExpectedNote))
    n.approval = { approved_by: 'x' }
    expect(noteHash(n)).toBe(a)
    n.items[0].text += '.'
    expect(noteHash(n)).not.toBe(a)
    expect(shortHash(a)).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/)
  })
  it('approval stores the full 64-hex hash for /render', () => {
    let s = review()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(s, { type: 'PREVIEW' })
    s = run(s, { type: 'APPROVE' })
    expect(s.approval!.fullHash).toMatch(/^[0-9a-f]{64}$/)
    expect(s.approval!.fullHash).toBe(noteHash(s.note!))
  })
})

describe('manual entry, delete, move, segment edit (FR-07, §4.2)', () => {
  it('adds a finding to every section as clinician_entered with a unique id', () => {
    let s = review()
    for (const section of [
      'history',
      'meds_allergies',
      'vitals',
      'exam',
      'investigations',
      'assessment',
      'treatment',
      'plan',
    ] as const) {
      s = run(s, { type: 'ADD_NOTE_ITEM', section, text: `typed ${section}` })
    }
    const typed = s.note!.items.filter((i) => i.id.startsWith('m-'))
    expect(typed).toHaveLength(8)
    expect(new Set(typed.map((i) => i.id)).size).toBe(8)
    expect(typed.every((i) => i.source.type === 'clinician_entered')).toBe(true)
  })
  it('blank manual entry is ignored', () => {
    const s = review()
    expect(run(s, { type: 'ADD_NOTE_ITEM', section: 'exam', text: '   ' })).toBe(s)
  })
  it('any manual change resets approval', () => {
    let s = review()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(run(s, { type: 'PREVIEW' }), { type: 'APPROVE' })
    expect(s.approval).not.toBeNull()
    const after = run(s, { type: 'ADD_NOTE_ITEM', section: 'exam', text: 'new' })
    expect(after.approval).toBeNull()
    expect(after.phase).toBe('review')
  })
  it('deleting an item keeps its review item, unlinked, so a HIGH flag cannot be bypassed', () => {
    const s = run(review(), { type: 'DELETE_NOTE_ITEM', id: 'f-016' })
    expect(s.note!.items.some((i) => i.id === 'f-016')).toBe(false)
    const r = s.note!.review_items.find((x) => x.id === 'r-001')!
    expect(r.item_id).toBeNull()
    expect(r.status).toBe('open')
    expect(s.originals['f-016']).toBeDefined()
  })
  it('moving an item changes its section and tags it edited', () => {
    const s = run(review(), { type: 'MOVE_NOTE_ITEM', id: 'f-001', section: 'exam' })
    const it = s.note!.items.find((i) => i.id === 'f-001')!
    expect(it.section).toBe('exam')
    expect(it.source.type).toBe('clinician_edited')
  })
  it('editing a segment changes the translation when present, else the original', () => {
    let s = run(review(), { type: 'EDIT_SEGMENT', segmentId: 's-001', text: 'fixed translation' })
    expect(s.transcript!.find((t) => t.id === 's-001')!.english_text).toBe('fixed translation')
    s = run(s, { type: 'EDIT_SEGMENT', segmentId: 's-002', text: 'fixed original' })
    expect(s.transcript!.find((t) => t.id === 's-002')!.original_text).toBe('fixed original')
  })
  it('keeps the transcript when a recoverable error happens after transcription', () => {
    let s = run(run(emptyState(), { type: 'START_SESSION', setup: katoSetup }), { type: 'STOP' })
    s = run(s, { type: 'TRANSCRIPT_READY', transcript: katoTranscript })
    s = run(s, { type: 'RECOVERABLE_ERROR', code: 'E_EXTRACT_INVALID' })
    expect(s.transcript).toHaveLength(15)
    expect(run(s, { type: 'CONTINUE_MANUAL' }).note!.items).toEqual([])
  })
  it('header built for a blank note carries the entered values and the clinician', () => {
    let s = run(
      run(emptyState(), { type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A. Nankya' }),
      { type: 'STOP' },
    )
    s = run(s, { type: 'RECOVERABLE_ERROR', code: 'E_NETWORK' })
    const h = run(s, { type: 'CONTINUE_MANUAL' }).note!.header
    expect(h.clinician).toBe('Dr. A. Nankya')
    expect(h.patient).toEqual({
      name: 'Ronald Kato (FICTIONAL)',
      age: '58',
      sex: 'Male',
      file_number: 'OPD-07',
      residence: 'Kampala',
    })
    expect(h.temp_ref).toBe(katoSetup.tempRef)
  })
})

describe('pipeline (§6.3, §12.2)', () => {
  beforeEach(() => {
    audioBuffer.set(new Blob(['x'], { type: 'audio/webm' }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    audioBuffer.clear()
  })

  const header = { ok: true }
  void header

  async function pipelineWith(fetchImpl: (url: string) => Promise<Response>) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => fetchImpl(url)),
    )
    const { runPipeline } = await import('./pipeline')
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup, clinician: 'Dr. A. Nankya' })
    store.dispatch({ type: 'STOP' })
    await runPipeline(store)
    return store
  }

  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

  it('success: transcribe then extract lands in Review', async () => {
    const store = await pipelineWith((url) =>
      url.endsWith('/transcribe')
        ? json({ segments: katoTranscript })
        : json({ note: katoDraftNote() }),
    )
    expect(store.getState().phase).toBe('review')
    expect(store.getState().transcript).toHaveLength(15)
  })

  it('a provider timeout is recoverable and keeps the audio for retry', async () => {
    const store = await pipelineWith(() =>
      json({ error: 'E_PROVIDER_TIMEOUT', class: 'recoverable' }, 502),
    )
    expect(store.getState().phase).toBe('recoverable_error')
    expect(store.getState().errorCode).toBe('E_PROVIDER_TIMEOUT')
    expect(audioBuffer.has()).toBe(true)
  })

  it('a server-side provider timeout (504) is recoverable and keeps the audio', async () => {
    const store = await pipelineWith(() =>
      json({ error: 'E_PROVIDER_TIMEOUT', class: 'recoverable' }, 504),
    )
    expect(store.getState().phase).toBe('recoverable_error')
    expect(store.getState().errorCode).toBe('E_PROVIDER_TIMEOUT')
    expect(audioBuffer.has()).toBe(true)
  })

  it('a client-side timeout after transcription keeps the transcript for retry', async () => {
    const store = await pipelineWith((url) =>
      url.endsWith('/transcribe')
        ? json({ segments: katoTranscript })
        : Promise.reject(new DOMException('aborted', 'AbortError')),
    )
    expect(store.getState().phase).toBe('recoverable_error')
    expect(store.getState().errorCode).toBe('E_TIMEOUT')
    expect(store.getState().transcript).toHaveLength(15)
  })

  it('a network drop is recoverable', async () => {
    const store = await pipelineWith(() => Promise.reject(new TypeError('network')))
    expect(store.getState().phase).toBe('recoverable_error')
    expect(store.getState().errorCode).toBe('E_NETWORK')
  })

  it('malformed AI output (extract fails) is recoverable and keeps the transcript', async () => {
    const store = await pipelineWith((url) =>
      url.endsWith('/transcribe')
        ? json({ segments: katoTranscript })
        : json({ error: 'E_EXTRACT_INVALID', class: 'recoverable' }, 502),
    )
    expect(store.getState().phase).toBe('recoverable_error')
    expect(store.getState().transcript).toHaveLength(15)
    expect(store.getState().note).toBeNull() // never shows partial invalid output
  })

  it('a rejected token is terminal and clears everything', async () => {
    const store = await pipelineWith(() =>
      json({ error: 'E_TOKEN_INVALID', class: 'terminal' }, 401),
    )
    expect(store.getState().phase).toBe('terminal_error')
    expect(store.getState().transcript).toBeNull()
  })

  it('ApiFailure carries only a code and a class', () => {
    const e = new ApiFailure('E_X', 'terminal')
    expect(Object.keys(e).sort()).toEqual(['code', 'klass'])
  })
})

describe('audio buffer (§10.2)', () => {
  it('holds a blob only until cleared', () => {
    audioBuffer.set(new Blob(['a']))
    expect(audioBuffer.has()).toBe(true)
    audioBuffer.clear()
    expect(audioBuffer.get()).toBeNull()
  })
})

describe('download hygiene (§10.2, FR-13)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('saves with the neutral name, revokes the blob URL, and marks the draft exported', async () => {
    vi.useFakeTimers()
    const created = vi.fn(() => 'blob:fake')
    const revoked = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }))
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Blob(['PK']), { status: 200 }))),
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toMatch(/^consultation_note_\d{4}-\d{2}-\d{2}_\d{4}\.docx$/)
      expect(this.download).not.toMatch(/kato|ronald/i)
    })
    const { downloadApproved } = await import('./download')
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    store.dispatch({ type: 'STOP' })
    store.dispatch({ type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
    for (const id of ['r-001', 'r-002']) store.dispatch({ type: 'MARK_UNVERIFIED', id })
    store.dispatch({ type: 'PREVIEW' })
    store.dispatch({ type: 'APPROVE' })
    const r = await downloadApproved(store)
    expect(r.ok).toBe(true)
    expect(click).toHaveBeenCalledOnce()
    expect(store.getState().exported).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(revoked).toHaveBeenCalledWith('blob:fake') // revoked right after use
  })

  it('a hash mismatch from the server is terminal and clears the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'E_HASH_MISMATCH', class: 'terminal' }), {
            status: 409,
          }),
        ),
      ),
    )
    const { downloadApproved } = await import('./download')
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    store.dispatch({ type: 'STOP' })
    store.dispatch({ type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
    for (const id of ['r-001', 'r-002']) store.dispatch({ type: 'MARK_UNVERIFIED', id })
    store.dispatch({ type: 'PREVIEW' })
    store.dispatch({ type: 'APPROVE' })
    const r = await downloadApproved(store)
    expect(r).toEqual({ ok: false, code: 'E_HASH_MISMATCH' })
    expect(store.getState().phase).toBe('terminal_error')
    expect(store.getState().note).toBeNull()
  })

  it('a recoverable render failure keeps the approved version for regeneration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'E_PDF_FAILED', class: 'recoverable' }), {
            status: 502,
          }),
        ),
      ),
    )
    const { downloadApproved } = await import('./download')
    const store = createSessionStore()
    store.dispatch({ type: 'START_SESSION', setup: katoSetup })
    store.dispatch({ type: 'STOP' })
    store.dispatch({ type: 'PROCESS_OK', transcript: katoTranscript, note: katoDraftNote() })
    for (const id of ['r-001', 'r-002']) store.dispatch({ type: 'MARK_UNVERIFIED', id })
    store.dispatch({ type: 'PREVIEW' })
    store.dispatch({ type: 'APPROVE' })
    const r = await downloadApproved(store)
    expect(r).toEqual({ ok: false, code: 'E_PDF_FAILED' })
    expect(store.getState().phase).toBe('approved')
    expect(store.getState().approval).not.toBeNull()
  })
})

describe('REPLACE_NOTE (rebuild from transcript)', () => {
  it('swaps the note, keeps the transcript, resets review progress and approval', () => {
    let s = review()
    s = run(s, { type: 'ADD_NOTE_ITEM', section: 'exam', text: 'typed finding' })
    s = run(s, { type: 'OPEN_REVIEW_ITEM', id: 'r-001' })
    const fresh = katoDraftNote()
    fresh.items = fresh.items.slice(0, 2)
    s = run(s, { type: 'REPLACE_NOTE', note: fresh })
    expect(s.note!.items).toHaveLength(2)
    expect(s.openedReviewIds).toEqual([])
    expect(s.originals).toEqual({})
    expect(s.transcript).toHaveLength(15)
    expect(s.approval).toBeNull()
  })
  it('after approval it returns to Review', () => {
    let s = review()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(run(s, { type: 'PREVIEW' }), { type: 'APPROVE' })
    expect(run(s, { type: 'REPLACE_NOTE', note: katoDraftNote() }).phase).toBe('review')
  })
})

describe('misheard-term suggestions (offered, never auto-applied)', () => {
  const withSuggestion = () => {
    let s = run(run(emptyState(), { type: 'START_SESSION', setup: katoSetup }), { type: 'STOP' })
    const transcript = katoTranscript.map((t) =>
      t.id === 's-013'
        ? { ...t, english_text: null, original_text: 'We start bysoprylol twice daily.' }
        : t,
    )
    s = run(s, {
      type: 'TRANSCRIPT_READY',
      transcript,
      suggestions: [
        {
          id: 'g-001',
          segment_id: 's-013',
          field: 'original',
          heard: 'bysoprylol',
          suggest: 'bisoprolol',
          score: 0.9,
        },
      ],
    })
    return run(s, { type: 'PROCESS_OK', transcript, note: katoDraftNote() })
  }

  it('suggestions arrive with the transcript and change nothing by themselves', () => {
    const s = withSuggestion()
    expect(s.suggestions).toHaveLength(1)
    expect(s.transcript!.find((t) => t.id === 's-013')!.original_text).toContain('bysoprylol')
  })
  it('accepting replaces only the heard phrase in that segment and removes the suggestion', () => {
    const s = run(withSuggestion(), { type: 'APPLY_SUGGESTION', id: 'g-001' })
    expect(s.transcript!.find((t) => t.id === 's-013')!.original_text).toBe(
      'We start bisoprolol twice daily.',
    )
    expect(s.suggestions).toEqual([])
  })
  it('accepting after approval resets approval (the transcript changed)', () => {
    let s = withSuggestion()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(run(s, { type: 'PREVIEW' }), { type: 'APPROVE' })
    const after = run(s, { type: 'APPLY_SUGGESTION', id: 'g-001' })
    expect(after.phase).toBe('review')
    expect(after.approval).toBeNull()
  })
  it('ignoring removes it without touching the transcript', () => {
    const s = run(withSuggestion(), { type: 'DISMISS_SUGGESTION', id: 'g-001' })
    expect(s.suggestions).toEqual([])
    expect(s.transcript!.find((t) => t.id === 's-013')!.original_text).toContain('bysoprylol')
  })
  it('a suggestion whose text was already edited away is dropped quietly', () => {
    let s = withSuggestion()
    s = run(s, { type: 'EDIT_SEGMENT', segmentId: 's-013', text: 'We start bisoprolol.' })
    expect(run(s, { type: 'APPLY_SUGGESTION', id: 'g-001' }).suggestions).toEqual([])
  })
  it('ending the session clears suggestions', () => {
    expect(run(withSuggestion(), { type: 'END_SESSION' }).suggestions).toEqual([])
  })
})

describe('assign roles by voice (a hint the clinician confirms)', () => {
  const withVoices = () => {
    const transcript = katoTranscript.map((t, i) => ({
      ...t,
      speaker_role: 'unknown' as const,
      voice: i % 2 === 0 ? 1 : 2,
    }))
    let s = run(run(emptyState(), { type: 'START_SESSION', setup: katoSetup }), { type: 'STOP' })
    s = run(s, { type: 'TRANSCRIPT_READY', transcript })
    return run(s, { type: 'PROCESS_OK', transcript, note: katoDraftNote() })
  }
  it('sets the role of every segment with that voice, and only those', () => {
    const s = run(withVoices(), { type: 'ASSIGN_VOICE_ROLES', roles: { 1: 'doctor' } })
    const roles = s.transcript!.map((t) => [t.voice, t.speaker_role])
    expect(roles.filter(([v]) => v === 1).every(([, r]) => r === 'doctor')).toBe(true)
    expect(roles.filter(([v]) => v === 2).every(([, r]) => r === 'unknown')).toBe(true)
  })
  it('never invents a role for a segment that has no voice', () => {
    const base = withVoices()
    const noVoice = { ...base, transcript: base.transcript!.map((t) => ({ ...t, voice: null })) }
    expect(run(noVoice, { type: 'ASSIGN_VOICE_ROLES', roles: { 1: 'doctor', 2: 'patient' } })).toBe(
      noVoice,
    )
  })
  it('after approval it returns to Review and clears approval', () => {
    let s = withVoices()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(run(s, { type: 'PREVIEW' }), { type: 'APPROVE' })
    const after = run(s, { type: 'ASSIGN_VOICE_ROLES', roles: { 1: 'doctor' } })
    expect(after.phase).toBe('review')
    expect(after.approval).toBeNull()
  })
})

describe('the rendered file is held in memory only and cleared with the approval', () => {
  it('readyFile is empty until a file is rendered and clearReadyFile empties it', async () => {
    const { readyFile, clearReadyFile, saveReady } = await import('./download')
    clearReadyFile()
    expect(readyFile()).toBeNull()
    expect(saveReady()).toBe(false)
  })
})

describe('patient details (ADR-0007)', () => {
  it('only typed details reach the header; nothing is invented', async () => {
    const { buildHeader } = await import('./header')
    const none = buildHeader(
      { ...katoSetup, patient: { name: '', age: '', sex: '', fileNumber: '', residence: '' } },
      'Dr',
      0,
    )
    expect(none.patient).toBeUndefined()
    const some = buildHeader(
      {
        ...katoSetup,
        patient: { name: ' Grace ', age: '', sex: 'Female', fileNumber: '', residence: '' },
      },
      'Dr',
      0,
    )
    expect(some.patient).toEqual({ name: 'Grace', sex: 'Female' })
  })
  it('editing the details updates the setup and the note header, and cancels an approval', () => {
    let s = review()
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-001' })
    s = run(s, { type: 'MARK_UNVERIFIED', id: 'r-002' })
    s = run(run(s, { type: 'PREVIEW' }), { type: 'APPROVE' })
    const patient = {
      name: 'Corrected Name',
      age: '59',
      sex: 'Male',
      fileNumber: 'F-9',
      residence: '',
    }
    const after = run(s, { type: 'EDIT_PATIENT', patient })
    expect(after.setup.patient.name).toBe('Corrected Name')
    expect(after.note!.header.patient).toEqual({
      name: 'Corrected Name',
      age: '59',
      sex: 'Male',
      file_number: 'F-9',
    })
    expect(after.phase).toBe('review')
    expect(after.approval).toBeNull()
  })
  it('the details are cleared when the session ends', () => {
    const s = run(review(), { type: 'END_SESSION' })
    expect(s.setup.patient.name).toBe('')
  })
})
