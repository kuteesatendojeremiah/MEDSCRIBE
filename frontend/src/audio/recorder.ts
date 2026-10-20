// MediaRecorder wrapper (FR-03, §10.2): chunks stay in memory; tracks and chunks are released on stop.
export class AudioRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.recorder = new MediaRecorder(this.stream)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(250)
  }

  pause() {
    if (this.recorder?.state === 'recording') this.recorder.pause()
  }

  resume() {
    if (this.recorder?.state === 'paused') this.recorder.resume()
  }

  /** Stop and return the recording; the microphone is released immediately. */
  stop(): Promise<Blob> {
    const recorder = this.recorder
    if (!recorder) return Promise.reject(new Error('not recording'))
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
        this.release()
        resolve(blob)
      }
      if (recorder.state !== 'inactive') {
        recorder.requestData() // flush what was captured so far
        recorder.stop()
      } else recorder.onstop?.(new Event('stop'))
    })
  }

  /** Release microphone and buffers without producing a recording (discard / unmount). */
  release() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
    this.chunks = []
  }
}
