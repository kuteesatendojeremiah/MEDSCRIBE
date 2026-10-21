// Redesigned screens 1, 3 and 5 (Blueprint §8; Figma frames 01 and 03): form layout, approval
// checklist and attention list, and the export screen.
import { expect, test } from '@playwright/test'
import {
  approveAndDownload,
  expectNoBrowserStorage,
  goToReview,
  handleAllHigh,
  signIn,
  tickFinalReview,
} from './helpers'

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 820, 1100],
  ['phone', 390, 844],
] as const) {
  test(`New consultation fits the ${name} width and keeps its sections`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await signIn(page)
    await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Consultation details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Patient details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your session is temporary' })).toBeVisible()
    await expect(page.getByTestId('ns-next')).toBeVisible()
    await expect(page.getByLabel('Temporary reference (optional)')).toBeVisible()
    await expect(page.getByLabel('Consultation date')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expectNoBrowserStorage(page)
  })
}

test('Preview says DRAFT and lists what needs attention when required items are open', async ({
  page,
}) => {
  await goToReview(page)
  await page.getByRole('button', { name: /HIGH review item: Bisoprolol/i }).click()
  await page.getByRole('button', { name: /HIGH review item: Amlodipine/i }).click()
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByTestId('preview-status')).toContainText('DRAFT · not approved')
  const attention = page.getByTestId('needs-attention')
  await expect(attention).toContainText('Bisoprolol')
  await expect(attention).toContainText('Amlodipine')
  await tickFinalReview(page)
  await expect(page.getByRole('button', { name: 'Approve note' })).toBeDisabled()
  await page.getByRole('button', { name: /return to edit/i }).click()
  await expect(page.getByTestId('draft-pill')).toBeVisible()
})

test('approval needs all five confirmations ticked by the clinician, none pre-ticked', async ({
  page,
}) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  const boxes = page.getByRole('group', { name: 'Final review checklist' }).getByRole('checkbox')
  await expect(boxes).toHaveCount(5)
  for (let i = 0; i < 5; i++) await expect(boxes.nth(i)).not.toBeChecked()
  const approve = page.getByRole('button', { name: 'Approve note' })
  await expect(approve).toBeDisabled()
  for (let i = 0; i < 4; i++) await boxes.nth(i).check()
  await expect(approve).toBeDisabled() // one confirmation still missing
  await boxes.nth(4).check()
  await expect(approve).toBeEnabled()
})

test('after approval the export screen shows the approved version, format choice and cleanup', async ({
  page,
}) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await approveAndDownload(page)
  await expect(page.getByTestId('approved-pill')).toContainText('APPROVED')
  await expect(page.getByText('Only this approved version can be exported.')).toBeVisible()
  // switching format renders a fresh file in that format
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  await expect(page.getByTestId('filename')).toContainText('.pdf')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-file').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^consultation_note_.*\.pdf$/)
  await page.getByText('View the approved document').click()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  await expect(page.getByText(/clears audio, transcript, draft and the file/)).toBeVisible()
  await expectNoBrowserStorage(page)
  // editing after approval returns to draft; the export screen is gone
  await page.getByRole('button', { name: /edit note/i }).click()
  await expect(page.getByTestId('draft-pill')).toBeVisible()
  await expect(page.getByTestId('approved-pill')).toHaveCount(0)
})
