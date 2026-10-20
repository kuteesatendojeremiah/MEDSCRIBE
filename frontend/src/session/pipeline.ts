// Processing pipeline after Stop (Blueprint §3 steps 4-6, §6.3, §12.2):
// transcribe -> extract. Recoverable failures keep the draft; terminal ones clear it.
import { audioBuffer } from '../audio/buffer'
import { ApiFailure, extract, transcribe } from '../api/client'
import { buildHeader } from './header'
import type { SessionStore } from './store'

export async function runPipeline(store: SessionStore): Promise<void> {
  const s0 = store.getState()
  try {
    let transcript = s0.transcript
    if (!transcript) {
      const audio = audioBuffer.get()
      if (!audio) throw new ApiFailure('E_NO_AUDIO', 'recoverable')
      const heard = await transcribe(audio, s0.setup.languages)
      transcript = heard.segments
      store.dispatch({ type: 'TRANSCRIPT_READY', transcript, suggestions: heard.suggestions })
    }
    const header = buildHeader(s0.setup, s0.clinician, s0.startedAt ?? Date.now())
    const { note } = await extract(transcript, header)
    store.dispatch({ type: 'PROCESS_OK', transcript, note })
  } catch (e) {
    const code = e instanceof ApiFailure ? e.code : 'E_UNEXPECTED'
    const klass = e instanceof ApiFailure ? e.klass : 'recoverable'
    store.dispatch(
      klass === 'terminal' ? { type: 'TERMINAL_ERROR', code } : { type: 'RECOVERABLE_ERROR', code },
    )
  }
}
