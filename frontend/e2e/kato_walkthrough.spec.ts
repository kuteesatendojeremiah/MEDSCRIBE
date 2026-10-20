// Gate walk-through: the Kato case (Blueprint §18.3) from sign-in to End against the live backend
// (mock providers), asserting no browser storage at every step and an empty state after End.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  expectNoBrowserStorage,
  fillNewSession,
  handleAllHigh,
  signIn,
  startSession,
} from './helpers'

const SHOTS = '../docs/phase1/screenshots'

test('Kato walk-through: New session → Record → Review → Preview → Download → End', async ({
  page,
}) => {
  // Step 1 – New session
  await page.goto('/')
  await expectNoBrowserStorage(page)
  await signIn(page)
  const start = page.getByRole('button', { name: /start session/i })
  await expect(start).toBeDisabled()
  await fillNewSession(page)
  await expect(start).toBeDisabled() // consent still missing
  await page.getByRole('checkbox').check()
  await expect(start).toBeEnabled({ timeout: 10_000 })
  await expect(page.getByTestId('user-menu')).toContainText('Dr. A. Nankya')
  await page.screenshot({ path: `${SHOTS}/1-new-session.png` })
  await expectNoBrowserStorage(page)

  // Step 2 – Record (fake microphone)
  await start.click()
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/2-record.png` })
  await expectNoBrowserStorage(page)

  // Step 3 – Review: transcript + draft come from /transcribe and /extract
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Draft note' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('AI DRAFT – not yet approved')).toBeVisible()
  await expect(page.getByText('“Musawo, nfuna obulumi mu kifuba for three days.”')).toBeVisible()
  await expect(page.getByText('→ Doctor, I have chest pain for three days.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review items (5)' })).toBeVisible()
  // The patient introduction is shown at the top of Review
  await expect(page.getByTestId('patient-summary')).toHaveText(
    'Ronald Kato (FICTIONAL) · 58 · Male · File OPD-07 · Kampala',
  )
  await expect(page.getByRole('button', { name: /^Preview/ })).toBeDisabled()
  await expect(page.getByText(/reported by wife, not by patient/)).toBeVisible()
  await expect(page.getByTestId('item-f-004')).toContainText('[00:31 reported by relative]')
  await page.screenshot({ path: `${SHOTS}/3-review.png` })
  await expectNoBrowserStorage(page)

  // FR-07: type the finding that was never spoken
  await page.getByTestId('add-exam').click()
  await page.getByLabel('New exam finding').fill('Mild bilateral pitting ankle oedema')
  await page.getByLabel('New exam finding').press('Enter')
  await expect(page.getByText('typed by clinician').first()).toBeVisible()

  await handleAllHigh(page)
  await expect(page.getByRole('button', { name: /^Preview/ })).toBeEnabled()
  await page.screenshot({ path: `${SHOTS}/3b-review-high-handled.png` })
  await expectNoBrowserStorage(page)

  // Step 4 – Preview & approve (server-rendered preview)
  await page.getByRole('button', { name: /^Preview/ }).click()
  await expect(page.getByRole('heading', { name: 'Approval checklist' })).toBeVisible()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  const header = page.getByLabel('Rendered note preview')
  for (const text of ['Ronald Kato (FICTIONAL)', '58 · Male', 'OPD-07', 'Kampala']) {
    await expect(header).toContainText(text)
  }
  await expect(page.getByText('UNVERIFIED: Amlodipine')).toBeVisible()
  await expect(
    page.getByText('Bisoprolol 2.5 mg orally once daily (entered by clinician)'),
  ).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/4-preview-approve.png` })
  await expectNoBrowserStorage(page)

  // Step 5 – Approve & download: a real DOCX arrives with a neutral file name
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /approve this version/i }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^consultation_note_\d{4}-\d{2}-\d{2}_\d{4}\.docx$/)
  expect(download.suggestedFilename()).not.toMatch(/kato|ronald/i)
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  expect(bytes.length).toBeGreaterThan(5000)
  await expect(page.getByRole('heading', { name: /your note is ready/i })).toBeVisible()
  // The visible Download button works on its own and says where to look
  const [again] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-file').click(),
  ])
  expect(again.suggestedFilename()).toBe(download.suggestedFilename())
  await expect(page.getByTestId('download-status')).toContainText('Downloads folder')
  await page.screenshot({ path: `${SHOTS}/5-download-end.png` })
  await expectNoBrowserStorage(page)

  // End: everything cleared
  await page.getByRole('button', { name: /end session/i }).click()
  await expect(page.getByRole('heading', { name: 'New temporary consultation' })).toBeVisible()
  await expect(page.getByLabel(/temporary reference/i)).toHaveValue('')
  await expect(page.getByLabel(/full name/i)).toHaveValue('')
  await expect(page.getByLabel(/file \/ opd number/i)).toHaveValue('')
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await expect(page.locator('body')).not.toContainText(/kato|ronald|bisoprolol/i)
  await page.screenshot({ path: `${SHOTS}/6-after-end.png` })
  await expectNoBrowserStorage(page)

  // A fresh session after End starts with no carried-over content and a working sign-in
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
})
