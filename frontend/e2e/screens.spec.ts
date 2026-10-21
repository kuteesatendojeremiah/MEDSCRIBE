// Redesigned screens 1, 4 and 5 (Blueprint §8): form layout, approval attention list, export state.
import { expect, test } from '@playwright/test'
import { expectNoBrowserStorage, goToReview, handleAllHigh, signIn } from './helpers'

for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 820, 1100],
  ['phone', 390, 844],
] as const) {
  test(`New consultation fits the ${name} width and shows required and optional fields`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await signIn(page)
    await expect(page.getByTestId('ns-selected')).toContainText('Cardiology')
    await expect(page.getByTestId('ns-next')).toBeVisible()
    await expect(page.getByTestId('patient-details')).toContainText('optional')
    await expect(page.getByText('required', { exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: /^Preview/ }).click()
  await expect(page.getByTestId('preview-status')).toContainText('DRAFT · not approved')
  const attention = page.getByTestId('needs-attention')
  await expect(attention).toContainText('Bisoprolol')
  await expect(attention).toContainText('Amlodipine')
  await expect(page.getByRole('button', { name: /approve this version/i })).toBeDisabled()
  await page.getByRole('button', { name: /back to edit/i }).click()
  await expect(page.getByTestId('draft-pill')).toBeVisible()
})

test('after approval the export screen shows the approved version, format choice and cleanup', async ({
  page,
}) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /^Preview/ }).click()
  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /approve this version/i }).click(),
  ])
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
