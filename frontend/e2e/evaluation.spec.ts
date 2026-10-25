// Phase 6: evaluation mode records content-free metrics. This run is an AUTOMATED walk-through, so
// its timings are not clinician review times; the file is a sample of the metrics format.
import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  fillNewSession,
  handleAllHigh,
  startSession,
  approveAndDownload,
  startMic,
} from './helpers'

test('evaluation mode exposes content-free metrics (and is off by default)', async ({ page }) => {
  // Off by default: no hook is exposed
  await page.goto('/')
  expect(await page.evaluate(() => '__mediscribeEval' in window)).toBe(false)

  await page.goto('/?eval=1')
  expect(await page.evaluate(() => '__mediscribeEval' in window)).toBe(true)
  await fillNewSession(page)
  await startSession(page)
  await startMic(page)
  await page.getByRole('button', { name: /stop & process/i }).click()
  await expect(page.getByRole('heading', { name: 'Clinical note' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByTestId('add-exam').click()
  await page.getByLabel('New exam finding').fill('Mild bilateral pitting ankle oedema')
  await page.getByLabel('New exam finding').press('Enter')
  await handleAllHigh(page)
  await page.getByRole('button', { name: /continue to preview/i }).click()
  await expect(page.getByLabel('Rendered note preview')).toBeVisible()
  await approveAndDownload(page)
  await expect(page.getByTestId('eval-panel')).toBeVisible()

  const metrics = await page.evaluate(() =>
    (
      window as unknown as { __mediscribeEval: { snapshot: () => unknown } }
    ).__mediscribeEval.snapshot(),
  )
  const json = JSON.stringify(metrics)
  for (const forbidden of [
    'Kato',
    'Ronald',
    'chest',
    'oedema',
    'Bisoprolol',
    'Amlodipine',
    'OPD-07',
  ]) {
    expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase())
  }
  expect(metrics).toMatchObject({
    schema: 1,
    items_added: 1,
    high_items_opened: 2,
    approvals: 1,
    review_items_by_level: { HIGH: 2, CHECK: 2, INFO: 1 },
  })
  writeFileSync('../docs/evaluation/sample_metrics.json', JSON.stringify(metrics, null, 2) + '\n')
})
