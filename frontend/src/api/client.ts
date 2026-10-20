// Thin API client (Blueprint §5.1, §10.4). The session token lives in module memory only and is
// sent in the Authorization header, never in a URL (CLAUDE.md rules 2 and 9).
import type { Note, NoteHeader, Segment, Suggestion } from '../session/types'

export type ErrorClass = 'recoverable' | 'terminal'

export class ApiFailure extends Error {
  readonly code: string
  readonly klass: ErrorClass
  constructor(code: string, klass: ErrorClass) {
    super(code)
    this.code = code
    this.klass = klass
  }
}

let token: string | null = null
let user: AuthUser | null = null
let onUnauthorized: (() => void) | null = null

export interface AuthUser {
  username: string
  name: string
  role: 'admin' | 'doctor'
}

export const getUser = () => user
/** Called when the server says the token is no longer valid (expired, revoked, tampered). */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn
}
const BASE = '/api'

export const hasToken = () => token !== null
export const clearToken = () => {
  token = null
  user = null
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' })
  } catch {
    throw new ApiFailure('E_NETWORK', 'recoverable') // network drop keeps the draft (§6.3)
  }
  if (!res.ok) {
    let code = `E_HTTP_${res.status}`
    let klass: ErrorClass = res.status === 401 ? 'terminal' : 'recoverable'
    try {
      const body = await res.json()
      if (typeof body.error === 'string') code = body.error
      if (body.class === 'terminal' || body.class === 'recoverable') klass = body.class
    } catch {
      /* content-free fallback code above */
    }
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized?.()
    throw new ApiFailure(code, klass)
  }
  return res
}

interface SessionBody {
  token: string
  user: AuthUser
}

function adopt(body: SessionBody): AuthUser {
  token = body.token
  user = body.user
  return body.user
}

export interface AuthStatus {
  setup_needed: boolean
  demo_login: boolean
}

export async function authStatus(): Promise<AuthStatus> {
  return (await (await request('/auth/status')).json()) as AuthStatus
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password }),
  })
  return adopt((await res.json()) as SessionBody)
}

/** First run only: creates the first administrator and signs them in. */
export async function setupFirstAccount(
  username: string,
  name: string,
  password: string,
): Promise<AuthUser> {
  const res = await request('/auth/setup', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, name, password }),
  })
  return adopt((await res.json()) as SessionBody)
}

/** Demonstration sign-in; the server refuses it unless DEV_AUTH_ENABLED=true. */
export async function demoLogin(name = 'Demo doctor'): Promise<AuthUser> {
  const res = await request('/auth/dev-login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  })
  return adopt((await res.json()) as SessionBody)
}

export async function signOut(): Promise<void> {
  if (token) {
    try {
      await request('/auth/session', { method: 'DELETE' })
    } catch {
      /* the token is short-lived anyway (ADR-0003) */
    }
  }
  token = null
  user = null
}

export async function listUsers(): Promise<AuthUser[]> {
  return ((await (await request('/admin/users')).json()).users ?? []) as AuthUser[]
}

export async function addUser(username: string, name: string, password: string): Promise<void> {
  await request('/admin/users', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, name, password }),
  })
}

export async function resetPassword(username: string, password: string): Promise<void> {
  await request(`/admin/users/${encodeURIComponent(username)}/password`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ password }),
  })
}

export async function removeUser(username: string): Promise<void> {
  await request(`/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' })
}

export async function refreshToken(): Promise<void> {
  if (!token) return
  const res = await request('/auth/refresh', { method: 'POST' })
  token = (await res.json()).token
}

export interface TranscribeResult {
  segments: Segment[]
  suggestions: Suggestion[]
}

export async function transcribe(audio: Blob, languages: string): Promise<TranscribeResult> {
  const res = await request('/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': audio.type || 'application/octet-stream',
      'X-Expected-Languages': languages,
    },
    body: audio,
  })
  const body = await res.json()
  return {
    segments: body.segments as Segment[],
    suggestions: (body.suggestions ?? []) as Suggestion[],
  }
}

export interface ExtractResult {
  note: Note
}

export async function extract(segments: Segment[], header: NoteHeader): Promise<ExtractResult> {
  const res = await request('/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments, header }),
  })
  return (await res.json()) as ExtractResult
}

export interface PreviewDocument {
  title: string
  demo_line: string | null
  header_rows: Array<{ label: string; value: string }>
  sections: Array<{ title: string; lines: Array<{ text: string; unverified: boolean }> }>
  review: Array<{ text: string; unverified: boolean }>
  footer: string
  short_hash: string
}

/** Server-side preview of exactly what the export will contain (FR-10, §12.1). */
export async function renderPreview(note: Note): Promise<PreviewDocument> {
  const res = await request('/render?mode=preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
  return (await res.json()).document as PreviewDocument
}

/** Final export: the server re-hashes the note and refuses on any mismatch (FR-11). */
export async function renderFinal(
  note: Note,
  approvedHash: string,
  approvedAt: number,
  format: 'docx' | 'pdf',
): Promise<Blob> {
  const res = await request(`/render?mode=final&format=${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note,
      approved_hash: approvedHash,
      approved_at: new Date(approvedAt).toISOString(),
    }),
  })
  return await res.blob()
}

export interface ServerInfo {
  speech: 'mock' | 'local'
  speech_model: string | null
  synthetic_only: boolean
}

/** What is processing audio: lets the UI say honestly whether a real model is in use. */
export async function getInfo(): Promise<ServerInfo> {
  const res = await request('/info')
  return (await res.json()) as ServerInfo
}
