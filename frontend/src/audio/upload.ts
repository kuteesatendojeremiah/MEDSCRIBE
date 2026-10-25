// Which recordings the Record screen accepts (ADR-0013, FR-03). Only the name, type and size are looked
// at; the bytes stay in memory and go to /transcribe, where the server limit applies as well.
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // keep in step with MAX_UPLOAD_BYTES on the server
export const ACCEPT = 'audio/*,video/*,.mp4,.mov,.webm,.m4a,.wav,.mp3,.ogg,.mkv'

const EXTENSIONS = /\.(mp4|mov|webm|m4a|wav|mp3|ogg|mkv)$/i

export type UploadProblem = 'E_UPLOAD_TYPE' | 'E_EMPTY_AUDIO' | 'E_UPLOAD_TOO_LARGE'

export function checkUpload(file: File): UploadProblem | null {
  const known =
    file.type.startsWith('audio/') || file.type.startsWith('video/') || EXTENSIONS.test(file.name)
  if (!known) return 'E_UPLOAD_TYPE'
  if (file.size === 0) return 'E_EMPTY_AUDIO'
  if (file.size > MAX_UPLOAD_BYTES) return 'E_UPLOAD_TOO_LARGE'
  return null
}

export const UPLOAD_MESSAGES: Record<UploadProblem, string> = {
  E_UPLOAD_TYPE: 'That file is not an audio or video recording (mp4, mov, webm, m4a, wav, mp3).',
  E_EMPTY_AUDIO: 'That file is empty.',
  E_UPLOAD_TOO_LARGE: 'That file is larger than 200 MB. Trim it or export only the audio.',
}
