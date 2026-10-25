// Screen 2 (Blueprint §8, Fig. 8): capture (FR-03), processing, recoverable errors (§6.3).
// Audio stays in tab memory only and is released as soon as it is no longer needed (§10.2).
import { useEffect, useRef, useState } from 'react'
import { audioBuffer } from '../audio/buffer'
import { AudioRecorder } from '../audio/recorder'
import { ACCEPT, UPLOAD_MESSAGES, checkUpload } from '../audio/upload'
import { InactivityNote } from '../components/common'
import { useNow } from '../session/hooks'
import { runPipeline } from '../session/pipeline'
import { sessionStore } from '../session/store'
import { processingStage } from '../session/selectors'
import { formatClock } from '../session/timers'
import type { SessionState } from '../session/types'

const MIN_RECORDING_MS = 1000 // a shorter recording has no usable audio
const BARS = Array.from({ length: 56 }, (_, i) => 14 + ((i * 37) % 46))

export function Record({ state }: { state: SessionState }) {
  const now = useNow()
  const { phase, paused } = state
  const recorder = useRef<AudioRecorder | null>(null)
  const [micReady, setMicReady] = useState(false)
  const [micError, setMicError] = useState<'denied' | 'unavailable' | null>(null)
  // Upload is the main input (ADR-0013); the microphone only starts when "Record now" is pressed.
  const [source, setSource] = useState<'choose' | 'recording'>('choose')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // Start the microphone when the clinician chooses to record; always release it on leaving.
  useEffect(() => {
    if (phase !== 'capture' || source !== 'recording') return
    const rec = new AudioRecorder()
    recorder.current = rec
    let live = true
    rec
      .start()
      .then(() => live && setMicReady(true))
      .catch(
        (e) =>
          live &&
          setMicError(
            e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable',
          ),
      )
    return () => {
      live = false
      rec.release()
      recorder.current = null
      setMicReady(false)
    }
  }, [phase, source])

  // Run transcription + extraction once when processing starts (and again on Retry).
  useEffect(() => {
    if (phase !== 'processing') return
    void runPipeline(sessionStore)
  }, [phase])

  const stop = async () => {
    const rec = recorder.current
    if (rec && micReady) audioBuffer.set(await rec.stop())
    sessionStore.dispatch({ type: 'STOP' })
  }

  const togglePause = () => {
    if (paused) recorder.current?.resume()
    else recorder.current?.pause()
    sessionStore.dispatch({ type: paused ? 'RESUME' : 'PAUSE' })
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const problem = checkUpload(file)
    if (problem) {
      setUploadError(UPLOAD_MESSAGES[problem])
      return
    }
    setUploadError(null)
    recorder.current?.release()
    audioBuffer.set(file)
    sessionStore.dispatch({ type: 'STOP' })
  }

  const elapsed =
    state.recordingMs + (state.recordingSince !== null ? now - state.recordingSince : 0)

  return (
    <div className="grid two">
      <section className="card record-card">
        {phase === 'capture' && (
          <>
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="audio-file"
              id="audio-file-input"
              hidden
            />
            {source === 'choose' && (
              <>
                <h2>Upload the recorded consultation</h2>
                <label
                  htmlFor="audio-file-input"
                  className={dragging ? 'dropzone dragging' : 'dropzone'}
                  data-testid="dropzone"
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    handleFile(e.dataTransfer.files?.[0])
                  }}
                >
                  <strong>Choose a video or audio file</strong>
                  <span className="muted">
                    or drag it here · mp4, mov, webm, m4a, wav, mp3 · up to 200 MB
                  </span>
                </label>
                {uploadError && (
                  <p className="muted small" role="alert" data-testid="upload-error">
                    {uploadError}
                  </p>
                )}
                <div className="row center">
                  <button
                    type="button"
                    className="btn outline"
                    data-testid="record-now"
                    onClick={() => setSource('recording')}
                  >
                    Or record now with the microphone
                  </button>
                </div>
              </>
            )}
            {source === 'recording' && (
              <>
                <div className={paused ? 'rec-status paused' : 'rec-status'}>
                  <span className="dot" />
                  {paused
                    ? 'PAUSED · microphone paused'
                    : micReady
                      ? 'RECORDING · microphone on'
                      : micError
                        ? 'MICROPHONE UNAVAILABLE'
                        : 'Starting microphone…'}
                </div>
                <div className="timer" aria-label="Recording time">
                  {formatClock(elapsed)}
                </div>
                <div className={paused ? 'wave paused' : 'wave'} aria-hidden="true">
                  {BARS.map((h, i) => (
                    <span key={i} style={{ height: h }} />
                  ))}
                </div>
                <div className="row center">
                  <button
                    type="button"
                    className="btn outline"
                    onClick={togglePause}
                    disabled={!micReady}
                  >
                    {paused ? '▶ Resume' : '❚❚ Pause'}
                  </button>
                  <button
                    type="button"
                    className="btn outline danger"
                    onClick={stop}
                    disabled={!micReady || elapsed < MIN_RECORDING_MS}
                    title={elapsed < MIN_RECORDING_MS ? 'Record for at least a second' : undefined}
                  >
                    ■ Stop &amp; process
                  </button>
                </div>
                <div className="row center">
                  <label htmlFor="audio-file-input" className="btn small outline upload">
                    Upload a recording instead
                  </label>
                </div>
              </>
            )}
            <div className="row center">
              <button
                type="button"
                className="link"
                data-testid="discard-recording"
                onClick={() => {
                  if (
                    window.confirm(
                      'Discard this recording? The audio is removed from this tab and the session ends.',
                    )
                  )
                    sessionStore.dispatch({ type: 'END_SESSION' })
                }}
              >
                {source === 'recording' ? 'Discard recording' : 'Cancel'}
              </button>
            </div>
            {micError && (
              <p className="muted small" role="alert">
                {micError === 'denied'
                  ? 'Microphone permission was denied. Allow microphone access for this site in your browser settings and start again, or upload a recording instead.'
                  : 'The microphone could not be opened. Check that it is connected and not in use, or upload a recording instead.'}
              </p>
            )}
          </>
        )}
        {phase === 'processing' && (
          <div role="status" className="center-col">
            <div className="spinner" />
            <h2>
              {processingStage(state) === 'transcribing' ? 'Transcribing…' : 'Drafting the note…'}
            </h2>
            <ol className="muted" data-testid="processing-steps">
              <li aria-current={processingStage(state) === 'transcribing' ? 'step' : undefined}>
                {processingStage(state) === 'transcribing' ? '▸' : '✔'} Transcribing and translating
              </li>
              <li aria-current={processingStage(state) === 'generating' ? 'step' : undefined}>
                {processingStage(state) === 'generating' ? '▸' : '○'} Drafting the note
              </li>
            </ol>
          </div>
        )}
        {phase === 'recoverable_error' && (
          <div role="alert" className="center-col">
            <div className="notice amber">
              <strong>Processing failed – your draft is kept.</strong>
              <br />
              Error code: <code>{state.errorCode}</code>. You can retry, or continue by typing the
              note yourself.
              {state.errorCode === 'E_EMPTY_AUDIO' && ' No audio was captured.'}
              {(state.errorCode === 'E_TIMEOUT' || state.errorCode === 'E_PROVIDER_TIMEOUT') &&
                ' The service took too long to answer.'}
            </div>
            <div className="row center">
              <button
                type="button"
                className="btn primary"
                onClick={() => sessionStore.dispatch({ type: 'RETRY' })}
              >
                Retry
              </button>
              <button
                type="button"
                className="btn outline"
                onClick={() => sessionStore.dispatch({ type: 'CONTINUE_MANUAL' })}
              >
                Continue with manual entry
              </button>
            </div>
          </div>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <h3>Live status</h3>
          <ul className="plain checks">
            <li>✓ Audio is held in this tab only</li>
            <li>✓ Sent over TLS for transcription once you upload or stop</li>
            <li>✓ Nothing is written to disk</li>
          </ul>
        </section>
        <section className="card">
          <h3>Tip</h3>
          <p>
            Say examination findings aloud if you can (“On examination…”). Anything you don&apos;t
            say can be typed in during review. A clear recording with little background noise gives
            the best transcript.
          </p>
        </section>
        <InactivityNote state={state} />
      </aside>
    </div>
  )
}
