// Stage B (§6.3): API calls are bounded; a timeout is a recoverable, content-free E_TIMEOUT and only
// idempotent GETs are retried (never a POST carrying clinical content).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiFailure, authStatus, extract, transcribe } from './client'

const hang = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })

describe('client timeouts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('a hanging transcribe call fails as recoverable E_TIMEOUT after 10 minutes and is not retried', async () => {
    const f = vi.fn(hang)
    vi.stubGlobal('fetch', f)
    const p = transcribe(new Blob(['x']), 'en').catch((e) => e)
    await vi.advanceTimersByTimeAsync(601_000)
    const e = await p
    expect(e).toBeInstanceOf(ApiFailure)
    expect(e.code).toBe('E_TIMEOUT')
    expect(e.klass).toBe('recoverable')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('extract times out sooner (60s) and is not retried', async () => {
    const f = vi.fn(hang)
    vi.stubGlobal('fetch', f)
    const p = extract([], {} as never).catch((e) => e)
    await vi.advanceTimersByTimeAsync(61_000)
    expect((await p).code).toBe('E_TIMEOUT')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('the idempotent status GET is retried once, then succeeds', async () => {
    const ok = new Response(JSON.stringify({ setup_needed: false, demo_login: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const f = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(ok)
    vi.stubGlobal('fetch', f)
    const p = authStatus()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await p).toEqual({ setup_needed: false, demo_login: false })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a POST is never retried on a network drop', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('network'))
    vi.stubGlobal('fetch', f)
    const p = extract([], {} as never).catch((e) => e)
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await p).code).toBe('E_NETWORK')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
