// Real doctor accounts and clickable steps (FR-01). Runs first (alphabetical order) against a
// backend started with a fresh, empty accounts file, so the first-run setup form is shown.
import { expect, test } from '@playwright/test'
import { expectNoBrowserStorage } from './helpers'

const ADMIN_PW = 'admin password 123'
const DOC_PW = 'doctor password 456'

const SHOTS = '../docs/phase1/screenshots'

test('first-run setup, admin adds a doctor, doctor signs in, wrong password is refused', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up Mediscribe' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/7-first-run-setup.png` })

  // First administrator
  await page.getByLabel(/your name as printed/i).fill('Dr. Admin Test')
  await page.getByLabel('Username').fill('admin.test')
  await page.getByLabel(/^Password/).fill(ADMIN_PW)
  await page.getByLabel(/repeat password/i).fill('does not match')
  await page.getByRole('button', { name: /create administrator/i }).click()
  await expect(page.getByText('The two passwords do not match.')).toBeVisible()
  await page.getByLabel(/repeat password/i).fill(ADMIN_PW)
  await page.getByRole('button', { name: /create administrator/i }).click()
  await expect(page.getByTestId('user-menu')).toContainText('Dr. Admin Test · Admin')

  // Admin adds a doctor
  await page.getByRole('button', { name: 'Doctors' }).click()
  await page.getByLabel(/name as printed/i).fill('Dr. B. Okello')
  await page.getByLabel(/^Username/).fill('Dr Okello')
  await expect(page.getByLabel(/^Username/)).toHaveValue('dr.okello') // typed naturally, stored cleanly
  await page.getByLabel(/temporary password/i).fill(DOC_PW)
  await page.getByRole('button', { name: 'Add doctor' }).click()
  await expect(page.getByText(/Doctor added/)).toBeVisible()
  await expect(page.getByTestId('admin-users')).toContainText('dr.okello')
  await expect(page.getByTestId('admin-users')).toContainText('Dr. B. Okello')
  await page.screenshot({ path: `${SHOTS}/8-admin-doctors.png` })
  await expectNoBrowserStorage(page) // passwords and accounts are never kept in the browser

  // Sign out, then sign in as the doctor
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/9-sign-in.png` })
  await page.getByLabel('Username').fill('dr.okello')
  await page.getByLabel('Password').fill('the wrong password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Wrong username or password.')).toBeVisible()
  await page.getByLabel('Password').fill(DOC_PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('user-menu')).toContainText('Dr. B. Okello · Doctor')
  await expect(page.getByRole('button', { name: 'Doctors' })).toHaveCount(0) // admins only
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
  await expectNoBrowserStorage(page)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('every step can be opened before a session starts and explains what is needed', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('dr.okello')
  await page.getByLabel('Password').fill(DOC_PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('user-menu')).toBeVisible()

  for (const n of [2, 3, 4, 5]) {
    await page.getByTestId(`step-${n}`).click()
    const info = page.getByTestId(`step-info-${n}`)
    await expect(info).toBeVisible()
    await expect(info).toContainText('Not available yet')
    await expect(info).toContainText('What is needed first')
    if (n === 4) await page.screenshot({ path: `${SHOTS}/10-step-locked.png` })
  }
  await page.getByRole('button', { name: /back to your current step/i }).click()
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
  await page.getByTestId('step-1').click() // the current step: just stays
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
})
