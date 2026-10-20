// In-memory audio buffer (Blueprint §10.2): kept only so a recoverable error can retry (§12.2),
// and dropped the moment it is no longer needed. Never persisted, never turned into a stored URL.
let held: Blob | null = null

export const audioBuffer = {
  set(blob: Blob) {
    held = blob
  },
  get(): Blob | null {
    return held
  },
  /** Drop the audio so it can be garbage-collected. */
  clear() {
    held = null
  },
  has: () => held !== null,
}
