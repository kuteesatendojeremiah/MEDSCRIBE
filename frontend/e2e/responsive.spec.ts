// Redesigned Review (Blueprint §8): usable at desktop, tablet and phone widths, keyboard-operable,
// no page-level horizontal scroll, and nothing is persisted in the browser. Synthetic data only.
import { expect, test } from '@playwright/test'
import { expectNoBrowserStorage, goToReview } from './helpers'

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1100 },
  { name: 'phone', width: 390, height: 844 },
]

for (const size of SIZES) {
  test(`Review fits the ${size.name} width with note, transcript and review items reachable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await goToReview(page)
    await expect(page.getByRole('region', { name: 'Clinical note' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Transcript' })).toBeAttached()
    await expect(page.getByTestId('review-summary')).toBeVisible()
    await expect(page.getByTestId('draft-pill')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    if (size.name === 'desktop') {
      const note = await page.getByRole('region', { name: 'Clinical note' }).boundingBox()
      const side = await page.getByRole('region', { name: 'Transcript' }).boundingBox()
      expect(note!.width).toBeGreaterThan(side!.width) // the note is the primary column
    }
    await expectNoBrowserStorage(page)
  })
}

test('focus is visible on interactive controls', async ({ page }) => {
  await goToReview(page)
  const toggle = page.getByRole('button', { name: 'Discard draft' })
  // Reach it the way a keyboard user does, so :focus-visible applies.
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab')
    if (await toggle.evaluate((el) => el === document.activeElement)) break
  }
  expect(await toggle.evaluate((el) => el === document.activeElement)).toBe(true)
  const outline = await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).not.toBe('none')
})

test('deleting a finding needs a second confirming step and leaves the transcript alone', async ({
  page,
}) => {
  await goToReview(page)
  const before = await page.locator('[data-testid^="segment-"]').count()
  await page.getByLabel('More actions for f-001').click()
  await page.getByRole('button', { name: 'Delete f-001' }).click()
  await expect(page.getByTestId('item-f-001')).toHaveCount(1)
  await page.getByRole('button', { name: 'Confirm delete f-001' }).click()
  await expect(page.getByTestId('item-f-001')).toHaveCount(0)
  expect(await page.locator('[data-testid^="segment-"]').count()).toBe(before)
})

test('the action menu closes with Escape', async ({ page }) => {
  await goToReview(page)
  const summary = page.getByLabel('More actions for f-001')
  await summary.click()
  await expect(page.getByLabel('Move f-001 to section')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Move f-001 to section')).toBeHidden()
})
