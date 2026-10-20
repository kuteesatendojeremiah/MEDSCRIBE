import type { Note, Phase, ReviewItem, SessionState } from './types'

const ACTIVE: ReadonlySet<Phase> = new Set([
  'capture',
  'processing',
  'review',
  'preview',
  'approved',
  'recoverable_error',
])

export const isActive = (phase: Phase) => ACTIVE.has(phase)

export const highItems = (note: Note | null): ReviewItem[] =>
  note ? note.review_items.filter((r) => r.level === 'HIGH') : []

/** FR-09, §8: Preview unlocks once every HIGH item has been opened. */
export function canPreview(s: SessionState): boolean {
  if (!s.note) return false
  return highItems(s.note).every((r) => s.openedReviewIds.includes(r.id))
}

/** §12.1 step 1: each HIGH item opened AND resolved or marked unverified before approval. */
export function canApprove(s: SessionState): boolean {
  return canPreview(s) && highItems(s.note).every((r) => r.status !== 'open')
}

/** FR-14: an active session that has not been exported would lose work on unload. */
export const hasUnexportedDraft = (s: SessionState): boolean => isActive(s.phase) && !s.exported

export function stepIndex(phase: Phase): 1 | 2 | 3 | 4 | 5 {
  switch (phase) {
    case 'capture':
    case 'processing':
    case 'recoverable_error':
      return 2
    case 'review':
      return 3
    case 'preview':
      return 4
    case 'approved':
      return 5
    default:
      return 1
  }
}

const VITAL_PATTERNS: Array<[string, RegExp]> = [
  ['BP', /\bBP\b|blood pressure/i],
  ['Pulse', /pulse|heart rate/i],
  ['RR', /respiratory rate|\bRR\b/i],
  ['SpO₂', /spo|saturation/i],
  ['Temperature', /temp/i],
  ['Weight', /weight|\bkg\b/i],
]

/** §4.1: missing vitals are shown as 'not recorded', never invented. */
export function missingVitals(note: Note): string[] {
  const texts = note.items.filter((i) => i.section === 'vitals').map((i) => i.text)
  return VITAL_PATTERNS.filter(([, re]) => !texts.some((t) => re.test(t))).map(([n]) => n)
}

export interface ChecklistLine {
  ok: boolean
  label: string
}

/** Approval checklist (§18.3 Step 4), computed from the current note only. */
export function approvalChecklist(s: SessionState): ChecklistLine[] {
  const note = s.note
  if (!note) return []
  const high = highItems(note)
  const lines: ChecklistLine[] = [
    {
      ok: canPreview(s),
      label: `All ${high.length} HIGH review items opened`,
    },
  ]
  for (const r of high) {
    if (r.status === 'unverified') {
      lines.push({ ok: true, label: `${r.reason} – marked UNVERIFIED (prints on note)` })
    } else if (r.status === 'resolved') {
      lines.push({ ok: true, label: `${r.reason} – resolved by you` })
    } else {
      lines.push({ ok: false, label: `${r.reason} – still open` })
    }
  }
  lines.push({
    ok: note.items.some((i) => i.section === 'meds_allergies' && /allerg/i.test(i.text)),
    label: 'Allergy status recorded',
  })
  const missing = missingVitals(note)
  lines.push({
    ok: note.items.some((i) => i.section === 'vitals'),
    label: `Vital signs present (${missing.length} marked “not recorded”)`,
  })
  lines.push({ ok: s.setup.consent, label: 'Consent statement included' })
  const unknown = (s.transcript ?? []).filter((t) => t.speaker_role === 'unknown').length
  lines.push({
    ok: s.transcript !== null,
    label: `Speaker roles checked (${unknown} Unknown listed under Review items)`,
  })
  return lines
}
