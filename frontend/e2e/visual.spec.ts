// Visual verification against the Figma frames in docs/design/ (1440 x 1000). Saves screenshots to
// docs/design/actual/ for side-by-side comparison and asserts the measured geometry and colours.
import { expect, test, type Locator } from '@playwright/test'
import { approveAndDownload, fillNewSession, goToReview, handleAllHigh, signIn } from './helpers'

const OUT = '../docs/design/actual'
test.use({ viewport: { width: 1440, height: 1000 } })

async function box(l: Locator) {
  const b = await l.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

test('01 New consultation matches the frame geometry and tokens', async ({ page }) => {
  await page.goto('/')
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/01-new-consultation.png` })
  const header = await box(page.locator('header.topbar'))
  expect(header.height).toBe(64)
  const stepper = await box(page.locator('nav.stepper'))
  expect(near(stepper.height, 75, 2)).toBe(true)
  const card = await box(page.locator('.form-card'))
  expect(near(card.x, 44, 1)).toBe(true)
  expect(near(card.width, 849, 4)).toBe(true)
  const side = await box(page.locator('.side-card.accent'))
  expect(near(side.x, 921, 4)).toBe(true)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(245, 247, 250)')
  const head = await page.evaluate(
    () => getComputedStyle(document.querySelector('header')!).backgroundColor,
  )
  expect(head).toBe('rgb(23, 61, 97)')
})

test('02 Review workspace matches the frame geometry and tokens', async ({ page }) => {
  await goToReview(page)
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/02-review-workspace.png` })
  const t = await box(page.getByRole('region', { name: 'Transcript' }))
  const n = await box(page.getByRole('region', { name: 'Clinical note' }))
  const a = await box(page.getByRole('region', { name: 'Review items' }))
  expect(near(t.x, 24, 1) && near(t.width, 349, 4)).toBe(true)
  expect(near(n.x, 394, 3) && near(n.width, 649, 4)).toBe(true)
  expect(near(a.x, 1064, 3) && near(a.width, 351, 4)).toBe(true)
  const strip = await box(page.getByTestId('patient-banner'))
  expect(near(strip.height, 46, 3)).toBe(true)
  const high = await page
    .locator('.attention-card.ri-HIGH')
    .first()
    .evaluate((el) => {
      const c = getComputedStyle(el)
      return [c.backgroundColor, c.borderTopColor]
    })
  expect(high).toEqual(['rgb(252, 235, 235)', 'rgb(184, 41, 38)'])
  const primary = await page
    .getByRole('button', { name: /continue to preview/i })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(primary).toBe('rgb(41, 99, 156)')
})

test('03 Preview and approve matches the frame geometry and tokens', async ({ page }) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  await page.screenshot({ path: `${OUT}/03-preview-approve.png` })
  const doc = await box(page.getByRole('region', { name: 'Document preview' }))
  const fin = await box(page.getByRole('region', { name: 'Final review' }))
  expect(near(doc.x, 32, 1) && near(doc.width, 859, 4)).toBe(true)
  expect(near(fin.x, 916, 3) && near(fin.width, 491, 4)).toBe(true)
  await expect(page.getByRole('checkbox')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Approve note' })).toBeDisabled()
})

test('New consultation form fields keep their names', async ({ page }) => {
  await page.goto('/')
  await fillNewSession(page)
})

test('04 Record and 05 Download use the same design system (no Figma frame: screenshots only)', async ({
  page,
}) => {
  await page.goto('/')
  await fillNewSession(page)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /continue to recording/i }).click()
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/04-record.png` })
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await approveAndDownload(page)
  await page.screenshot({ path: `${OUT}/05-download.png` })
})
