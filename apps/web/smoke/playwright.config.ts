import { defineConfig, devices } from '@playwright/test'

// Logged-out smoke suite for apps/web: a production `next start` (so build the app
// first) against the integration-test database, seeded with one profile and a couple
// of jams by global-setup.ts. Run from the repo root with `pnpm test:smoke` (which
// builds) or `pnpm exec playwright test -c apps/web/smoke` to reuse an existing build.

const PORT = Number(process.env.SMOKE_PORT ?? 3456)

export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  // One worker, files in order: the last test reads the server log the others produced.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
