// FR-09 lock, FR-10 approval reset, FR-14 unload warning, FR-15 error classes, audio upload (FR-03),
// source highlighting and editing (Phase 4).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  expectNoBrowserStorage,
  fillNewSession,
  goToReview,
  handleAllHigh,
  startSession,
  approveAndDownload,
  tickFinalReview,
} from './helpers'

test('Preview is locked until every HIGH item is opened (FR-09)', async ({ page }) => {
  await goToReview(page)
  const preview = page.getByRole('button', { name: /continue to preview/i })
  await expect(preview).toBeDisabled()
  await page.getByRole('button', { name: /HIGH review item: Bisoprolol/i }).click()
  await expect(preview).toBeDisabled()
  await page.getByRole('button', { name: /HIGH review item: Amlodipine/i }).click()
  await expect(preview).toBeEnabled()
})

test('approval needs HIGH items resolved or unverified (§12.1)', async ({ page }) => {
  await goToReview(page)
  await page.getByRole('button', { name: /HIGH review item: Bisoprolol/i }).click()
  await page.getByRole('button', { name: /HIGH review item: Amlodipine/i }).click()
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await tickFinalReview(page) // even with every confirmation ticked, open HIGH items block approval
  await expect(page.getByRole('button', { name: 'Approve note' })).toBeDisabled()
})

test('approve → edit → approval cleared → re-approve with a new version (FR-10)', async ({
  page,
}) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  const v1 = await page.getByTestId('version-hash').textContent()
  await approveAndDownload(page)
  await expect(page.getByRole('heading', { name: /your note is ready/i })).toBeVisible()

  await page.getByRole('button', { name: /edit note/i }).click()
  await expect(page.getByText(/AI draft · not approved/i)).toBeVisible()

  await page.getByTestId('item-f-001').getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Edit f-001').fill('Chest pain for 4 days')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('item-f-001')).toContainText('edited by clinician')

  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText('Chest pain for 4 days')
  const v2 = await page.getByTestId('version-hash').textContent()
  expect(v2).not.toBe(v1)
  await approveAndDownload(page)
  await expect(page.getByRole('heading', { name: /your note is ready/i })).toBeVisible()
  await expectNoBrowserStorage(page)
})

test('clicking a note item highlights its source segment (§4.2)', async ({ page }) => {
  await goToReview(page)
  await page
    .getByTestId('item-f-004')
    .getByRole('button', { name: /reported by relative/ })
    .click()
  await expect(page.getByTestId('segment-s-005')).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId('segment-s-001')).not.toHaveAttribute('aria-current', 'true')
})

test('items can be moved and deleted; deleting never removes a HIGH flag (§4.4)', async ({
  page,
}) => {
  await goToReview(page)
  await page.getByLabel('More actions for f-001').click()
  await page.getByLabel('Move f-001 to section').selectOption('exam')
  await expect(page.getByTestId('item-f-001')).toContainText('edited by clinician')
  const bisoprolol = page.getByTestId('item-f-015')
  await bisoprolol.getByLabel('More actions for f-015').click()
  await bisoprolol.getByRole('button', { name: 'Delete f-015' }).click()
  await expect(page.getByTestId('item-f-015')).toHaveCount(1) // nothing is removed until confirmed
  await bisoprolol.getByRole('button', { name: 'Confirm delete f-015' }).click()
  await expect(page.getByTestId('item-f-015')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /HIGH review item: Bisoprolol/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /continue to preview/i })).toBeDisabled()
})

