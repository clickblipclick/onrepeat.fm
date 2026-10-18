import { test as base, expect } from '@playwright/test'

import type { SeedInfo } from './seed'

export { expect }

interface SmokeFixtures {
  /** What global-setup.ts seeded, handed to the workers through the environment. */
  seed: SeedInfo
  browserErrors: string[]
}

export const test = base.extend<SmokeFixtures>({
  seed: async ({}, use) => {
    const raw = process.env.SMOKE_SEED
    if (!raw) throw new Error('SMOKE_SEED is unset — did global-setup.ts run?')
    await use(JSON.parse(raw) as SeedInfo)
  },

  // Automatic: collects browser console errors and uncaught page errors for the
  // duration of each test and fails the test if any were recorded. React 19 reports
  // hydration mismatches through `reportError` (a page error) in production builds,
  // so both channels matter.
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        // A deliberate error page (the 404 test) makes the browser log the document's
        // own status; the test asserts on that status directly. Failed subresources
        // (a missing chunk, say) have a different URL and still count.
        if (
          msg.location().url === page.url() &&
          msg.text().startsWith('Failed to load resource')
        )
          return
        errors.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      await use(errors)
      expect(errors, 'browser console / page errors').toEqual([])
    },
    { auto: true },
  ],
})
