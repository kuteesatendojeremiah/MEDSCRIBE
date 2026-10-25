// Blueprint §15.2 (browser side): seed a synthetic marker, run a whole session, then look for it
// in storage, caches, service workers, URLs, console output, download names and the back-forward cache.
import { expect, test } from '@playwright/test'
import {
  expectNoBrowserStorage,
  handleAllHigh,
  signIn,
  startSession,
  approveAndDownload,
  startMic,
} from './helpers'

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
  await startMic(page)
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByTestId('add-exam').click()
  await page.getByLabel('New exam finding').fill(`typed ${MARKER}`)
  await page.getByLabel('New exam finding').press('Enter')
  await handleAllHigh(page)
  await expectNoBrowserStorage(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText(MARKER)
  const download = await approveAndDownload(page)
  expect(download.suggestedFilename()).not.toContain(MARKER)
  await expectNoBrowserStorage(page)
  await page.getByRole('button', { name: /end session/i }).click()
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()

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
