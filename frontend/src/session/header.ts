// Note header built from what the clinician entered at session start (Blueprint §4.1, §4.3).
// Only entered or captured values; identifiers are never invented.
import type { HeaderPatient, NoteHeader, Setup } from './types'

export const CONSENT_STATEMENT =
  'Patient informed that the consultation would be recorded to draft this note and agreed verbally (confirmed by clinician).'

/** Only the details that were typed; nothing is invented (Blueprint §4.1). */
export function patientForHeader(p: Setup['patient']): HeaderPatient | undefined {
  const out: HeaderPatient = {}
  if (p.name.trim()) out.name = p.name.trim()
  if (p.age.trim()) out.age = p.age.trim()
  if (p.sex.trim()) out.sex = p.sex.trim()
  if (p.fileNumber.trim()) out.file_number = p.fileNumber.trim()
  if (p.residence.trim()) out.residence = p.residence.trim()
  return Object.keys(out).length ? out : undefined
}

export function buildHeader(setup: Setup, clinician: string, startedAt: number): NoteHeader {
  return {
    ...(patientForHeader(setup.patient) ? { patient: patientForHeader(setup.patient) } : {}),
    clinic: 'Cardiology clinic',
    datetime: new Date(startedAt).toISOString(),
    clinician,
    temp_ref: setup.tempRef,
    languages: setup.languages
      .split('+')
      .map((l) => l.replace(/\(.*\)/, '').trim())
      .filter(Boolean),
    present: setup.present,
    consent_statement: CONSENT_STATEMENT,
  }
}
