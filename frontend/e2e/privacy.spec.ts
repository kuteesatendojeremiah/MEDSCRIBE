// Blueprint §15.2 (browser side): seed a synthetic marker, run a whole session, then look for it
// in storage, caches, service workers, URLs, console output, download names and the back-forward cache.
import { expect, test } from '@playwright/test'
import { expectNoBrowserStorage, handleAllHigh, signIn, startSession } from './helpers'

const MARKER = 'SYNTHETIC-MARKER-7Q4Z'

test('the marker never reaches storage, URLs, console, file names or the back-forward cache', async ({
  page,
}) => {
  const urls: string[] = []
  const consoleText: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  page.on('console', (m) => consoleText.push(m.text()))
  await page.addInitScript(() => {
    ;(window as unknown as { __persisted: boolean }).__persisted = false
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) (window as unknown as { __persisted: boolean }).__persisted = true
    })
  })

  await page.goto('/')
  await signIn(page)
  await page.getByLabel(/temporary reference/i).fill(`OPD-07 ${MARKER}`)
  await page.getByLabel(/full name/i).fill(`Fictional ${MARKER}`)
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Draft note' })).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('add-exam').click()
  await page.getByLabel('New exam finding').fill(`typed ${MARKER}`)
  await page.getByLabel('New exam finding').press('Enter')
  await handleAllHigh(page)
  await expectNoBrowserStorage(page)
  await page.getByRole('button', { name: /^Preview/ }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText(MARKER)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /approve this version/i }).click(),
  ])
  expect(download.suggestedFilename()).not.toContain(MARKER)
  await expectNoBrowserStorage(page)
  await page.getByRole('button', { name: /end session/i }).click()
  await expect(page.getByRole('heading', { name: 'New temporary consultation' })).toBeVisible()

  // Nothing left on the page, in storage, in URLs or in console output
  await expect(page.locator('body')).not.toContainText(MARKER)
  await expectNoBrowserStorage(page)
  expect(urls.filter((u) => u.includes(MARKER))).toEqual([])
  expect(consoleText.filter((t) => t.includes(MARKER))).toEqual([])

  // Back-forward cache: after leaving and coming back, the page is reloaded fresh and empty
  await page.goto('about:blank')
  await page.goBack()
  // The page reloads fresh: the in-memory sign-in is gone too, so the sign-in screen appears
  await expect(page.getByRole('heading', { name: /^(Sign in|Set up Mediscribe)$/ })).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __persisted: boolean }).__persisted),
  ).toBe(false)
  await expect(page.locator('body')).not.toContainText(MARKER)
})
