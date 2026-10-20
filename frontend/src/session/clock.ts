export interface Clock {
  now(): number
}

export const realClock: Clock = { now: () => Date.now() }

export function createFakeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance(ms: number) {
      t += ms
    },
    set(ms: number) {
      t = ms
    },
  }
}
