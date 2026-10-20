// Neutral download file name (Blueprint §10.2): no patient detail ever appears in it.
export function neutralFileName(date: Date, format: 'docx' | 'pdf'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const d = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  return `consultation_note_${d}_${p(date.getHours())}${p(date.getMinutes())}.${format}`
}
