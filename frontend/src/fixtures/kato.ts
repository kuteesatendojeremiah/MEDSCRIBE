// Kato worked example (Blueprint §18). Synthetic, fictional data only.
import expected from '@fixtures/kato_expected_note.json'
import transcriptJson from '@fixtures/kato_transcript.json'
import type { Note, Segment, Setup } from '../session/types'

export const katoTranscript = transcriptJson.segments as unknown as Segment[]
export const katoExpectedNote = expected as unknown as Note

export const katoSetup: Setup = {
  template: 'cardiology',
  languages: 'English + Luganda (mixed)',
  present: ['Doctor', 'Patient', 'Relative – wife', 'Nurse'],
  tempRef: 'Kato R. – OPD-07 (fictional)',
  patient: {
    name: 'Ronald Kato (FICTIONAL)',
    age: '58',
    sex: 'Male',
    fileNumber: 'OPD-07',
    residence: 'Kampala',
  },
  consent: true,
}

/**
 * The state of the draft when Review opens (§18.3 Step 3): the expected final note, but with the
 * bisoprolol dose still unclear and every review item still open.
 */
export function katoDraftNote(): Note {
  const note = structuredClone(katoExpectedNote)
  note.items = note.items.map((i) =>
    i.id === 'f-016'
      ? {
          ...i,
          text: 'Bisoprolol – dose and route unclear (audio inaudible), once daily',
          source: { type: 'segment', segment_id: 's-013', speaker_role: 'doctor' },
        }
      : i,
  )
  note.review_items = note.review_items.map((r) => ({ ...r, status: 'open' }))
  return note
}
