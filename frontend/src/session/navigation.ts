// Clickable steps (Blueprint §8, Figure 1). Every step can be opened:
//  - the current step is simply shown;
//  - steps you can legally move to trigger that transition (Preview from Review; back to Review);
//  - every other step opens an information view: what it is for, whether it is done or locked, and
//    exactly what is still needed. Navigation never bypasses a safety rule (HIGH items, approval).
import type { SessionEvent } from './reducer'
import { canPreview, highItems, stepIndex } from './selectors'
import type { SessionState } from './types'

export type Step = 1 | 2 | 3 | 4 | 5

export const STEP_TITLES: Record<Step, string> = {
  1: 'New session',
  2: 'Record',
  3: 'Review',
  4: 'Preview & approve',
  5: 'Download & end',
}

export const STEP_PURPOSE: Record<Step, string> = {
  1: 'Choose the template, languages and who is present, enter a temporary reference and confirm that the patient agreed to the recording.',
  2: 'Record the consultation, or upload a synthetic audio file. The audio is transcribed and translated, speakers are labelled, and a draft note is built.',
  3: 'Check the transcript beside the draft note, correct speakers and wording, type findings that were not spoken, and open every HIGH review item.',
  4: 'Read the document exactly as it will be exported and approve that exact version. Any later edit cancels the approval.',
  5: 'Download the approved note with a neutral file name, file it in the official record, then end the session so nothing is kept.',
}

export interface Requirement {
  ok: boolean
  label: string
}

export interface StepInfoData {
  step: Step
  title: string
  purpose: string
  status: 'done' | 'current' | 'locked'
  requirements: Requirement[]
}

export type Nav =
  | { kind: 'current' }
  | { kind: 'go'; events: SessionEvent[]; confirm?: string }
  | { kind: 'info'; info: StepInfoData }

export function statusOf(state: SessionState, step: Step): StepInfoData['status'] {
  const current = stepIndex(state.phase)
  return step === current ? 'current' : step < current ? 'done' : 'locked'
}

export function requirementsFor(state: SessionState, step: Step): Requirement[] {
  const current = stepIndex(state.phase)
  const started = current >= 2
  const high = highItems(state.note)
  const opened = high.filter((r) => state.openedReviewIds.includes(r.id)).length
  switch (step) {
    case 1:
      return [{ ok: state.setup.consent, label: 'Consent to the recording confirmed' }]
    case 2:
      return [
        { ok: started, label: 'A session has been started (step 1, with consent ticked)' },
        {
          ok: current >= 3,
          label: 'Recording stopped and processed into a transcript and draft note',
        },
      ]
    case 3:
      return [
        { ok: started, label: 'A session has been started' },
        {
          ok: current >= 3,
          label: 'Recording processed (or "continue with manual entry" chosen after an error)',
        },
      ]
    case 4:
      return [
        { ok: current >= 3, label: 'Draft note ready in Review' },
        {
          ok: high.length > 0 ? opened === high.length : current >= 3,
          label: state.note
            ? `Every HIGH review item opened (${opened} of ${high.length})`
            : 'Every HIGH review item opened',
        },
        {
          ok: high.every((r) => r.status !== 'open') && current >= 3,
          label: 'Each HIGH item resolved or marked unverified (needed to approve)',
        },
      ]
    case 5:
      return [
        { ok: current >= 4, label: 'Preview reached' },
        { ok: current >= 5, label: 'This exact version approved' },
      ]
  }
}

export function navigate(state: SessionState, target: Step): Nav {
  const current = stepIndex(state.phase)
  if (target === current) return { kind: 'current' }
  if (target === 3 && state.phase === 'preview')
    return { kind: 'go', events: [{ type: 'BACK_TO_EDIT' }] }
  if (target === 3 && state.phase === 'approved') {
    return {
      kind: 'go',
      events: [{ type: 'REOPEN_FOR_EDIT' }],
      confirm:
        'Going back to Review cancels the approval. You will need to preview and approve again. Continue?',
    }
  }
  if (target === 4 && state.phase === 'review' && canPreview(state)) {
    return { kind: 'go', events: [{ type: 'PREVIEW' }] }
  }
  return {
    kind: 'info',
    info: {
      step: target,
      title: STEP_TITLES[target],
      purpose: STEP_PURPOSE[target],
      status: statusOf(state, target),
      requirements: requirementsFor(state, target),
    },
  }
}
