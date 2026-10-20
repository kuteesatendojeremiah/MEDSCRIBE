import { expect, type Page } from '@playwright/test'

/** Blueprint §15.2 / FR-17: the browser must hold no stored data at any step. */
export async function expectNoBrowserStorage(page: Page) {
  const found = await page.evaluate(async () => {
    const out: string[] = []
    if (window.localStorage.length) out.push('localStorage')
    if (window.sessionStorage.length) out.push('sessionStorage')
    if (document.cookie) out.push('cookie')
    const dbs = await window.indexedDB.databases()
    if (dbs.length) out.push('indexedDB')
    if ((await window.caches.keys()).length) out.push('cache')
    if ((await navigator.serviceWorker.getRegistrations()).length) out.push('serviceWorker')
    return out
  })
  expect(found).toEqual([])
}

/** Signs in with the demo account if the sign-in screen is showing (testing-only server option). */
export async function signIn(page: Page) {
  const demo = page.getByRole('button', { name: /continue with demo account/i })
  // Wait for either the demo button (signed out) or the user menu (already signed in).
  await page
    .locator('[data-testid="user-menu"], button:has-text("Continue with demo account")')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
  if (await demo.isVisible()) {
    await demo.click()
    await expect(page.getByTestId('user-menu')).toBeVisible()
  }
}

export async function fillNewSession(page: Page) {
  await signIn(page)
  await page.getByLabel(/temporary reference/i).fill('Kato R. – OPD-07 (fictional)')
  await page.getByLabel(/full name/i).fill('Ronald Kato (FICTIONAL)')
  await page.getByLabel(/^Age/).fill('58')
  await page.getByLabel(/^Sex/).selectOption('Male')
  await page.getByLabel(/file \/ opd number/i).fill('OPD-07')
  await page.getByLabel(/residence/i).fill('Kampala')
  for (const p of ['Relative – wife', 'Nurse']) {
    await page.getByLabel('Add person present').fill(p)
    await page.getByLabel('Add person present').press('Enter')
  }
}

/** Sign-in finishes in the background; Start is enabled once consent is ticked and sign-in done. */
export async function startSession(page: Page) {
  await page.getByRole('checkbox').check()
  await expect(page.getByRole('button', { name: /start session/i })).toBeEnabled({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: /start session/i }).click()
}

export async function goToReview(page: Page) {
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByText(/RECORDING · microphone on/)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Draft note' })).toBeVisible({ timeout: 15_000 })
}

export const highCard = (page: Page, drug: string) =>
  page.locator('.ri', { hasText: drug }).filter({ hasText: 'HIGH' })

export async function handleAllHigh(page: Page) {
  await page.getByRole('button', { name: new RegExp(`HIGH review item: Bisoprolol`, 'i') }).click()
  await page.getByLabel(/enter value/i).fill('Bisoprolol 2.5 mg orally once daily')
  await page.getByRole('button', { name: /resolve with this value/i }).click()
  await page.getByRole('button', { name: /HIGH review item: Amlodipine/i }).click()
  await highCard(page, 'Amlodipine')
    .getByRole('button', { name: /mark unverified/i })
    .click()
}
