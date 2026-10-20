import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

// Two servers: the FastAPI backend (mock providers, synthetic data) and the built frontend, which
// proxies /api to it. The installed Chrome is used with a fake microphone: no browser download.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: [
    {
      command: '.venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: '../backend',
      env: {
        DEV_AUTH_ENABLED: 'true', // lets most specs use the demo sign-in; accounts.spec.ts uses real accounts
        ACCOUNTS_FILE: join(tmpdir(), `mediscribe-e2e-accounts-${Date.now()}.json`),
      },
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
