// Activity and timeout rules (Blueprint §6.2, FR-16). Values are prototype defaults to confirm (§17).
export const WARN_MS = 13 * 60_000
export const TIMEOUT_MS = 15 * 60_000
export const ABSOLUTE_MS = 2 * 60 * 60_000
export const HEARTBEAT_MS = 60_000

export type TimerStatus = 'ok' | 'warn' | 'timeout'

export function evaluateTimers(
  startedAt: number | null,
  lastActivityAt: number | null,
  now: number,
): TimerStatus {
  if (startedAt === null || lastActivityAt === null) return 'ok'
  if (now - startedAt >= ABSOLUTE_MS) return 'timeout'
  const idle = now - lastActivityAt
  if (idle >= TIMEOUT_MS) return 'timeout'
  if (idle >= WARN_MS) return 'warn'
  return 'ok'
}

/** Milliseconds until the inactivity timeout, never negative. */
export function msUntilTimeout(lastActivityAt: number, now: number): number {
  return Math.max(0, TIMEOUT_MS - (now - lastActivityAt))
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}
