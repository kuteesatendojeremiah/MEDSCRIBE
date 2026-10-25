// ADR-0011: with OPEN_ACCESS the app starts a guest session by itself, shows no sign-in form, and asks
// the clinician for the name printed on the note. The shared e2e server runs with real accounts, so the
// two open-access endpoints are simulated here (the real ones are covered by backend/tests/test_open_access.py)
// using a genuine demo token, so every other call still goes through real token checks.
import { expect, test, type Page } from '@playwright/test'
import { expectNoBrowserStorage, fillNewSession, handleAllHigh, startMic } from './helpers'

async function openMode(page: Page) {
  await page.route('**/api/auth/status', async (route) => {
    const real = await route.fetch()
    await route.fulfill({
      response: real,
      json: { ...(await real.json()), open_access: true, setup_needed: false },
    })
  })
  await page.route('**/api/auth/open', async (route) => {
    const real = await route.fetch({
      url: '/api/auth/dev-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      postData: JSON.stringify({ name: 'Clinician' }),
    })
    await route.fulfill({ response: real })
  })
}

test('no sign-in form: the consultation form opens straight away and has no Sign out', async ({
  page,
}) => {
  await openMode(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByLabel(/password/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clear session' })).toHaveCount(0) // none until a session starts
  await expectNoBrowserStorage(page)
})

test('Start needs consent and the clinician name, and the name is printed as the approver', async ({
  page,
}) => {
  await openMode(page)
  await page.goto('/')
  await fillNewSession(page)
  await page.getByRole('checkbox').check()
  const start = page.getByRole('button', { name: /continue to recording/i })
  await expect(start).toBeDisabled() // no name yet
  await page.getByLabel(/^clinician name/i).fill('Dr. A. Nankya (FICTIONAL)')
  await expect(start).toBeEnabled()
  await start.click()
  await startMic(page)
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText('Dr. A. Nankya (FICTIONAL)')
})

test('if the server cannot be reached the page offers Try again instead of a form', async ({
  page,
}) => {
  await page.route('**/api/auth/status', async (route) => {
    const real = await route.fetch()
    await route.fulfill({ response: real, json: { ...(await real.json()), open_access: true } })
  })
  await page.route('**/api/auth/open', (route) => route.abort('failed'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Could not start a session' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
