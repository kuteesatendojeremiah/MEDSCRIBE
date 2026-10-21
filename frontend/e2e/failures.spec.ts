// Stage I (§6.3, FR-15): microphone denial, network loss and a slow server are recoverable and keep
// the draft; clearing the session leaves nothing behind. Synthetic data only.
import { expect, test } from '@playwright/test'
import { expectNoBrowserStorage, fillNewSession, goToReview, startSession } from './helpers'

test('microphone permission denied explains what to do and offers the upload fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'))
  })
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByText(/Microphone permission was denied/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('audio-file')).toBeAttached()
  await expectNoBrowserStorage(page)
})

test('a network drop while transcribing keeps the draft and Retry recovers', async ({ page }) => {
  let blocked = true
  await page.route('**/api/transcribe', (route) =>
    blocked ? route.abort('failed') : route.continue(),
  )
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByText(/Processing failed – your draft is kept/)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('E_NETWORK')).toBeVisible()
  blocked = false
  await page.getByRole('button', { name: /retry/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
})

test('a provider timeout from the server is shown as recoverable', async ({ page }) => {
  await page.route('**/api/transcribe', (route) =>
    route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'E_PROVIDER_TIMEOUT', class: 'recoverable' }),
    }),
  )
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByText('E_PROVIDER_TIMEOUT')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/took too long to answer/)).toBeVisible()
})

test('Clear session removes the draft and leaves no browser storage', async ({ page }) => {
  await goToReview(page)
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('clear-session').click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toHaveCount(0)
  await expectNoBrowserStorage(page)
})

test('a cleared session cannot be reached with the browser back button', async ({ page }) => {
  await goToReview(page)
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('clear-session').click()
  await page.goBack().catch(() => undefined)
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toHaveCount(0)
})

test('Discard recording asks first, then ends the session and releases the microphone', async ({
  page,
}) => {
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  page.once('dialog', (d) => d.dismiss())
  await page.getByTestId('discard-recording').click()
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible() // still recording
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('discard-recording').click()
  await expect(page.getByText(/RECORDING/)).toHaveCount(0)
  await expectNoBrowserStorage(page)
})