test('a speaker role can be set from a dropdown and the transcript text can be edited (FR-05)', async ({
  page,
}) => {
  await goToReview(page)
  const role = page.getByLabel('Speaker of segment s-014')
  await expect(role).toHaveValue('unknown')
  await role.selectOption('doctor')
  await expect(page.getByLabel('Speaker of segment s-014')).toHaveValue('doctor')
  await page.getByLabel('Edit text of segment s-009').click()
  await page.getByLabel('Edit segment s-009').fill('Pulse is irregular, about 112.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('segment-s-009')).toContainText('about 112')
})

test('uploading a synthetic audio file works and a provider timeout is recoverable (FR-03, FR-15)', async ({
  page,
}) => {
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await expect(page.getByRole('button', { name: /stop & process/i })).toBeVisible()
  await page.getByTestId('audio-file').setInputFiles({
    name: 'synthetic.webm',
    mimeType: 'audio/webm',
    buffer: Buffer.from('MOCKCASE:fail\nsynthetic'),
  })
  await expect(page.getByText(/Processing failed – your draft is kept/)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('E_PROVIDER_TIMEOUT')).toBeVisible()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText(/Processing failed/)).toBeVisible({ timeout: 15_000 }) // same audio, same failure
  await page.getByRole('button', { name: /continue with manual entry/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible()
  await expect(page.getByText('No transcript. Type findings directly into the note.')).toBeVisible()
  await page.getByTestId('add-history').click()
  await page.getByLabel('New history finding').fill('Typed by the clinician')
  await page.getByLabel('New history finding').press('Enter')
  await expect(page.getByTestId('item-m-001')).toContainText('typed by clinician')
  await expectNoBrowserStorage(page)
})

test('a good uploaded file produces the Kato transcript', async ({ page }) => {
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await page.getByTestId('audio-file').setInputFiles({
    name: 'synthetic.webm',
    mimeType: 'audio/webm',
    buffer: Buffer.from('synthetic audio bytes'),
  })
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
})

test('closing a tab with an unexported draft prompts (FR-14)', async ({ page }) => {
  await goToReview(page)
  const dialogPromise = page.waitForEvent('dialog')
  const closing = page.close({ runBeforeUnload: true })
  const dialog = await dialogPromise
  expect(dialog.type()).toBe('beforeunload')
  await dialog.accept()
  await closing
})

test('no unload prompt on a fresh page', async ({ page }) => {
  await page.goto('/')
  let prompted = false
  page.on('dialog', async (d) => {
    prompted = true
    await d.dismiss()
  })
  await page.close({ runBeforeUnload: true })
  expect(prompted).toBe(false)
})

test('discarding the draft clears the screen', async ({ page }) => {
  await goToReview(page)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /discard draft/i }).click()
  await expect(page.getByRole('heading', { name: 'Start a new consultation' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/bisoprolol/i)
})

test('the page never stores or caches content and sends no-store from the API (§10.2)', async ({
  page,
}) => {
  const responses: Array<{ url: string; cc: string | undefined }> = []
  page.on('response', (r) => {
    if (r.url().includes('/api/'))
      void r.allHeaders().then((h) => responses.push({ url: r.url(), cc: h['cache-control'] }))
  })
  await goToReview(page)
  await expect.poll(() => responses.length).toBeGreaterThan(2)
  for (const r of responses) expect(r.cc, r.url).toBe('no-store')
  await expectNoBrowserStorage(page)
})

test('the transcript can be searched within the session (FR-18)', async ({ page }) => {
  await goToReview(page)
  await page.getByLabel('Search transcript').fill('bisoprolol')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 15')
  await expect(page.getByTestId('segment-s-013')).toBeVisible()
  await expect(page.getByTestId('segment-s-001')).toHaveCount(0)
  await page.getByLabel('Search transcript').fill('kifuba')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 15')
  await expect(page.getByTestId('segment-s-001')).toBeVisible()
  await page.getByLabel('Search transcript').fill('')
  await expect(page.getByTestId('segment-s-013')).toBeVisible()
})

test('steps are clickable during a session: summaries, locked reasons, and safe navigation', async ({
  page,
}) => {
  await goToReview(page)
  // Earlier steps open read-only summaries
  await page.getByTestId('step-1').click()
  await expect(page.getByTestId('step-info-1')).toContainText('Kato R. – OPD-07 (fictional)')
  await expect(page.getByTestId('step-info-1')).toContainText('Confirmed at session start')
  await page.getByTestId('step-2').click()
  await expect(page.getByTestId('step-info-2')).toContainText('Transcript segments')
  await expect(page.getByTestId('step-info-2')).toContainText('never stored')
  // Preview is locked and says exactly why
  await page.getByTestId('step-4').click()
  await expect(page.getByTestId('step-info-4')).toContainText('(0 of 2)')
  await page.getByTestId('step-5').click()
  await expect(page.getByTestId('step-info-5')).toContainText('Not available yet')
  await page.getByRole('button', { name: /back to your current step/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible()

  // Once HIGH items are handled, clicking Preview goes there; clicking Review comes back
  await handleAllHigh(page)
  await page.getByTestId('step-4').click()
  await expect(page.getByRole('heading', { name: 'Final review' })).toBeVisible()
  await page.getByTestId('step-3').click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible()

  // After approval, going back to Review asks first and cancels the approval
  await page.getByTestId('step-4').click()
  await approveAndDownload(page)
  await expect(page.getByRole('heading', { name: /your note is ready/i })).toBeVisible()
  page.once('dialog', async (d) => {
    expect(d.message()).toMatch(/cancels the approval/i)
    await d.dismiss()
  })
  await page.getByTestId('step-3').click()
  await expect(page.getByRole('heading', { name: /your note is ready/i })).toBeVisible() // stayed
  page.once('dialog', (d) => d.accept())
  await page.getByTestId('step-3').click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible()
  await expect(page.getByText(/AI draft · not approved/i)).toBeVisible()
})

test('signing out during a consultation clears it and asks for sign-in again', async ({ page }) => {
  await goToReview(page)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: /^(Sign in|Set up Mediscribe)$/ })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/bisoprolol|amlodipine/i)
})

test('second worked example: voices are grouped, one click assigns roles, the note is rebuilt', async ({
  page,
}) => {
  await page.goto('/')
  await fillNewSession(page)
  await startSession(page)
  await page.getByTestId('audio-file').setInputFiles({
    name: 'example.webm',
    mimeType: 'audio/webm',
    buffer: Buffer.from('MOCKCASE:example_hypertension_followup\nsynthetic'),
  })
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })

  // Everyone starts as Unknown; the voice panel offers a one-step mapping
  await expect(page.getByLabel('Speaker of segment s-001')).toHaveValue('unknown')
  await expect(page.getByTestId('voice-panel')).toContainText('Voices detected: 2')
  await page.getByLabel('Role for voice 1').selectOption('doctor')
  await page.getByLabel('Role for voice 2').selectOption('patient')
  await page.getByRole('button', { name: /apply roles/i }).click()

  // The note is rebuilt: spoken numbers understood, each medicine keeps its own dose, no false alarms
  await expect(page.getByTestId('item-f-001')).toBeVisible()
  await expect(page.getByText('Amlodipine 5 mg once daily')).toBeVisible()
  await expect(page.getByText('Metformin 500 mg twice daily')).toBeVisible()
  await expect(page.getByText('Allergy: penicillin (patient-reported)')).toBeVisible()
  await expect(page.getByText('BP 160/100 mmHg')).toBeVisible()
  await expect(page.getByText('Ramipril 5 mg orally once daily')).toBeVisible()
  await expect(page.getByText('Review in 4 weeks')).toBeVisible()
  await expect(page.getByLabel('Speaker of segment s-001')).toHaveValue('doctor')
  await expect(page.getByLabel('Speaker of segment s-002')).toHaveValue('patient')
  // Nothing is incomplete, so Preview is open straight away and the note can be approved
  await expect(page.getByRole('button', { name: /continue to preview/i })).toBeEnabled()
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText(
    'Ramipril 5 mg orally once daily',
  )
  await tickFinalReview(page)
  await expect(page.getByRole('button', { name: 'Approve note' })).toBeEnabled()
})

test('patient details can be corrected in Review and the correction reaches the preview', async ({
  page,
}) => {
  await goToReview(page)
  await page.getByRole('button', { name: /edit patient details/i }).click()
  await page.getByLabel(/full name/i).fill('Ronald Kato Corrected (FICTIONAL)')
  await page.getByLabel(/^Age/).fill('59')
  await page.getByRole('button', { name: /save patient details/i }).click()
  await expect(page.getByTestId('patient-summary')).toContainText(
    'Ronald Kato Corrected (FICTIONAL) · 59',
  )
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toContainText(
    'Ronald Kato Corrected (FICTIONAL)',
  )
  await expect(page.getByLabel('Rendered note preview')).toContainText('59 · Male')
})

test('a PDF can be downloaded (no LibreOffice needed) with the patient details in it', async ({
  page,
}) => {
  await goToReview(page)
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  await tickFinalReview(page)
  await page.getByRole('button', { name: 'Approve note' }).click()
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-file').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^consultation_note_\d{4}-\d{2}-\d{2}_\d{4}\.pdf$/)
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(bytes.toString('latin1')).toContain('Ronald Kato')
  await expect(page.getByTestId('download-status')).toBeVisible()
})
